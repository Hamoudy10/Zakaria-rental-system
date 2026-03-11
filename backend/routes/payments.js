// backend/routes/paymentRoutes.js
// PRODUCTION-READY — Aligned with C2B Paybill controller
// Route ordering: specific routes BEFORE parameterized routes

const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const {
  protect,
  adminOnly,
  requireAgent,
  requireRole,
} = require("../middleware/authMiddleware");

const requireNonProduction = (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, message: "Not found" });
  }
  next();
};

const allowTenantSelf = (req, res, next) => {
  if (req.user?.role !== "tenant") return next();
  const tenantId = req.params?.tenantId;
  if (!tenantId || tenantId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Access denied to this tenant record",
    });
  }
  next();
};

const allowAgentSelf = (req, res, next) => {
  if (req.user?.role !== "agent") return next();
  const agentId = req.params?.agentId;
  if (!agentId || agentId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Access denied to this agent record",
    });
  }
  next();
};

const normalizePaymentMonthInput = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "__INVALID__";
};

const rebalanceTenantUnitPayments = async ({
  client,
  tenantId,
  unitId,
  actorId = null,
}) => {
  if (!tenantId || !unitId) {
    return { rebalanced: false, reason: "missing_tenant_or_unit" };
  }

  const allocationExists = await client.query(
    `SELECT id
     FROM tenant_allocations
     WHERE tenant_id = $1 AND unit_id = $2
     LIMIT 1`,
    [tenantId, unitId],
  );

  if (allocationExists.rows.length === 0) {
    return { rebalanced: false, reason: "no_allocation_history" };
  }

  const sourcePaymentsResult = await client.query(
    `SELECT id, amount, payment_month, payment_date, mpesa_receipt_number, phone_number
     FROM rent_payments
     WHERE tenant_id = $1
       AND unit_id = $2
       AND status = 'completed'
       AND payment_method <> 'carry_forward'
     ORDER BY COALESCE(payment_date, created_at, NOW()) ASC, created_at ASC, id ASC`,
    [tenantId, unitId],
  );

  const sourcePayments = sourcePaymentsResult.rows;
  const sourceIds = sourcePayments.map((row) => row.id);

  if (sourceIds.length > 0) {
    await client.query(
      `UPDATE rent_payments
       SET status = 'pending',
           is_advance_payment = false,
           original_payment_id = NULL,
           allocated_to_rent = 0,
           allocated_to_water = 0,
           allocated_to_arrears = 0,
           updated_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [sourceIds],
    );
  }

  await client.query(
    `DELETE FROM rent_payments
     WHERE tenant_id = $1
       AND unit_id = $2
       AND payment_method = 'carry_forward'`,
    [tenantId, unitId],
  );

  for (const row of sourcePayments) {
    const paymentDate = row.payment_date ? new Date(row.payment_date) : new Date();
    const targetMonth = row.payment_month
      ? new Date(row.payment_month).toISOString().slice(0, 7)
      : paymentDate.toISOString().slice(0, 7);

    const tracking = await paymentController.trackRentPayment(
      tenantId,
      unitId,
      Number(row.amount) || 0,
      paymentDate,
      targetMonth,
      client,
    );

    await client.query(
      `UPDATE rent_payments
       SET status = 'completed',
           is_advance_payment = false,
           original_payment_id = NULL,
           allocated_to_rent = $1,
           allocated_to_water = $2,
           allocated_to_arrears = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        tracking.allocatedToRent || 0,
        tracking.allocatedToWater || 0,
        tracking.allocatedToArrears || 0,
        row.id,
      ],
    );

    if ((tracking.carryForwardAmount || 0) > 0) {
      await paymentController.recordCarryForward(
        tenantId,
        unitId,
        tracking.carryForwardAmount,
        row.id,
        paymentDate,
        row.mpesa_receipt_number || `RB_${row.id}`,
        row.phone_number || null,
        actorId,
        client,
      );
    }
  }

  return { rebalanced: true, sourcePayments: sourcePayments.length };
};

console.log("🔗 Payment routes loading...");

