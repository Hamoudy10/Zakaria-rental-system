// backend/controllers/waterBillController.js
const db = require('../config/database');
const NotificationService = require("../services/notificationService");
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
    let {
      tenantId,
      tenantName,
      unitId = null,
      propertyId,
      amount,
      billMonth,
      notes = null,
    } = req.body;

    if (!tenantId || !propertyId || !amount || !billMonth) {
      if (!propertyId || !amount || !billMonth) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
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
          return res
            .status(404)
            .json({
              success: false,
              message:
                "Tenant not found. Please ensure tenant exists in system or provide tenantId.",
            });
        }
        if (found.rows.length > 1) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Tenant name is ambiguous. Provide a tenant ID or precise name.",
            });
        }
        tenantId = found.rows[0].id;
      } catch (err) {
        console.error("Error resolving tenantName:", err);
        return res
          .status(500)
          .json({
            success: false,
            message: "Failed to resolve tenant name",
            error: err.message,
          });
      }
    }

    // Validate agent has access (admin bypasses)
    if (req.user.role !== "admin") {
      const ok = await agentManagesProperty(agentId, propertyId);
      if (!ok) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Agent not assigned to this property",
          });
      }
    }

    const billDate = `${billMonth}-01`; // store as date

    const result = await db.query(
      `INSERT INTO water_bills (tenant_id, unit_id, property_id, agent_id, amount, bill_month, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (tenant_id, bill_month)
       DO UPDATE SET amount = EXCLUDED.amount, notes = EXCLUDED.notes, agent_id = EXCLUDED.agent_id, created_at = NOW()
       RETURNING *;`,
      [tenantId, unitId, propertyId, agentId, amount, billDate, notes],
    );

    const waterBill = result.rows[0];

    // ============================================================
    // NEW: SEND NOTIFICATIONS FOR WATER BILL CREATION
    // ============================================================
    try {
      // Get tenant and unit details for notification
      const detailsQuery = await db.query(
        `SELECT 
          t.id as tenant_id,
          t.first_name,
          t.last_name,
          pu.unit_code,
          p.name as property_name
        FROM tenants t
        LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
        LEFT JOIN property_units pu ON ta.unit_id = pu.id
        LEFT JOIN properties p ON pu.property_id = p.id
        WHERE t.id = $1`,
        [tenantId],
      );

      if (detailsQuery.rows.length > 0) {
        const details = detailsQuery.rows[0];
        const tenantFullName = `${details.first_name} ${details.last_name}`;
        const unitCode = details.unit_code || "N/A";

        // Format month for display (e.g., "January 2025")
        const billMonthDate = new Date(billDate);
        const formattedMonth = billMonthDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });

        // Format amount
        const formattedAmount = parseFloat(amount).toLocaleString("en-KE");

        // ============================================================
        // NOTIFICATION 1: Notify Tenant about Water Bill
        // ============================================================
        // Note: Tenants are in 'tenants' table, not 'users' table
        // So we check if there's a corresponding user account
        const tenantUserQuery = await db.query(
          `SELECT id FROM users WHERE email = (SELECT email FROM tenants WHERE id = $1) AND is_active = true`,
          [tenantId],
        );

        if (tenantUserQuery.rows.length > 0) {
          await NotificationService.createNotification({
            userId: tenantUserQuery.rows[0].id,
            title: "Water Bill Added",
            message: `Water bill of KSh ${formattedAmount} for ${formattedMonth} has been added to your account for unit ${unitCode}.`,
            type: "water_bill_created",
            relatedEntityType: "water_bill",
            relatedEntityId: waterBill.id,
          });
        }

        // ============================================================
        // NOTIFICATION 2: Notify All Admins about Water Bill
        // ============================================================
        const adminUsers = await db.query(
          `SELECT id FROM users WHERE role = 'admin' AND is_active = true`,
        );

        for (const admin of adminUsers.rows) {
          await NotificationService.createNotification({
            userId: admin.id,
            title: "Water Bill Recorded",
            message: `Water bill of KSh ${formattedAmount} recorded for ${tenantFullName} (${unitCode}) for ${formattedMonth}.`,
            type: "water_bill_created",
            relatedEntityType: "water_bill",
            relatedEntityId: waterBill.id,
          });
        }

        // ============================================================
        // NOTIFICATION 3: Notify Assigned Agent (if different from creator)
        // ============================================================
        const agentQuery = await db.query(
          `SELECT agent_id FROM agent_property_assignments 
           WHERE property_id = $1 AND is_active = true AND agent_id != $2`,
          [propertyId, agentId],
        );

        for (const agent of agentQuery.rows) {
          await NotificationService.createNotification({
            userId: agent.agent_id,
            title: "Water Bill Recorded",
            message: `Water bill of KSh ${formattedAmount} recorded for ${tenantFullName} (${unitCode}) for ${formattedMonth}.`,
            type: "water_bill_created",
            relatedEntityType: "water_bill",
            relatedEntityId: waterBill.id,
          });
        }

        console.log(
          `✅ Water bill notifications sent for tenant ${tenantFullName}`,
        );
      }
    } catch (notificationError) {
      // Log error but don't fail the water bill creation
      console.error(
        "❌ Failed to send water bill notifications:",
        notificationError,
      );
    }
    // ============================================================
    // END OF NOTIFICATION CODE
    // ============================================================

    res.json({ success: true, data: waterBill });
  } catch (err) {
    console.error("❌ createWaterBill error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to create water bill",
        error: err.message,
      });
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
    const userRole = req.user.role;
    const {
      propertyId,
      tenantId,
      month,
      fromDate,
      toDate,
      limit = 50,
      offset = 0,
      all = false,
    } = req.query;
    const fetchAll =
      all === true || String(all).toLowerCase() === 'true' || String(all) === '1';

    const filterParams = [];
    let where = `WHERE 1=1`;

    if (userRole !== 'admin') {
      filterParams.push(agentId);
      where += `
        AND (
          wb.property_id IN (
            SELECT property_id
            FROM agent_property_assignments
            WHERE agent_id = $1 AND is_active = true
          )
          OR wb.agent_id = $1
        )
      `;
    }

    if (propertyId) {
      filterParams.push(propertyId);
      where += ` AND wb.property_id = $${filterParams.length}`;
    }
    if (tenantId) {
      filterParams.push(tenantId);
      where += ` AND wb.tenant_id = $${filterParams.length}`;
    }
    if (month) {
      filterParams.push(`${month}-01`);
      where += ` AND wb.bill_month = $${filterParams.length}`;
    }
    if (fromDate) {
      filterParams.push(fromDate);
      where += ` AND wb.created_at::date >= $${filterParams.length}::date`;
    }
    if (toDate) {
      filterParams.push(toDate);
      where += ` AND wb.created_at::date <= $${filterParams.length}::date`;
    }

    const baseQuery = `
      SELECT wb.*, t.first_name, t.last_name, t.phone_number, pu.unit_code, p.name as property_name, u.first_name AS agent_first, u.last_name AS agent_last
      FROM water_bills wb
      LEFT JOIN tenants t ON t.id = wb.tenant_id
      LEFT JOIN property_units pu ON pu.id = wb.unit_id
      LEFT JOIN properties p ON p.id = wb.property_id
      LEFT JOIN users u ON u.id = wb.agent_id
      ${where}
      ORDER BY wb.bill_month DESC, wb.created_at DESC
    `;

    let query = baseQuery;
    let queryParams = [...filterParams];
    let pagination = null;
    if (!fetchAll) {
      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
      const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

      const countQuery = `
        SELECT COUNT(*)::int as total
        FROM water_bills wb
        ${where}
      `;
      const countResult = await db.query(countQuery, filterParams);
      const total = countResult.rows?.[0]?.total || 0;

      queryParams.push(safeLimit);
      queryParams.push(safeOffset);
      query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

      pagination = {
        total,
        limit: safeLimit,
        offset: safeOffset,
        page: Math.floor(safeOffset / safeLimit) + 1,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      };
    }

    const { rows } = await db.query(query, queryParams);
    res.json({
      success: true,
      data: rows,
      ...(pagination ? { pagination } : {}),
    });
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
 * Update a water bill
 */
