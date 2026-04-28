const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { createRateLimiter, getClientIp } = require("../middleware/rateLimit");
const aiAgentService = require("../services/aiAgentService");

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || getClientIp(req),
  message: "Too many AI requests. Please wait a moment and try again.",
});

router.use(authMiddleware);
router.use(requireRole(["admin", "agent"]));
router.use(aiRateLimiter);

router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "AI agent route is available",
    mode: "phase_1_read_only",
    timestamp: new Date().toISOString(),
  });
});

router.get("/history", async (req, res) => {
  try {
    const { conversationId, limit } = req.query || {};
    const result = await aiAgentService.getConversationHistory({
      user: req.user,
      conversationId,
      limit,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("AI agent history fetch failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load AI chat history.",
    });
  }
});

router.post("/query", async (req, res) => {
  try {
    const { question, history, conversationId } = req.body || {};
    const result = await aiAgentService.answerQuestion({
      user: req.user,
      question,
      history,
      conversationId,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("AI agent query failed:", error.message);
    return res.status(500).json({
      success: false,
      message:
        "The AI assistant could not process your request right now. Please try again.",
    });
  }
});

module.exports = router;
