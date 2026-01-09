// backend/controllers/waterBillController.js
const db = require('../config/database');

/**
 * Helper: check if agent manages the property
 */
const agentManagesProperty = async (agentId, propertyId) => {
  const res = await db.query(
    `SELECT 1 FROM agent_property_assignments 
     WHERE agent_id = $1 AND property_id = $2 AND is_active = true`,
    [agentId, propertyId]
  );
  return res.rows.length > 0;
};

/**
 * Create or update (upsert) a water bill for tenant/month.
 * Request body: { tenantId, unitId, propertyId, amount, billMonth (YYYY-MM), notes }
 */
const createWaterBill = async (req, res) => {
  try {
    const agentId = req.user.id;
    let { tenantId, tenantName, unitId = null, propertyId, amount, billMonth, notes = null } = req.body;

    if (!tenantId || !propertyId || !amount || !billMonth) {
      // tenantId is optional if tenantName provided; check specifically
      if (!propertyId || !amount || !billMonth) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }
    }

    // If tenantId not provided but tenantName is, try to find tenant
    if (!tenantId && tenantName) {
      try {
        const namePattern = tenantName.trim();
        const findQuery = `
          SELECT id, first_name, last_name FROM tenants 
          WHERE (first_name || ' ' || last_name) ILIKE $1
          LIMIT 2
        `;
        const found = await db.query(findQuery, [`${namePattern}`]);
        if (found.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Tenant not found. Please ensure tenant exists in system or provide tenantId.' });
        }
        if (found.rows.length > 1) {
          return res.status(400).json({ success: false, message: 'Tenant name is ambiguous. Provide a tenant ID or precise name.' });
        }
        tenantId = found.rows[0].id;
      } catch (err) {
        console.error('Error resolving tenantName:', err);
        return res.status(500).json({ success: false, message: 'Failed to resolve tenant name', error: err.message });
      }
    }

    // Validate agent has access (admin bypasses)
    if (req.user.role !== 'admin') {
      const ok = await agentManagesProperty(agentId, propertyId);
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Agent not assigned to this property' });
      }
    }

    const billDate = `${billMonth}-01`; // store as date

    const result = await db.query(
      `INSERT INTO water_bills (tenant_id, unit_id, property_id, agent_id, amount, bill_month, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (tenant_id, bill_month)
       DO UPDATE SET amount = EXCLUDED.amount, notes = EXCLUDED.notes, agent_id = EXCLUDED.agent_id, created_at = NOW()
       RETURNING *;`,
      [tenantId, unitId, propertyId, agentId, amount, billDate, notes]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('❌ createWaterBill error:', err);
    res.status(500).json({ success: false, message: 'Failed to create water bill', error: err.message });
  }
};

// Add this function to waterBillController.js (after existing functions)

/**
 * Check which tenants are missing water bills for a specific month
 * Query params: month (YYYY-MM), propertyId (optional)
 */
