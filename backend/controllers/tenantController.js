const pool = require('../config/database');
const fs = require('fs');

// Get all tenants with agent data isolation
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

    // Add agent property assignment filter only for agents
    if (req.user.role === 'agent') {
      query += ` 
        INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $${queryParams.length + 1} 
        AND apa.is_active = true
      `;
      countQuery += ` 
        LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
        LEFT JOIN property_units pu ON ta.unit_id = pu.id
        LEFT JOIN properties p ON pu.property_id = p.id
        INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $1 
        AND apa.is_active = true
      `;
      queryParams.push(req.user.id);
      countParams.push(req.user.id);

      if (search) {
        const searchCondition = ` AND (t.first_name ILIKE $${queryParams.length + 1} OR t.last_name ILIKE $${queryParams.length + 1} OR t.phone_number ILIKE $${queryParams.length + 1} OR t.national_id ILIKE $${queryParams.length + 1})`;
        query += searchCondition;
        countQuery += ` AND (t.first_name ILIKE $2 OR t.last_name ILIKE $2 OR t.phone_number ILIKE $2 OR t.national_id ILIKE $2)`;
        queryParams.push(`%${search}%`);
        countParams.push(`%${search}%`);
      }
    } else {
      // Admin sees all tenants (original logic)
      if (search) {
        const searchCondition = ` WHERE (t.first_name ILIKE $${queryParams.length + 1} OR t.last_name ILIKE $${queryParams.length + 1} OR t.phone_number ILIKE $${queryParams.length + 1} OR t.national_id ILIKE $${queryParams.length + 1})`;
        query += searchCondition;
        countQuery += searchCondition;
        queryParams.push(`%${search}%`);
        countParams.push(`%${search}%`);
      }
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

// Get tenant by ID with agent data isolation
const getTenant = async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
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

    const queryParams = [id];

    // Add agent property assignment filter only for agents
    if (req.user.role === 'agent') {
      query += ` 
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $2 
          AND apa.is_active = true
        )
      `;
      queryParams.push(req.user.id);
    }

    const { rows } = await pool.query(query, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found or not accessible'
      });
    }

    // Get payment history (only accessible if tenant is accessible)
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

// Format phone number to 254 format
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Convert to 254 format
  if (digits.startsWith('0')) {
    return '254' + digits.substring(1);
  } else if (digits.startsWith('254')) {
    return digits;
  } else if (digits.startsWith('+254')) {
    return digits.substring(1);
  } else {
    return '254' + digits;
  }
};

// Create new tenant with agent property validation
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

    console.log('Creating tenant with data:', req.body);

    // Validate required fields
    if (!national_id || !first_name || !last_name || !phone_number) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: national_id, first_name, last_name, phone_number'
      });
    }

    // Format phone numbers
    const formattedPhone = formatPhoneNumber(phone_number);
    const formattedEmergencyPhone = emergency_contact_phone ? formatPhoneNumber(emergency_contact_phone) : null;

    console.log('Formatted phone:', formattedPhone);

    // Check if national ID already exists
    const existingNationalId = await client.query(
      'SELECT id FROM tenants WHERE national_id = $1',
      [national_id]
    );
    
    if (existingNationalId.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Tenant with this national ID already exists'
      });
    }

    // Check if phone number already exists
    const existingPhone = await client.query(
      'SELECT id FROM tenants WHERE phone_number = $1',
      [formattedPhone]
    );
    
    if (existingPhone.rows.length > 0) {
      await client.query('ROLLBACK');
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
        formattedPhone,
        emergency_contact_name,
        formattedEmergencyPhone,
        req.user.id
      ]
    );

    console.log('Tenant created:', tenantResult.rows[0]);

    // If unit_id is provided, create tenant allocation
    if (unit_id) {
      if (!lease_start_date || !monthly_rent) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Missing required fields for allocation: lease_start_date, monthly_rent'
        });
      }

      // Check if unit is available with agent property assignment validation
      let unitCheckQuery = `
        SELECT pu.id, pu.is_occupied, pu.property_id
        FROM property_units pu
        WHERE pu.id = $1
      `;
      
      const unitCheckParams = [unit_id];

      // If user is agent, check if they're assigned to this property
      if (req.user.role === 'agent') {
        unitCheckQuery += `
          AND EXISTS (
            SELECT 1 FROM agent_property_assignments apa 
            WHERE apa.property_id = pu.property_id 
            AND apa.agent_id = $2 
            AND apa.is_active = true
          )
        `;
        unitCheckParams.push(req.user.id);
      }

      const unitCheck = await client.query(unitCheckQuery, unitCheckParams);

      if (unitCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(req.user.role === 'agent' ? 403 : 404).json({
          success: false,
          message: req.user.role === 'agent' 
            ? 'Unit not found or you are not assigned to this property' 
            : 'Unit not found'
        });
      }

      if (unitCheck.rows[0].is_occupied) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Unit is already occupied'
        });
      }

      // Create tenant allocation - FIXED: Use allocated_by instead of created_by
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