// DEBUG: Find undefined exports on startup
Object.entries(paymentController).forEach(([key, val]) => {
  if (typeof val !== "function") {
    console.error(
      `🔴 UNDEFINED EXPORT: paymentController.${key} is ${typeof val}`,
    );
  }
});

// ==================== M-PESA C2B ENDPOINTS (NO AUTH) ====================
// ⚠️ CRITICAL: These have NO auth middleware — Safaricom calls them directly
// Must be defined early to avoid being caught by parameterized routes

router.post("/c2b/validation", paymentController.handleMpesaValidation);
router.post("/c2b/callback", paymentController.handleMpesaCallback);

// ==================== DEBUG CALLBACK ENDPOINT ====================
// Temporary route to debug column length issues
router.post(
  "/c2b/callback-debug",
  protect,
  adminOnly,
  requireNonProduction,
  async (req, res) => {
  const pool = require("../config/database");

  console.log("═══════════════════════════════════════");
  console.log("DEBUG CALLBACK - RAW REQUEST BODY:");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("═══════════════════════════════════════");

  // Log each field's length
  const fields = {
    TransID: req.body.TransID,
    TransAmount: req.body.TransAmount,
    BillRefNumber: req.body.BillRefNumber,
    MSISDN: req.body.MSISDN,
    FirstName: req.body.FirstName,
    MiddleName: req.body.MiddleName,
    LastName: req.body.LastName,
    TransTime: req.body.TransTime,
    BusinessShortCode: req.body.BusinessShortCode,
    OrgAccountBalance: req.body.OrgAccountBalance,
    InvoiceNumber: req.body.InvoiceNumber,
    ThirdPartyTransID: req.body.ThirdPartyTransID,
    TransactionType: req.body.TransactionType,
  };

  console.log("FIELD LENGTHS:");
  Object.entries(fields).forEach(([key, value]) => {
    const len = value ? String(value).length : 0;
    console.log(`  ${key}: ${len} characters - "${value}"`);
  });

  try {
    // Check all varchar columns in rent_payments
    const columnCheck = await pool.query(`
      SELECT column_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'rent_payments'
      AND data_type = 'character varying'
      ORDER BY character_maximum_length ASC
    `);

    console.log("DATABASE VARCHAR COLUMNS (sorted by size):");
    columnCheck.rows.forEach((row) => {
      console.log(
        `  ${row.column_name}: max ${row.character_maximum_length} chars`,
      );
    });

    // Also check other tables that might be involved
    const notificationColumns = await pool.query(`
      SELECT column_name, character_maximum_length, table_name
      FROM information_schema.columns
      WHERE table_name IN ('notifications', 'payment_notifications', 'sms_queue', 'whatsapp_queue')
      AND data_type = 'character varying'
      AND character_maximum_length < 100
      ORDER BY table_name, character_maximum_length ASC
    `);

    console.log("OTHER TABLES - SHORT VARCHAR COLUMNS (<100):");
    notificationColumns.rows.forEach((row) => {
      console.log(
        `  ${row.table_name}.${row.column_name}: max ${row.character_maximum_length} chars`,
      );
    });

    res.json({
      success: true,
      message: "Debug info logged to Render console",
      fieldLengths: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, v ? String(v).length : 0]),
      ),
      rentPaymentsColumns: columnCheck.rows,
      otherShortColumns: notificationColumns.rows,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
  },
);

// ==================== TENANT PAYMENT STATUS (BEFORE /:id) ====================
// ⚠️ CRITICAL: Must come before ANY parameterized routes like /:id

router.get(
  "/tenant-status",
  protect,
  requireAgent,
  paymentController.getTenantPaymentStatus,
);

// ==================== M-PESA CONFIG & TEST ROUTES ====================

// Test M-Pesa configuration (admin only)
router.get(
  "/mpesa/test-config",
  protect,
  adminOnly,
  paymentController.testMpesaConfig,
);

// Register C2B URLs with Safaricom (admin only — call once after deploy)
router.post(
  "/mpesa/register-urls",
  protect,
  adminOnly,
  paymentController.registerC2BUrls,
);

