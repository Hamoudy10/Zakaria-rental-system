// backend/routes/paymentRoutes.js
// UPDATED: Added /tenant-status route BEFORE /:id to fix route ordering issue

const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const {
  protect,
  adminOnly,
  agentOnly,
} = require("../middleware/authMiddleware");

console.log("🔗 Payment routes loading...");
// DEBUG: Find the undefined export
Object.entries(paymentController).forEach(([key, val]) => {
  if (typeof val !== 'function') {
    console.error(`🔴 UNDEFINED EXPORT: paymentController.${key} is ${typeof val}`);
  }
});

// ==================== TENANT PAYMENT STATUS (MUST BE FIRST) ====================
// ⚠️ CRITICAL: This route MUST come before ANY parameterized routes like /:id
// Otherwise Express will interpret "tenant-status" as an :id parameter

router.get("/tenant-status", protect, paymentController.getTenantPaymentStatus);

// ==================== DEBUG / TEST ROUTES ====================

// Debug environment variables (no auth for quick checks)
router.get("/debug-env", (req, res) => {
  res.json({
    SMS_API_KEY: process.env.SMS_API_KEY ? "✅ Set" : "❌ Missing",
    SMS_SENDER_ID: process.env.SMS_SENDER_ID ? "✅ Set" : "❌ Missing",
    SMS_USERNAME: process.env.SMS_USERNAME ? "✅ Set" : "❌ Missing",
    SMS_BASE_URL: process.env.SMS_BASE_URL ? "✅ Set" : "❌ Missing",
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY
      ? "✅ Set"
      : "❌ Missing",
    MPESA_SHORT_CODE: process.env.MPESA_SHORT_CODE ? "✅ Set" : "❌ Missing",
    NODE_ENV: process.env.NODE_ENV,
  });
});

// Test M-Pesa configuration
router.get("/mpesa/test-config", protect, paymentController.testMpesaConfig);

// Test SMS service
router.post("/test-sms", protect, adminOnly, paymentController.testSMSService);

// ==================== M-PESA ROUTES ====================

// M-Pesa callback (NO AUTH - called by Safaricom)
router.post("/mpesa/callback", paymentController.handleMpesaCallback);


// Check M-Pesa payment status
router.get(
  "/mpesa/status/:checkoutRequestId",
  protect,
  paymentController.checkPaymentStatus,
);

// ==================== PAYBILL ROUTES ====================

// Process paybill payment (admin/agent records incoming paybill)
router.post("/paybill", protect, paymentController.processPaybillPayment);

// Get payment status by unit code
router.get(
  "/unit/:unitCode/status",
  protect,
  paymentController.getPaymentStatusByUnitCode,
);

// ==================== SALARY PAYMENT ROUTES ====================

// Process salary payment
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

// Send balance reminders
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

// Send overdue reminders
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

// Send upcoming reminders
router.post(
  "/reminders/upcoming",
  protect,
  adminOnly,
  paymentController.sendUpcomingReminders,
);

// ==================== TENANT-SPECIFIC ROUTES ====================
// NOTE: These must come BEFORE the generic /:id route

// Get full payment history for a tenant (used by PaymentManagement modal)
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

// ==================== CORE PAYMENT CRUD ====================

// Get all payments with filters, pagination, sorting
// Used by: PaymentManagement.jsx fetchPayments()
router.get("/", protect, paymentController.getAllPayments);

// Create new payment record
router.post("/", protect, async (req, res) => {
  const pool = require("../config/database");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      tenant_id,
      unit_id,
      mpesa_transaction_id,
      mpesa_receipt_number,
      phone_number,
      amount,
      payment_month,
      status = "completed",
    } = req.body;

    // Validate required fields
    if (!tenant_id || !unit_id || !amount || !payment_month) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: tenant_id, unit_id, amount, payment_month",
      });
    }

    const paymentResult = await client.query(
      `INSERT INTO rent_payments (
        tenant_id, unit_id, mpesa_transaction_id, mpesa_receipt_number,
        phone_number, amount, payment_month, status, confirmed_by, 
        confirmed_at, payment_date, payment_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        tenant_id,
        unit_id,
        mpesa_transaction_id || null,
        mpesa_receipt_number || null,
        phone_number || null,
        amount,
        payment_month,
        status,
        req.user.id,
        status === "completed" ? new Date() : null,
        status === "completed" ? new Date() : null,
        "manual",
      ],
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: { payment: paymentResult.rows[0] },
      payment: paymentResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR creating payment:", error);

    res.status(500).json({
      success: false,
      message: "Error creating payment",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// ==================== GENERIC ID ROUTES (MUST BE LAST) ====================
// ⚠️ These routes use :id parameter and will catch anything not matched above

// Get payment by ID
router.get("/:id", protect, paymentController.getPaymentById);

// Update payment
router.put("/:id", protect, async (req, res) => {
  const pool = require("../config/database");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const { mpesa_receipt_number, amount, status } = req.body;

    // Check if payment exists
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

    const result = await client.query(
      `UPDATE rent_payments
       SET mpesa_receipt_number = COALESCE($1, mpesa_receipt_number),
           amount = COALESCE($2, amount),
           status = COALESCE($3, status),
           confirmed_by = $4,
           confirmed_at = CASE
             WHEN $3 = 'completed' AND confirmed_at IS NULL THEN NOW()
             ELSE confirmed_at
           END,
           payment_date = CASE
             WHEN $3 = 'completed' AND payment_date IS NULL THEN NOW()
             ELSE payment_date
           END
       WHERE id = $5
       RETURNING *`,
      [mpesa_receipt_number, amount, status, req.user.id, id],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Payment updated successfully",
      data: { payment: result.rows[0] },
      payment: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR updating payment:", error);

    res.status(500).json({
      success: false,
      message: "Error updating payment",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// Delete payment
router.delete("/:id", protect, adminOnly, async (req, res) => {
  const pool = require("../config/database");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    // Check if payment exists
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
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// Confirm payment
router.post("/:id/confirm", protect, async (req, res) => {
  const pool = require("../config/database");

  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE rent_payments
       SET status = 'completed',
           confirmed_by = $1,
           confirmed_at = NOW(),
           payment_date = COALESCE(payment_date, NOW())
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [req.user.id, id],
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
      payment: result.rows[0],
    });
  } catch (error) {
    console.error("❌ ERROR confirming payment:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming payment",
      error: error.message,
    });
  }
});

console.log("✅ All payment routes configured successfully");

module.exports = router;