const updateWaterBill = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { id } = req.params;
    const { amount, notes, billMonth, unitId, tenantId, propertyId } = req.body;

    const existingResult = await db.query(
      `SELECT * FROM water_bills WHERE id = $1`,
      [id],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Water bill not found' });
    }

    const existingBill = existingResult.rows[0];
    const nextPropertyId = propertyId || existingBill.property_id;

    if (req.user.role !== 'admin') {
      const ok = await agentManagesProperty(agentId, nextPropertyId);
      if (!ok) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const nextAmount =
      amount === undefined || amount === null || amount === ''
        ? Number(existingBill.amount)
        : Number(amount);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a valid non-negative number',
      });
    }

    let nextBillMonth = existingBill.bill_month;
    if (billMonth) {
      if (!/^\d{4}-\d{2}$/.test(String(billMonth))) {
        return res.status(400).json({
          success: false,
          message: 'billMonth must be in YYYY-MM format',
        });
      }
      nextBillMonth = `${billMonth}-01`;
    }

    const nextTenantId = tenantId || existingBill.tenant_id;
    const nextUnitId =
      Object.prototype.hasOwnProperty.call(req.body, 'unitId')
        ? unitId || null
        : existingBill.unit_id;
    const nextNotes =
      Object.prototype.hasOwnProperty.call(req.body, 'notes')
        ? notes || null
        : existingBill.notes;

    const conflictCheck = await db.query(
      `SELECT id
       FROM water_bills
       WHERE tenant_id = $1
         AND bill_month = $2::date
         AND id != $3
       LIMIT 1`,
      [nextTenantId, nextBillMonth, id],
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another water bill already exists for this tenant and month',
      });
    }

    const updateResult = await db.query(
      `UPDATE water_bills
       SET tenant_id = $1,
           unit_id = $2,
           property_id = $3,
           amount = $4,
           bill_month = $5::date,
           notes = $6,
           agent_id = $7,
           created_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        nextTenantId,
        nextUnitId,
        nextPropertyId,
        nextAmount,
        nextBillMonth,
        nextNotes,
        agentId,
        id,
      ],
    );

    return res.json({
      success: true,
      message: 'Water bill updated successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error('❌ updateWaterBill error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update water bill',
      error: err.message,
    });
  }
};

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

const normalizeMonthDate = (monthInput) => {
  if (!monthInput) return null;
  const raw = String(monthInput).trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const month = d.toISOString().slice(0, 7);
      return `${month}-01`;
    }
  }
  return null;
};

const createWaterExpense = async (req, res) => {
  try {
    const actorId = req.user.id;
    if (req.user.role !== "agent") {
      return res.status(403).json({
        success: false,
        message: "Only agents can record water delivery expenses",
      });
    }

    const {
      propertyId,
      vendorName,
      supplierOrganization = null,
      amount,
      expenseDate,
      billMonth,
      paymentMethod = "cash",
      paymentReference = null,
      mpesaReference = null,
      litersDelivered = null,
      notes = null,
    } = req.body || {};

    if (!propertyId || !vendorName || amount === undefined || !billMonth) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: propertyId, vendorName, amount, billMonth",
      });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    const normalizedPaymentMethod = String(paymentMethod || "cash")
      .trim()
      .toLowerCase();
    if (!["cash", "mpesa"].includes(normalizedPaymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "paymentMethod must be either 'cash' or 'mpesa'",
      });
    }

    const normalizedBillMonth = normalizeMonthDate(billMonth);
    if (!normalizedBillMonth) {
      return res.status(400).json({
        success: false,
        message: "billMonth must be YYYY-MM or YYYY-MM-DD",
      });
    }

    let normalizedExpenseDate = null;
    if (expenseDate) {
      const parsedDate = new Date(expenseDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "expenseDate must be a valid date",
        });
      }
      normalizedExpenseDate = parsedDate.toISOString().slice(0, 10);
    }

    const ok = await agentManagesProperty(actorId, propertyId);
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: "Agent not assigned to this property",
      });
    }

    const finalPaymentReference =
      paymentReference !== null && paymentReference !== undefined
        ? String(paymentReference).trim() || null
        : mpesaReference
          ? String(mpesaReference).trim()
          : null;

    const finalMpesaReference =
      normalizedPaymentMethod === "mpesa" ? finalPaymentReference : null;

    const result = await db.query(
      `INSERT INTO water_delivery_expenses (
         property_id, recorded_by, vendor_name, amount, expense_date,
         bill_month, payment_method, payment_reference, mpesa_reference,
         supplier_organization, liters_delivered, notes
       ) VALUES (
         $1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE),
         $6::date, $7, $8, $9, $10, $11, $12
       )
       RETURNING *`,
      [
        propertyId,
        actorId,
        String(vendorName).trim(),
        parsedAmount,
        normalizedExpenseDate,
        normalizedBillMonth,
        normalizedPaymentMethod,
        finalPaymentReference,
        finalMpesaReference,
        supplierOrganization ? String(supplierOrganization).trim() : null,
        litersDelivered !== null && litersDelivered !== undefined
          ? Number(litersDelivered)
          : null,
        notes ? String(notes).trim() : null,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Water delivery expense recorded",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("createWaterExpense error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to record water delivery expense",
      error: error.message,
    });
  }
};

const listWaterExpenses = async (req, res) => {
  try {
    const actorId = req.user.id;
    const {
      propertyId,
      billMonth,
      fromDate,
      toDate,
      limit = 50,
      offset = 0,
      all = false,
    } = req.query;

    const fetchAll =
      all === true || String(all).toLowerCase() === "true" || String(all) === "1";
    const params = [];
    let where = "WHERE wde.is_active = true";

    if (req.user.role !== "admin") {
      params.push(actorId);
      where += ` AND wde.property_id IN (
        SELECT property_id
        FROM agent_property_assignments
        WHERE agent_id = $${params.length} AND is_active = true
      )`;
    }

    if (propertyId) {
      params.push(propertyId);
      where += ` AND wde.property_id = $${params.length}`;
    }

    if (billMonth) {
      const normalizedBillMonth = normalizeMonthDate(billMonth);
      if (!normalizedBillMonth) {
        return res.status(400).json({
          success: false,
          message: "billMonth must be YYYY-MM or YYYY-MM-DD",
        });
      }
      params.push(normalizedBillMonth);
      where += ` AND wde.bill_month = $${params.length}::date`;
    }

    if (fromDate) {
      params.push(fromDate);
      where += ` AND wde.expense_date >= $${params.length}::date`;
    }

    if (toDate) {
      params.push(toDate);
      where += ` AND wde.expense_date <= $${params.length}::date`;
    }

    const baseQuery = `
      SELECT
        wde.*,
        p.name AS property_name,
        p.property_code,
        u.first_name || ' ' || u.last_name AS recorded_by_name
      FROM water_delivery_expenses wde
      LEFT JOIN properties p ON p.id = wde.property_id
      LEFT JOIN users u ON u.id = wde.recorded_by
      ${where}
      ORDER BY wde.expense_date DESC, wde.created_at DESC
    `;

    let rows = [];
    let pagination = null;

    if (fetchAll) {
      const result = await db.query(baseQuery, params);
      rows = result.rows;
    } else {
      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
      const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

      const countResult = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM water_delivery_expenses wde
         ${where}`,
        params,
      );
      const total = countResult.rows[0]?.total || 0;

      const pagedParams = [...params, safeLimit, safeOffset];
      const result = await db.query(
        `${baseQuery}
         LIMIT $${pagedParams.length - 1}
         OFFSET $${pagedParams.length}`,
        pagedParams,
      );
      rows = result.rows;
      pagination = {
        total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + rows.length < total,
      };
    }

    return res.json({
      success: true,
      data: rows,
      ...(pagination ? { pagination } : {}),
    });
  } catch (error) {
    console.error("listWaterExpenses error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch water delivery expenses",
      error: error.message,
    });
  }
};

