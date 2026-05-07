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
  const availableActions = aiAgentService.getAvailableActions({
    user: req.user,
    includeDisabled: false,
  });

  res.json({
    success: true,
    message: "AI agent route is available",
    mode: "phase_2_write_enabled",
    autonomousWritesEnabled: true,
    availableActions: availableActions.length,
    timestamp: new Date().toISOString(),
  });
});

router.get("/actions", (req, res) => {
  const includeDisabled = String(req.query?.includeDisabled || "true") !== "false";
  res.json({
    success: true,
    mode: "phase_2_write_enabled",
    autonomousWritesEnabled: true,
    data: {
      actions: aiAgentService.getAvailableActions({
        user: req.user,
        includeDisabled,
      }),
    },
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

router.post("/stream", async (req, res) => {
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