// Check M-Pesa payment status by transaction ID
router.get(
  "/mpesa/status/:checkoutRequestId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  paymentController.checkPaymentStatus,
);

// Audit callback inbox vs posted payments (admin only)
router.get(
  "/mpesa/callback-inbox-audit",
  protect,
  adminOnly,
  paymentController.getMpesaCallbackInboxAudit,
);

// Retry callback inbox rows that were not posted (admin only)
router.post(
  "/mpesa/retry-inbox",
  protect,
  adminOnly,
  paymentController.retryMpesaCallbackInbox,
);

// Debug environment variables (admin only in production)
router.get("/debug-env", protect, adminOnly, (req, res) => {
  res.json({
    success: true,
    data: {
      MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY
        ? "✅ Set"
        : "❌ Missing",
      MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET
        ? "✅ Set"
        : "❌ Missing",
      MPESA_PAYBILL_NUMBER:
        process.env.MPESA_PAYBILL_NUMBER ||
        process.env.MPESA_SHORT_CODE ||
        "❌ Missing",
      MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL
        ? "✅ Set"
        : "❌ Missing",
      MPESA_VALIDATION_URL: process.env.MPESA_VALIDATION_URL
        ? "✅ Set"
        : "❌ Missing",
      MPESA_ENVIRONMENT: process.env.MPESA_ENVIRONMENT || "sandbox",
      SMS_API_KEY: process.env.SMS_API_KEY ? "✅ Set" : "❌ Missing",
      SMS_SENDER_ID: process.env.SMS_SENDER_ID ? "✅ Set" : "❌ Missing",
      SMS_BASE_URL: process.env.SMS_BASE_URL ? "✅ Set" : "❌ Missing",
      NODE_ENV: process.env.NODE_ENV,
    },
  });
});

// Test SMS service (admin only)
router.post("/test-sms", protect, adminOnly, paymentController.testSMSService);

// ==================== PAYBILL ROUTES ====================

// Process paybill payment (admin/agent manually enters M-Pesa receipt)
router.post(
  "/paybill",
  protect,
  requireAgent,
  paymentController.processPaybillPayment,
);

// Get payment status by unit code
router.get(
  "/unit/:unitCode/status",
  protect,
  requireAgent,
  paymentController.getPaymentStatusByUnitCode,
);

// ==================== SALARY PAYMENT ROUTES ====================

// Process salary payment (admin only)
router.post(
  "/salary",
  protect,
  adminOnly,
  paymentController.processSalaryPayment,
);

// Get all salary payments
router.get("/salary", protect, adminOnly, paymentController.getSalaryPayments);

// Get salary payments for specific agent
router.get(
  "/salary/agent/:agentId",
  protect,
  requireRole(["admin", "agent"]),
  allowAgentSelf,
  paymentController.getAgentSalaryPayments,
);

// ==================== REMINDERS ROUTES ====================

// Send balance reminders (admin only)
router.post(
  "/send-reminders",
  protect,
  adminOnly,
  paymentController.sendBalanceReminders,
);

// Get overdue reminders list
router.get(
  "/reminders/overdue",
  protect,
  requireAgent,
  paymentController.getOverdueReminders,
);

// Send overdue reminders (admin only)
router.post(
  "/reminders/overdue",
  protect,
  adminOnly,
  paymentController.sendOverdueReminders,
);

// Get upcoming reminders list
router.get(
  "/reminders/upcoming",
  protect,
  requireAgent,
  paymentController.getUpcomingReminders,
);

// Send upcoming reminders (admin only)
router.post(
  "/reminders/upcoming",
  protect,
  adminOnly,
  paymentController.sendUpcomingReminders,
);

// ==================== TENANT-SPECIFIC ROUTES ====================
// NOTE: These use named path segments and MUST come before generic /:id

// Get full payment history for a tenant
router.get(
  "/history/:tenantId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getTenantPaymentHistory,
);

// Get payments by tenant ID
router.get(
  "/tenant/:tenantId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getPaymentsByTenant,
);

// Get payment summary for tenant + unit
router.get(
  "/summary/:tenantId/:unitId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getPaymentSummary,
);