const updateWaterExpense = async (req, res) => {
  try {
    const actorId = req.user.id;
    if (req.user.role !== "agent") {
      return res.status(403).json({
        success: false,
        message: "Only agents can edit water delivery expenses",
      });
    }

    const { id } = req.params;
    const {
      vendorName,
      supplierOrganization,
      amount,
      expenseDate,
      billMonth,
      paymentMethod,
      paymentReference,
      mpesaReference,
      litersDelivered,
      notes,
    } = req.body || {};

    const existing = await db.query(
      `SELECT id, property_id
       FROM water_delivery_expenses
       WHERE id = $1 AND is_active = true`,
      [id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    const ok = await agentManagesProperty(actorId, existing.rows[0].property_id);
    if (!ok) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const fields = [];
    const params = [];

    if (vendorName !== undefined) {
      params.push(String(vendorName).trim());
      fields.push(`vendor_name = $${params.length}`);
    }
    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount" });
      }
      params.push(parsedAmount);
      fields.push(`amount = $${params.length}`);
    }
    if (expenseDate !== undefined) {
      if (expenseDate === null || expenseDate === "") {
        fields.push(`expense_date = CURRENT_DATE`);
      } else {
        const parsed = new Date(expenseDate);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({
            success: false,
            message: "expenseDate must be a valid date",
          });
        }
        params.push(parsed.toISOString().slice(0, 10));
        fields.push(`expense_date = $${params.length}::date`);
      }
    }
    if (billMonth !== undefined) {
      const normalizedBillMonth = normalizeMonthDate(billMonth);
      if (!normalizedBillMonth) {
        return res.status(400).json({
          success: false,
          message: "billMonth must be YYYY-MM or YYYY-MM-DD",
        });
      }
      params.push(normalizedBillMonth);
      fields.push(`bill_month = $${params.length}::date`);
    }
    if (paymentMethod !== undefined) {
      const normalizedPaymentMethod = String(paymentMethod || "")
        .trim()
        .toLowerCase();
      if (!["cash", "mpesa"].includes(normalizedPaymentMethod)) {
        return res.status(400).json({
          success: false,
          message: "paymentMethod must be either 'cash' or 'mpesa'",
        });
      }
      params.push(normalizedPaymentMethod);
      fields.push(`payment_method = $${params.length}`);
    }
    if (paymentReference !== undefined) {
      const ref = paymentReference ? String(paymentReference).trim() : null;
      params.push(ref);
      fields.push(`payment_reference = $${params.length}`);
      params.push(ref);
      fields.push(`mpesa_reference = $${params.length}`);
    }
    if (mpesaReference !== undefined) {
      params.push(mpesaReference ? String(mpesaReference).trim() : null);
      fields.push(`mpesa_reference = $${params.length}`);
    }
    if (supplierOrganization !== undefined) {
      params.push(
        supplierOrganization ? String(supplierOrganization).trim() : null,
      );
      fields.push(`supplier_organization = $${params.length}`);
    }
    if (litersDelivered !== undefined) {
      params.push(
        litersDelivered === null || litersDelivered === ""
          ? null
          : Number(litersDelivered),
      );
      fields.push(`liters_delivered = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes ? String(notes).trim() : null);
      fields.push(`notes = $${params.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    params.push(id);
    const result = await db.query(
      `UPDATE water_delivery_expenses
       SET ${fields.join(", ")},
           updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params,
    );

    return res.json({
      success: true,
      message: "Water delivery expense updated",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("updateWaterExpense error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update water delivery expense",
      error: error.message,
    });
  }
};

const deleteWaterExpense = async (req, res) => {
  try {
    const actorId = req.user.id;
    if (req.user.role !== "agent") {
      return res.status(403).json({
        success: false,
        message: "Only agents can delete water delivery expenses",
      });
    }

    const { id } = req.params;

    const existing = await db.query(
      `SELECT id, property_id
       FROM water_delivery_expenses
       WHERE id = $1 AND is_active = true`,
      [id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    const ok = await agentManagesProperty(actorId, existing.rows[0].property_id);
    if (!ok) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await db.query(
      `UPDATE water_delivery_expenses
       SET is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );

    return res.json({
      success: true,
      message: "Water delivery expense deleted",
    });
  } catch (error) {
    console.error("deleteWaterExpense error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete water delivery expense",
      error: error.message,
    });
  }
};

const getWaterProfitability = async (req, res) => {
  try {
    const actorId = req.user.id;
    const { propertyId, fromMonth, toMonth } = req.query;

    const startMonth = normalizeMonthDate(fromMonth || new Date().toISOString().slice(0, 7));
    const endMonth = normalizeMonthDate(toMonth || new Date().toISOString().slice(0, 7));

    if (!startMonth || !endMonth) {
      return res.status(400).json({
        success: false,
        message: "fromMonth/toMonth must be YYYY-MM or YYYY-MM-DD",
      });
    }

    const params = [startMonth, endMonth];
    let propertyFilterForBills = "";
    let propertyFilterForPaid = "";
    let propertyFilterForExpense = "";

    if (propertyId) {
      params.push(propertyId);
      propertyFilterForBills += ` AND wb.property_id = $${params.length}`;
      propertyFilterForPaid += ` AND rp.property_id = $${params.length}`;
      propertyFilterForExpense += ` AND wde.property_id = $${params.length}`;
    }

    if (req.user.role !== "admin") {
      params.push(actorId);
      const agentParam = `$${params.length}`;
      propertyFilterForBills += ` AND wb.property_id IN (
        SELECT property_id FROM agent_property_assignments
        WHERE agent_id = ${agentParam} AND is_active = true
      )`;
      propertyFilterForPaid += ` AND rp.property_id IN (
        SELECT property_id FROM agent_property_assignments
        WHERE agent_id = ${agentParam} AND is_active = true
      )`;
      propertyFilterForExpense += ` AND wde.property_id IN (
        SELECT property_id FROM agent_property_assignments
        WHERE agent_id = ${agentParam} AND is_active = true
      )`;
    }

    const reportQuery = `
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', $1::date),
          DATE_TRUNC('month', $2::date),
          INTERVAL '1 month'
        )::date AS month
      ),
      billed AS (
        SELECT
          DATE_TRUNC('month', wb.bill_month)::date AS month,
          COALESCE(SUM(wb.amount), 0)::numeric AS water_billed
        FROM water_bills wb
        WHERE wb.bill_month >= DATE_TRUNC('month', $1::date)
          AND wb.bill_month <= DATE_TRUNC('month', $2::date)
          ${propertyFilterForBills}
        GROUP BY DATE_TRUNC('month', wb.bill_month)::date
      ),
      paid AS (
        SELECT
          DATE_TRUNC('month', rp.payment_month)::date AS month,
          COALESCE(SUM(rp.allocated_to_water), 0)::numeric AS water_collected
        FROM rent_payments rp
        WHERE rp.status = 'completed'
          AND rp.payment_month >= DATE_TRUNC('month', $1::date)
          AND rp.payment_month <= DATE_TRUNC('month', $2::date)
          ${propertyFilterForPaid}
        GROUP BY DATE_TRUNC('month', rp.payment_month)::date
      ),
      expenses AS (
        SELECT
          DATE_TRUNC('month', wde.bill_month)::date AS month,
          COALESCE(SUM(wde.amount), 0)::numeric AS water_expense
        FROM water_delivery_expenses wde
        WHERE wde.is_active = true
          AND wde.bill_month >= DATE_TRUNC('month', $1::date)
          AND wde.bill_month <= DATE_TRUNC('month', $2::date)
          ${propertyFilterForExpense}
        GROUP BY DATE_TRUNC('month', wde.bill_month)::date
      )
      SELECT
        m.month,
        COALESCE(b.water_billed, 0) AS water_billed,
        COALESCE(p.water_collected, 0) AS water_collected,
        COALESCE(e.water_expense, 0) AS water_expense,
        (COALESCE(p.water_collected, 0) - COALESCE(e.water_expense, 0)) AS water_profit_or_loss
      FROM months m
      LEFT JOIN billed b ON b.month = m.month
      LEFT JOIN paid p ON p.month = m.month
      LEFT JOIN expenses e ON e.month = m.month
      ORDER BY m.month ASC
    `;

    const result = await db.query(reportQuery, params);
    const rows = result.rows || [];

    const totals = rows.reduce(
      (acc, row) => {
        acc.water_billed += Number(row.water_billed) || 0;
        acc.water_collected += Number(row.water_collected) || 0;
        acc.water_expense += Number(row.water_expense) || 0;
        acc.water_profit_or_loss += Number(row.water_profit_or_loss) || 0;
        return acc;
      },
      {
        water_billed: 0,
        water_collected: 0,
        water_expense: 0,
        water_profit_or_loss: 0,
      },
    );

    return res.json({
      success: true,
      data: {
        filters: {
          propertyId: propertyId || null,
          fromMonth: startMonth.slice(0, 7),
          toMonth: endMonth.slice(0, 7),
        },
        totals,
        monthly: rows,
      },
    });
  } catch (error) {
    console.error("getWaterProfitability error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to compute water profitability",
      error: error.message,
    });
  }
};

