const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { createRateLimiter, getClientIp } = require("../middleware/rateLimit");
const aiAgentService = require("../services/aiAgentService");

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || getClientIp(req),
  message: "Too many requests. Please wait a moment.",
});

const strictRateLimiter = createRateLimiter({
  windowMs: 10 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || getClientIp(req),
  message: "Request limit exceeded. Slow down.",
});

router.use(authMiddleware);
router.use(requireRole(["admin", "agent"]));
router.use(aiRateLimiter);

router.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const body = req.body;
  if (body && typeof body === "object") {
    const question = String(body.question || "").trim();
    if (question.length > 600) {
      return res.status(400).json({ success: false, message: "Question too long." });
    }
  }
  next();
});

router.post("/stream", strictRateLimiter, async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { question, history, conversationId } = req.body || {};
    const result = await aiAgentService.answerQuestionStream({
      user: req.user,
      question,
      history,
      conversationId,
      onProgress: (step) => send("progress", { step }),
      onToken: (token) => send("token", { token }),
    });

    if (result.success) {
      send("done", result.data);
    } else {
      send("error", { message: result.message || "Failed" });
    }
  } catch (error) {
    console.error("AI agent stream failed:", error.message);
    send("error", { message: "The AI assistant could not process your request right now. Please try again." });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const { conversationId } = req.body || {};
    const result = await aiAgentService.confirmPendingAction({
      user: req.user,
      conversationId,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("AI confirm action failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to confirm the pending action.",
    });
  }
});

router.post("/reject", async (req, res) => {
  try {
    const { conversationId } = req.body || {};
    const result = await aiAgentService.rejectPendingAction({
      user: req.user,
      conversationId,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("AI reject action failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to reject the pending action.",
    });
  }
});

router.get("/pending", async (req, res) => {
  try {
    const { conversationId } = req.query || {};
    const result = await aiAgentService.getPendingAction({
      user: req.user,
      conversationId,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("AI pending action fetch failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending action.",
    });
  }
});

router.get("/conversations", async (req, res) => {
  try {
    const limit = parseInt(req.query?.limit || "30", 10);
    const result = await aiAgentService.listConversations({ user: req.user, limit });
    if (!result.success) {
      return res.status(result.status || 500).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("AI conversation list failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to list conversations.",
    });
  }
});

router.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const result = await aiAgentService.deleteConversation({
      user: req.user,
      conversationId,
    });
    if (!result.success) {
      return res.status(result.status || 500).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("AI conversation delete failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to delete conversation.",
    });
  }
});

module.exports = router;