// Get detailed payment history for tenant + unit
router.get(
  "/details/:tenantId/:unitId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getPaymentHistory,
);

// Get future payments status for tenant + unit
router.get(
  "/future/:tenantId/:unitId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getFuturePaymentsStatus,
);

// ==================== MANUAL PAYMENT RECORDING ====================

// Record manual payment (admin/agent enters cash/bank payment)
router.post("/manual", protect, requireAgent, paymentController.recordManualPayment);

// ==================== DEPOSIT PAYMENT ROUTES ====================

// Record manual tenant deposit payment
router.post(
  "/deposits/record",
  protect,
  requireAgent,
  paymentController.recordDepositPayment,
);

// Get tenant deposit summary
router.get(
  "/deposits/summary/:tenantId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getTenantDepositSummary,
);

// Get tenant deposit transaction history
router.get(
  "/deposits/history/:tenantId",
  protect,
  requireRole(["admin", "agent", "tenant"]),
  allowTenantSelf,
  paymentController.getTenantDepositTransactions,
);

// ==================== CORE PAYMENT CRUD ====================

// Get all payments with filters, pagination, sorting
router.get("/", protect, requireAgent, paymentController.getAllPayments);

// ==================== GENERIC ID ROUTES (MUST BE LAST) ====================
// ⚠️ These use :id parameter and will catch ANYTHING not matched above

// Get payment by ID
router.get("/:id", protect, requireAgent, paymentController.getPaymentById);

// Update payment (admin/agent)
router.put("/:id", protect, async (req, res) => {
  const pool = require("../config/database");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const role = req.user?.role;
    if (!["admin", "agent"].includes(role)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Only admin/agent can update payments",
      });
    }

    const { id } = req.params;
    const { mpesa_receipt_number, phone_number, notes, amount, payment_month, status } =
      req.body;

    const paymentCheck = await client.query(
      `SELECT id, payment_method, property_id, status, tenant_id, unit_id
       FROM rent_payments
       WHERE id = $1`,
      [id],
    );

    if (paymentCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentCheck.rows[0];
    const method = String(payment.payment_method || "").toLowerCase();
    const isEditable =
      method === "manual" ||
      method === "manual_reconciled" ||
      method === "paybill";

    if (!isEditable) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Only manual or paybill payments can be edited",
      });
    }

    if (role === "agent") {
      if (!payment.property_id) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Access denied to this payment",
        });
      }

      const assignmentCheck = await client.query(
        `SELECT 1
         FROM agent_property_assignments
         WHERE agent_id = $1 AND property_id = $2 AND is_active = true
         LIMIT 1`,
        [req.user.id, payment.property_id],
      );

      if (assignmentCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Access denied to this payment",
        });
      }
    }

    const normalizedReceipt =
      mpesa_receipt_number !== undefined
        ? mpesa_receipt_number === null || String(mpesa_receipt_number).trim() === ""
          ? null
          : String(mpesa_receipt_number).trim()
        : undefined;

    if (normalizedReceipt !== undefined && normalizedReceipt) {
      const duplicateCheck = await client.query(
        "SELECT id FROM rent_payments WHERE mpesa_receipt_number = $1 AND id <> $2",
        [normalizedReceipt, id],
      );
      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Another payment already uses this M-Pesa receipt number",
        });
      }
    }

    const normalizedPhone =
      phone_number !== undefined
        ? phone_number === null || String(phone_number).trim() === ""
          ? null
          : String(phone_number).trim()
        : undefined;
    const normalizedNotes =
      notes !== undefined
        ? notes === null || String(notes).trim() === ""
          ? null
          : String(notes).trim()
        : undefined;

    let normalizedAmount = undefined;
    if (amount !== undefined) {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Amount must be a positive number",
        });
      }
      normalizedAmount = parsed;
    }

    const normalizedPaymentMonth = normalizePaymentMonthInput(payment_month);
    if (normalizedPaymentMonth === "__INVALID__") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "payment_month must be YYYY-MM or YYYY-MM-DD",
      });
    }

    let normalizedStatus = undefined;
    if (status !== undefined) {
      const allowedStatuses = new Set(["completed", "pending", "failed"]);
      const parsedStatus = String(status || "").toLowerCase().trim();
      if (!allowedStatuses.has(parsedStatus)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid status. Allowed: completed, pending, failed",
        });
      }
      normalizedStatus = parsedStatus;
    }

    const updates = [];
    const values = [];
    const addUpdate = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (normalizedReceipt !== undefined) addUpdate("mpesa_receipt_number", normalizedReceipt);
    if (normalizedPhone !== undefined) addUpdate("phone_number", normalizedPhone);
    if (normalizedNotes !== undefined) addUpdate("notes", normalizedNotes);
    if (normalizedAmount !== undefined) addUpdate("amount", normalizedAmount);
    if (normalizedPaymentMonth !== undefined)
      addUpdate("payment_month", normalizedPaymentMonth);
    if (normalizedStatus !== undefined) addUpdate("status", normalizedStatus);

    if (updates.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    const result = await client.query(
      `UPDATE rent_payments
       SET ${updates.join(", ")},
           updated_at = NOW()
       WHERE id = $${values.length + 1}
       RETURNING *`,
      [...values, id],
    );

    const shouldRebalance =
      payment.tenant_id &&
      payment.unit_id &&
      (normalizedAmount !== undefined ||
        normalizedPaymentMonth !== undefined ||
        normalizedStatus !== undefined);

    if (shouldRebalance) {
      await rebalanceTenantUnitPayments({
        client,
        tenantId: payment.tenant_id,
        unitId: payment.unit_id,
        actorId: req.user?.id || null,
      });
    }

    const latest = await client.query("SELECT * FROM rent_payments WHERE id = $1", [id]);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Payment updated successfully",
      data: { payment: latest.rows[0] || result.rows[0] },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR updating payment:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment",
    });
  } finally {
    client.release();
  }
});

