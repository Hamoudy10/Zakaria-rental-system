// backend/routes/cronRoutes.js
const express = require("express");
const router = express.Router();
const cronController = require("../controllers/cronController");
const {
  protect,
  adminOnly,
  agentOnly,
  requireAgent,
} = require("../middleware/authMiddleware");

console.log("🔍 DEBUG CRON ROUTES: Starting to load...");

// Public routes (for system startup)
router.get("/status", cronController.getCronStatus);

// Admin protected routes
router.post("/start", protect, agentOnly, cronController.startCronService);
router.post("/stop", protect, agentOnly, cronController.stopCronService);
router.post(
  "/trigger-billing",
  protect,
  agentOnly,
  cronController.triggerManualBilling,
);
router.get("/history", protect, agentOnly, cronController.getBillingHistory);

// ==================== AGENT-SPECIFIC ROUTES ====================
// These routes handle billing triggers, retries, and history for agents

// 1. Trigger Billing
router.post(
  "/agent/trigger-billing",
  protect,
  agentOnly,
  cronController.triggerAgentBillingSMS,
);

// 2. Failed SMS Management
router.get(
  "/agent/failed-sms",
  protect,
  agentOnly,
  cronController.getFailedSMS,
);
router.post(
  "/agent/retry-sms",
  protect,
  agentOnly,
  cronController.retryFailedSMS,
);

// 3. SMS History (Maps to cronController.getSMSHistory)
// Note: Frontend using API.billing.getSMSHistory likely points here
router.get(
  "/agent/history",
  protect,
  requireAgent,
  cronController.getSMSHistory,
);

console.log("🔍 DEBUG CRON ROUTES: All routes registered");

module.exports = router;