// backend/controllers/waterBillController.js
const getTenantWaterBalance = async (req, res) => {
  try {
    const agentId = req.user.id;
    const userRole = req.user.role;
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'tenantId is required'
      });
    }

    // 1) Total water billed for this tenant (from water_bills)
    let billedQuery = `
      SELECT COALESCE(SUM(wb.amount), 0) AS total_billed
      FROM water_bills wb
      WHERE wb.tenant_id = $1
    `;
    let billedParams = [tenantId];

    if (userRole !== 'admin') {
      billedParams.push(agentId);
      billedQuery += `
        AND wb.property_id IN (
          SELECT property_id 
          FROM agent_property_assignments 
          WHERE agent_id = $2 AND is_active = true
        )
      `;
    }

    const billedRes = await db.query(billedQuery, billedParams);
    const totalBilled = parseFloat(billedRes.rows[0]?.total_billed || 0);

    // 2) Total water paid (from rent_payments.allocated_to_water)
    let paidQuery = `
      SELECT COALESCE(SUM(rp.allocated_to_water), 0) AS total_paid
      FROM rent_payments rp
      WHERE rp.tenant_id = $1
        AND rp.status = 'completed'
    `;
    let paidParams = [tenantId];

    if (userRole !== 'admin') {
      paidParams.push(agentId);
      paidQuery += `
        AND rp.unit_id IN (
          SELECT pu.id
          FROM property_units pu
          JOIN agent_property_assignments apa
            ON pu.property_id = apa.property_id
          WHERE apa.agent_id = $2 AND apa.is_active = true
        )
      `;
    }

    const paidRes = await db.query(paidQuery, paidParams);
    const totalPaid = parseFloat(paidRes.rows[0]?.total_paid || 0);

    const arrears = totalBilled > totalPaid ? totalBilled - totalPaid : 0;
    const advance = totalPaid > totalBilled ? totalPaid - totalBilled : 0;

    return res.json({
      success: true,
      data: {
        total_billed: totalBilled,
        total_paid: totalPaid,
        arrears,
        advance
      }
    });
  } catch (err) {
    console.error('❌ getTenantWaterBalance error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get tenant water balance',
      error: err.message
    });
  }
};

module.exports = {
  createWaterBill,
  listWaterBills,
  getWaterBill,
  updateWaterBill,
  deleteWaterBill,
  createWaterExpense,
  listWaterExpenses,
  updateWaterExpense,
  deleteWaterExpense,
  getWaterProfitability,
  checkMissingWaterBills,
  getTenantWaterBalance
};
