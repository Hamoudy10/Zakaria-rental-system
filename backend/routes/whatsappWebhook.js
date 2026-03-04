const express = require("express");
const router = express.Router();
const WhatsAppService = require("../services/whatsappService");

// Meta webhook verification (GET)
router.get("/webhook", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
      console.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured");
      return res.status(500).send("Webhook verify token not configured");
    }

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WhatsApp webhook verified successfully");
      return res.status(200).send(challenge);
    }

    console.warn("WhatsApp webhook verification failed");
    return res.sendStatus(403);
  } catch (error) {
    console.error("WhatsApp webhook verification error:", error);
    return res.sendStatus(500);
  }
});

// Meta webhook event receiver (POST)
router.post("/webhook", async (req, res) => {
  try {
    const result = await WhatsAppService.processWebhook(req.body);
    if (!result?.processed) {
      console.log("WhatsApp webhook received (no actionable statuses):", result);
    }
    return res.status(200).json({ success: true, message: "EVENT_RECEIVED" });
  } catch (error) {
    console.error("WhatsApp webhook processing error:", error);
    return res.status(200).json({ success: false, message: "EVENT_RECEIVED" });
  }
});

module.exports = router;

