// backend/routes/paymentRoutes.js
// PRODUCTION-READY — Aligned with C2B Paybill controller
// Route ordering: specific routes BEFORE parameterized routes

const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

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
router.post("/c2b/callback-debug", async (req, res) => {
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
});

// ==================== TENANT PAYMENT STATUS (BEFORE /:id) ====================
// ⚠️ CRITICAL: Must come before ANY parameterized routes like /:id

router.get("/tenant-status", protect, paymentController.getTenantPaymentStatus);

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
  paymentController.checkPaymentStatus,
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
router.post("/paybill", protect, paymentController.processPaybillPayment);

// Get payment status by unit code
router.get(
  "/unit/:unitCode/status",
  protect,
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
router.get("/salary", protect, paymentController.getSalaryPayments);

// Get salary payments for specific agent
router.get(
  "/salary/agent/:agentId",
  protect,
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
  paymentController.getTenantPaymentHistory,
);

// Get payments by tenant ID
router.get("/tenant/:tenantId", protect, paymentController.getPaymentsByTenant);

// Get payment summary for tenant + unit
router.get(
  "/summary/:tenantId/:unitId",
  protect,
  paymentController.getPaymentSummary,
);

// Get detailed payment history for tenant + unit
router.get(
  "/details/:tenantId/:unitId",
  protect,
  paymentController.getPaymentHistory,
);

// Get future payments status for tenant + unit
router.get(
  "/future/:tenantId/:unitId",
  protect,
  paymentController.getFuturePaymentsStatus,
);

// ==================== MANUAL PAYMENT RECORDING ====================

// Record manual payment (admin/agent enters cash/bank payment)
router.post("/manual", protect, paymentController.recordManualPayment);

// ==================== DEPOSIT PAYMENT ROUTES ====================

// Record manual tenant deposit payment
router.post("/deposits/record", protect, paymentController.recordDepositPayment);

// Get tenant deposit summary
router.get(
  "/deposits/summary/:tenantId",
  protect,
  paymentController.getTenantDepositSummary,
);

// Get tenant deposit transaction history
router.get(
  "/deposits/history/:tenantId",
  protect,
  paymentController.getTenantDepositTransactions,
);

// ==================== CORE PAYMENT CRUD ====================

// Get all payments with filters, pagination, sorting
router.get("/", protect, paymentController.getAllPayments);

// ==================== GENERIC ID ROUTES (MUST BE LAST) ====================
// ⚠️ These use :id parameter and will catch ANYTHING not matched above

// Get payment by ID
router.get("/:id", protect, paymentController.getPaymentById);

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
    let {
      mpesa_receipt_number,
      amount,
      status,
      payment_month,
      phone_number,
      notes,
    } = req.body;

    const paymentCheck = await client.query(
      "SELECT id, payment_method, property_id FROM rent_payments WHERE id = $1",
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
        message: "Only manual payments can be edited",
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

    if (amount !== undefined && amount !== null && Number(amount) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    if (status) {
      const allowedStatuses = ["pending", "completed", "failed", "overdue"];
      if (!allowedStatuses.includes(String(status).toLowerCase())) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid status value",
        });
      }
      status = String(status).toLowerCase();
    }

    let normalizedReceipt =
      mpesa_receipt_number !== undefined && mpesa_receipt_number !== null
        ? String(mpesa_receipt_number).trim()
        : null;
    if (normalizedReceipt === "") normalizedReceipt = null;

    if (normalizedReceipt) {
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

    let normalizedMonth = null;
    if (payment_month !== undefined && payment_month !== null && payment_month !== "") {
      const monthText = String(payment_month).trim();
      if (/^\d{4}-\d{2}$/.test(monthText)) {
        normalizedMonth = `${monthText}-01`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(monthText)) {
        normalizedMonth = monthText;
      } else {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid payment_month format (use YYYY-MM or YYYY-MM-DD)",
        });
      }
    }

    const normalizedPhone =
      phone_number !== undefined && phone_number !== null && String(phone_number).trim() !== ""
        ? String(phone_number).trim()
        : null;
    const normalizedNotes =
      notes !== undefined && notes !== null && String(notes).trim() !== ""
        ? String(notes).trim()
        : null;

    const result = await client.query(
      `UPDATE rent_payments
       SET mpesa_receipt_number = COALESCE($1, mpesa_receipt_number),
           amount = COALESCE($2, amount),
           status = COALESCE($3, status),
           payment_month = COALESCE($4::date, payment_month),
           phone_number = COALESCE($5, phone_number),
           notes = COALESCE($6, notes),
           payment_date = CASE
             WHEN $3 = 'completed' AND payment_date IS NULL THEN NOW()
             ELSE payment_date
           END,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        normalizedReceipt,
        amount ?? null,
        status ?? null,
        normalizedMonth,
        normalizedPhone,
        normalizedNotes,
        id,
      ],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Payment updated successfully",
      data: { payment: result.rows[0] },
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

// Delete payment (admin only)
router.delete("/:id", protect, adminOnly, async (req, res) => {
  const pool = require("../config/database");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    const paymentCheck = await client.query(
      "SELECT id FROM rent_payments WHERE id = $1",
      [id],
    );

    if (paymentCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    await client.query("DELETE FROM rent_payments WHERE id = $1", [id]);

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