// Delete payment (admin/agent)
router.delete("/:id", protect, async (req, res) => {
  const pool = require("../config/database");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const role = req.user?.role;
    if (!["admin", "agent"].includes(role)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Only admin/agent can delete payments",
      });
    }

    const { id } = req.params;

    const paymentCheck = await client.query(
      `SELECT id, payment_method, status, tenant_id, unit_id, property_id
       FROM rent_payments
       WHERE id = $1`,
      [id],
    );

    if (paymentCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentCheck.rows[0];
    const method = String(payment.payment_method || "").toLowerCase();
    const isManual =
      method === "manual" || method === "manual_reconciled";

    if (!isManual) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Only manual payments can be deleted",
      });
    }

    if (role === "agent") {
      if (!payment.property_id) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Access denied to this payment",
        });
      }

      const assignmentCheck = await client.query(
        `SELECT 1
         FROM agent_property_assignments
         WHERE agent_id = $1 AND property_id = $2 AND is_active = true
         LIMIT 1`,
        [req.user.id, payment.property_id],
      );

      if (assignmentCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Access denied to this payment",
        });
      }
    }

    const wasCompleted = String(payment.status || "").toLowerCase() === "completed";
    const affectedTenantId = payment.tenant_id;
    const affectedUnitId = payment.unit_id;

    await client.query("DELETE FROM rent_payments WHERE id = $1", [id]);

    if (wasCompleted && affectedTenantId && affectedUnitId) {
      await rebalanceTenantUnitPayments({
        client,
        tenantId: affectedTenantId,
        unitId: affectedUnitId,
        actorId: req.user?.id || null,
      });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR deleting payment:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting payment",
    });
  } finally {
    client.release();
  }
});

// Confirm a pending payment (admin/agent)
router.post("/:id/confirm", protect, async (req, res) => {
  const pool = require("../config/database");

  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE rent_payments
       SET status = 'completed',
           payment_date = COALESCE(payment_date, NOW()),
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found or already confirmed",
      });
    }

    res.json({
      success: true,
      message: "Payment confirmed successfully",
      data: { payment: result.rows[0] },
    });
  } catch (error) {
    console.error("❌ ERROR confirming payment:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming payment",
    });
  }
});

console.log("✅ All payment routes configured successfully");

module.exports = router;
