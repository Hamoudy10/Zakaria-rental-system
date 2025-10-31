const pool = require('../config/database');

// Get all tenants
const getTenants = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        t.*,
        COUNT(*) OVER() as total_count,
        ta.unit_id,
        pu.unit_code,
        pu.unit_number,
        p.name as property_name,
        p.property_code,
        u.first_name as created_by_name
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
    `;

    let countQuery = `SELECT COUNT(*) FROM tenants t`;
    const queryParams = [];
    const countParams = [];

    if (search) {
      const searchCondition = `
        WHERE (t.first_name ILIKE $1 OR t.last_name ILIKE $1 OR t.phone_number ILIKE $1 OR t.national_id ILIKE $1)
      `;
      query += searchCondition;
      countQuery += searchCondition;
      queryParams.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);
    const countResult = await pool.query(countQuery, countParams);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        tenants: result.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tenants',
      error: error.message
    });
  }
};

// Get tenant by ID
const getTenant = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        t.*,
        ta.unit_id,
        pu.unit_code,
        pu.unit_number,
        p.name as property_name,
        p.property_code,
        ta.lease_start_date,
        ta.lease_end_date,
        ta.monthly_rent,
        ta.security_deposit,
        u.first_name as created_by_name
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Get payment history
    const paymentsQuery = `
      SELECT * FROM rent_payments 
      WHERE tenant_id = $1 
      ORDER BY payment_month DESC, created_at DESC 
      LIMIT 12
    `;
    const paymentsResult = await pool.query(paymentsQuery, [id]);

    res.json({
      success: true,
      data: {
        ...rows[0],
        paymentHistory: paymentsResult.rows
      }
    });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tenant',
      error: error.message
    });
  }
};

// Create new tenant
const createTenant = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      emergency_contact_name,
      emergency_contact_phone,
      unit_id,
      lease_start_date,
      lease_end_date,
      monthly_rent,
      security_deposit
    } = req.body;

    // Validate required fields
    if (!national_id || !first_name || !last_name || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: national_id, first_name, last_name, phone_number'
      });
    }

    // Check if national ID already exists
    const existingNationalId = await client.query(
      'SELECT id FROM tenants WHERE national_id = $1',
      [national_id]
    );
    
    if (existingNationalId.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this national ID already exists'
      });
    }

    // Check if phone number already exists
    const existingPhone = await client.query(
      'SELECT id FROM tenants WHERE phone_number = $1',
      [phone_number]
    );
    
    if (existingPhone.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this phone number already exists'
      });
    }

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants 
        (national_id, first_name, last_name, email, phone_number, 
         emergency_contact_name, emergency_contact_phone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        national_id,
        first_name,
        last_name,
        email,
        phone_number,
        emergency_contact_name,
        emergency_contact_phone,
        req.user.id
      ]
    );

    // If unit_id is provided, create tenant allocation
    if (unit_id) {
      if (!lease_start_date || !monthly_rent) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields for allocation: lease_start_date, monthly_rent'
        });
      }

      // Check if unit is available
      const unitCheck = await client.query(
        `SELECT id, is_occupied FROM property_units WHERE id = $1`,
        [unit_id]
      );

      if (unitCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Unit not found'
        });
      }

      if (unitCheck.rows[0].is_occupied) {
        return res.status(400).json({
          success: false,
          message: 'Unit is already occupied'
        });
      }

      // Create tenant allocation
      await client.query(
        `INSERT INTO tenant_allocations 
          (tenant_id, unit_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, allocated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantResult.rows[0].id,
          unit_id,
          lease_start_date,
          lease_end_date,
          monthly_rent,
          security_deposit || 0,
          req.user.id
        ]
      );

      // Mark unit as occupied
      await client.query(
        `UPDATE property_units SET is_occupied = true WHERE id = $1`,
        [unit_id]
      );

      // Update property available units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units - 1 
         WHERE id = (SELECT property_id FROM property_units WHERE id = $1)`,
        [unit_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: tenantResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create tenant error:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this national ID, phone, or email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error creating tenant',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Update tenant
const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      emergency_contact_name,
      emergency_contact_phone,
      is_active
    } = req.body;

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id FROM tenants WHERE id = $1',
      [id]
    );

    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check for duplicate national ID
    if (national_id) {
      const existingNationalId = await pool.query(
        'SELECT id FROM tenants WHERE national_id = $1 AND id != $2',
        [national_id, id]
      );
      
      if (existingNationalId.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Another tenant with this national ID already exists'
        });
      }
    }

    // Check for duplicate phone number
    if (phone_number) {
      const existingPhone = await pool.query(
        'SELECT id FROM tenants WHERE phone_number = $1 AND id != $2',
        [phone_number, id]
      );
      
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Another tenant with this phone number already exists'
        });
      }
    }

    const result = await pool.query(
      `UPDATE tenants 
       SET national_id = COALESCE($1, national_id),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           email = COALESCE($4, email),
           phone_number = COALESCE($5, phone_number),
           emergency_contact_name = COALESCE($6, emergency_contact_name),
           emergency_contact_phone = COALESCE($7, emergency_contact_phone),
           is_active = COALESCE($8, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        national_id,
        first_name,
        last_name,
        email,
        phone_number,
        emergency_contact_name,
        emergency_contact_phone,
        is_active,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Tenant updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update tenant error:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Another tenant with this national ID, phone, or email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error updating tenant',
      error: error.message
    });
  }
};

// Delete tenant
const deleteTenant = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Check if tenant exists
    const tenantCheck = await client.query(
      'SELECT id, first_name, last_name FROM tenants WHERE id = $1',
      [id]
    );

    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check if tenant has active allocations
    const activeAllocations = await client.query(
      `SELECT id FROM tenant_allocations WHERE tenant_id = $1 AND is_active = true`,
      [id]
    );

    if (activeAllocations.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tenant with active allocations. Please deallocate first.'
      });
    }

    // Delete tenant
    await client.query('DELETE FROM tenants WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Tenant ${tenantCheck.rows[0].first_name} ${tenantCheck.rows[0].last_name} deleted successfully`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete tenant error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error deleting tenant',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get available units for tenant allocation
const getAvailableUnits = async (req, res) => {
  try {
    const query = `
      SELECT 
        pu.*,
        p.name as property_name,
        p.property_code,
        p.address
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE pu.is_occupied = false AND pu.is_active = true
      ORDER BY p.name, pu.unit_number
    `;

    const { rows } = await pool.query(query);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get available units error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching available units',
      error: error.message
    });
  }
};

module.exports = {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  deleteTenant,
  getAvailableUnits
};