// Update tenant with agent property validation
const updateTenant = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

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

    // Check if tenant exists with agent property validation
    let tenantCheckQuery = `
      SELECT t.id, t.first_name, t.last_name, p.id as property_id
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE t.id = $1
    `;
    
    const tenantCheckParams = [id];

    // If user is agent, check if they're assigned to this tenant's property
    if (req.user.role === 'agent') {
      tenantCheckQuery += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $2 
          AND apa.is_active = true
        )
      `;
      tenantCheckParams.push(req.user.id);
    }

    const tenantCheck = await client.query(tenantCheckQuery, tenantCheckParams);

    if (tenantCheck.rows.length === 0) {
      return res.status(req.user.role === 'agent' ? 403 : 404).json({
        success: false,
        message: req.user.role === 'agent' 
          ? 'Tenant not found or you are not assigned to this property' 
          : 'Tenant not found'
      });
    }

    // Check for duplicate national ID
    if (national_id) {
      const existingNationalId = await client.query(
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
      const formattedPhone = formatPhoneNumber(phone_number);
      const existingPhone = await client.query(
        'SELECT id FROM tenants WHERE phone_number = $1 AND id != $2',
        [formattedPhone, id]
      );
      
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Another tenant with this phone number already exists'
        });
      }
    }

    // Format phone numbers if provided
    const formattedPhone = phone_number ? formatPhoneNumber(phone_number) : undefined;
    const formattedEmergencyPhone = emergency_contact_phone ? formatPhoneNumber(emergency_contact_phone) : undefined;

    const result = await client.query(
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
        formattedPhone,
        emergency_contact_name,
        formattedEmergencyPhone,
        is_active,
        id
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Tenant updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
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
  } finally {
    client.release();
  }
};

// Delete tenant with agent property validation
const deleteTenant = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Check if tenant exists with agent property validation
    let tenantCheckQuery = `
      SELECT t.id, t.first_name, t.last_name, p.id as property_id
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE t.id = $1
    `;
    
    const tenantCheckParams = [id];

    // If user is agent, check if they're assigned to this tenant's property
    if (req.user.role === 'agent') {
      tenantCheckQuery += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $2 
          AND apa.is_active = true
        )
      `;
      tenantCheckParams.push(req.user.id);
    }

    const tenantCheck = await client.query(tenantCheckQuery, tenantCheckParams);

    if (tenantCheck.rows.length === 0) {
      return res.status(req.user.role === 'agent' ? 403 : 404).json({
        success: false,
        message: req.user.role === 'agent' 
          ? 'Tenant not found or you are not assigned to this property' 
          : 'Tenant not found'
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

// Get available units for tenant allocation with agent property validation
const getAvailableUnits = async (req, res) => {
  try {
     const { tenant_id } = req.query; // Optional: get tenant ID if editing
    const agentId = req.user.id;

    let query = `
      SELECT pu.*, p.name as property_name, p.property_code
      FROM property_units pu
      JOIN properties p ON pu.property_id = p.id
      WHERE pu.is_active = true 
      AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)`;

    const params = [agentId];

    if (tenant_id) {
      // When editing a tenant, include their current unit even if occupied
      query += ` AND (pu.is_occupied = false OR pu.id IN (
        SELECT unit_id FROM tenant_allocations 
        WHERE tenant_id = $2 AND is_active = true
      ))`;
      params.push(tenant_id);
    } else {
      // When creating new tenant, only show unoccupied units
      query += ` AND pu.is_occupied = false`;
    }

    query += ` ORDER BY p.name, pu.unit_number`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching available units:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching available units'
    });
  }
};
const uploadIDImages = async (req, res) => {
  const { id } = req.params;

  try {
    // Validate files were uploaded (via the middleware)
    if (!req.files || (!req.files.id_front_image && !req.files.id_back_image)) {
      return res.status(400).json({
        success: false,
        message: "At least one ID image (front or back) is required"
      });
    }

    const updateFields = {};
    const values = [];
    let querySetPart = '';
    let paramCount = 1;

    // Process front ID image (now a Cloudinary object)
    if (req.files.id_front_image) {
      const frontFile = req.files.id_front_image[0];
      // Store the secure URL from Cloudinary
      updateFields.id_front_image = frontFile.path; // This is the Cloudinary URL
      querySetPart += `id_front_image = $${paramCount}, `;
      values.push(updateFields.id_front_image);
      paramCount++;
    }

    // Process back ID image
    if (req.files.id_back_image) {
      const backFile = req.files.id_back_image[0];
      updateFields.id_back_image = backFile.path; // Cloudinary URL
      querySetPart += `id_back_image = $${paramCount}, `;
      values.push(updateFields.id_back_image);
      paramCount++;
    }
  

    // Remove trailing comma and space from the SET clause
    querySetPart = querySetPart.slice(0, -2);

    // Add the tenant ID as the last parameter
    values.push(id);

    // Update the tenant record in the database
    const query = `
      UPDATE tenants 
      SET ${querySetPart}
      WHERE id = $${paramCount}
      RETURNING id, national_id, id_front_image, id_back_image
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      // If the tenant wasn't found, we should clean up the uploaded files
      if (req.files.id_front_image) {
        fs.unlinkSync(req.files.id_front_image[0].path);
      }
      if (req.files.id_back_image) {
        fs.unlinkSync(req.files.id_back_image[0].path);
      }
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

  } catch (error) {
    console.error('Error uploading ID images to Cloudinary:', error);
    // Error handling (no file cleanup needed)
    res.status(500).json({
      success: false,
      message: "Server error uploading ID images",
    });
  }
};

module.exports = {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  deleteTenant,
  getAvailableUnits,
  uploadIDImages 
};