const checkMissingWaterBills = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { month, propertyId } = req.query;

    if (!month) {
      return res.status(400).json({ 
        success: false, 
        message: 'Month parameter required (YYYY-MM)' 
      });
    }

    const targetDate = `${month}-01`;

    // Base query for active tenants
    let query = `
      SELECT 
        ta.tenant_id,
        t.first_name,
        t.last_name,
        t.phone_number,
        pu.unit_code,
        p.name as property_name,
        EXISTS(
          SELECT 1 FROM water_bills wb 
          WHERE wb.tenant_id = ta.tenant_id 
          AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $1::date)
        ) as has_water_bill
      FROM tenant_allocations ta
      JOIN tenants t ON ta.tenant_id = t.id
      JOIN property_units pu ON ta.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
      WHERE ta.is_active = true
    `;

    const params = [targetDate];
    let paramCount = 1;

    // Add agent property filtering for non-admin users
    if (req.user.role !== 'admin') {
      paramCount++;
      query += ` AND p.id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${paramCount} AND is_active = true
      )`;
      params.push(agentId);
    }

    // Add property filter if specified
    if (propertyId) {
      paramCount++;
      query += ` AND p.id = $${paramCount}`;
      params.push(propertyId);
    }

    query += ` ORDER BY p.name, pu.unit_code`;

    const result = await pool.query(query, params);
    
    const tenants = result.rows;
    const tenantsWithBills = tenants.filter(t => t.has_water_bill);
    const tenantsWithoutBills = tenants.filter(t => !t.has_water_bill);

    res.json({
      success: true,
      data: {
        month,
        totalTenants: tenants.length,
        tenantsWithWaterBills: tenantsWithBills.length,
        tenantsWithoutWaterBills: tenantsWithoutBills.length,
        tenantsWithoutBills: tenantsWithoutBills.map(t => ({
          tenantId: t.tenant_id,
          name: `${t.first_name} ${t.last_name}`,
          phone: t.phone_number,
          unitCode: t.unit_code,
          propertyName: t.property_name
        })),
        summary: {
          total: tenants.length,
          withBills: tenantsWithBills.length,
          withoutBills: tenantsWithoutBills.length,
          percentageWithBills: tenants.length > 0 ? 
            Math.round((tenantsWithBills.length / tenants.length) * 100) : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Error checking missing water bills:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check missing water bills',
      error: error.message
    });
  }
};
/**
 * List water bills for agent (scoped to properties they manage).
 * Query params: propertyId, tenantId, month (YYYY-MM), limit, offset
 */
const listWaterBills = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { propertyId, tenantId, month, limit = 50, offset = 0 } = req.query;

    const params = [agentId];
    let where = `
      WHERE wb.property_id IN (
        SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true
      )
    `;

    if (propertyId) {
      params.push(propertyId);
      where += ` AND wb.property_id = $${params.length}`;
    }
    if (tenantId) {
      params.push(tenantId);
      where += ` AND wb.tenant_id = $${params.length}`;
    }
    if (month) {
      params.push(`${month}-01`);
      where += ` AND wb.bill_month = $${params.length}`;
    }

    // Pagination
    params.push(parseInt(limit, 10));
    params.push(parseInt(offset, 10));

    const query = `
      SELECT wb.*, t.first_name, t.last_name, pu.unit_code, p.name as property_name, u.first_name AS agent_first, u.last_name AS agent_last
      FROM water_bills wb
      LEFT JOIN tenants t ON t.id = wb.tenant_id
      LEFT JOIN property_units pu ON pu.id = wb.unit_id
      LEFT JOIN properties p ON p.id = wb.property_id
      LEFT JOIN users u ON u.id = wb.agent_id
      ${where}
      ORDER BY wb.bill_month DESC, wb.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const { rows } = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('❌ listWaterBills error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch water bills', error: err.message });
  }
};

/**
 * Get a single water bill by id (agent must manage property)
 */
const getWaterBill = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { id } = req.params;

    const result = await db.query(`
      SELECT wb.*, p.name as property_name
      FROM water_bills wb
      JOIN properties p ON p.id = wb.property_id
      WHERE wb.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Water bill not found' });
    }

    const bill = result.rows[0];

    // Verify agent manages this property (admin bypass)
    if (req.user.role !== 'admin') {
      const ok = await agentManagesProperty(agentId, bill.property_id);
      if (!ok) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: bill });
  } catch (err) {
    console.error('❌ getWaterBill error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch water bill', error: err.message });
  }
};

/**
 * Delete a water bill (soft/hard — here hard delete)
 */
const deleteWaterBill = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { id } = req.params;

    // Fetch bill
    const r = await db.query('SELECT property_id, agent_id FROM water_bills WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });

    const bill = r.rows[0];
    if (req.user.role !== 'admin') {
      const ok = await agentManagesProperty(agentId, bill.property_id);
      if (!ok) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await db.query('DELETE FROM water_bills WHERE id = $1', [id]);
    res.json({ success: true, message: 'Water bill deleted' });
  } catch (err) {
    console.error('❌ deleteWaterBill error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete water bill', error: err.message });
  }
};

module.exports = {
  createWaterBill,
  listWaterBills,
  getWaterBill,
  deleteWaterBill,
  checkMissingWaterBills
};