import React, { useEffect, useMemo, useRef, useState } from "react";
import { aiAgentAPI } from "../../services/api";

const MAX_LOCAL_HISTORY = 6;

const formatTime = (dateStr) => {
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const buildHistoryPayload = (messages) => {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_LOCAL_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
};

const getLocalConversationId = (currentUserId) => {
  const key = `ai_assistant_conversation_${currentUserId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  let nextId = null;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    nextId = crypto.randomUUID();
  } else {
    const fallbackUuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (c) => {
        const r = Math.floor(Math.random() * 16);
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
    nextId = fallbackUuid;
  }

  localStorage.setItem(key, nextId);
  return nextId;
};

const AIAssistantPanel = ({ onBack, onClose, canUseAI, currentUserId }) => {
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef(null);

  const welcomeMessage = useMemo(
    () => ({
      id: "welcome-ai",
      role: "assistant",
      content:
        "AI Operations Assistant is ready. Ask about tenants, balances, payments, complaints, or dashboard summaries. Phase 1 is read-only.",
      created_at: new Date().toISOString(),
      meta: { tool: "system" },
    }),
    [],
  );

  useEffect(() => {
    if (!currentUserId) return;
    const id = getLocalConversationId(currentUserId);
    setConversationId(id);
  }, [currentUserId]);

  useEffect(() => {
    if (!canUseAI || !conversationId) return;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setError("");
      try {
        const response = await aiAgentAPI.getHistory(conversationId, 120);
        const items = response?.data?.data?.items || [];
        if (!Array.isArray(items) || items.length === 0) {
          setMessages([welcomeMessage]);
          return;
        }

        const mapped = items.map((row) => ({
          id: row.id,
          role: row.role,
          content: row.message_text,
          created_at: row.created_at,
          meta: {
            tool: row.tool_used || "history",
            blocked: Boolean(row.blocked),
            fallback: Boolean(row.fallback),
            records: Number(row.records_count || 0),
          },
        }));
        setMessages(mapped);
      } catch (err) {
        setMessages([welcomeMessage]);
        setError(
          err?.response?.data?.message ||
            "Failed to load AI chat history. You can still continue chatting.",
        );
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();
  }, [canUseAI, conversationId, welcomeMessage]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const canSend = useMemo(
    () =>
      canUseAI &&
      !loading &&
      !historyLoading &&
      input.trim().length > 0 &&
      Boolean(conversationId),
    [canUseAI, input, loading, historyLoading, conversationId],
  );

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || !canUseAI || loading || historyLoading || !conversationId) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      created_at: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const history = buildHistoryPayload(nextMessages);
      const response = await aiAgentAPI.ask(question, history, conversationId);
      const payload = response?.data?.data || {};

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content:
          payload.answer ||
          "I processed your request, but could not generate a response.",
        created_at: new Date().toISOString(),
        meta: {
          tool: payload.tool || "unknown",
          fallback: Boolean(payload.fallback),
          blocked: Boolean(payload.blocked),
          records: Number(payload.records || 0),
        },
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        "AI assistant is temporarily unavailable. Please try again.";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: message,
          created_at: new Date().toISOString(),
          meta: { tool: "error" },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };

  if (!canUseAI) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-amber-50">
        <div className="h-16 border-b border-amber-200 bg-amber-100 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="md:hidden w-10 h-10 rounded-full hover:bg-amber-200 flex items-center justify-center"
            >
              <svg
                className="w-5 h-5 text-amber-800"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h3 className="font-semibold text-amber-900">AI Assistant</h3>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-amber-200 flex items-center justify-center"
          >
            <svg
              className="w-5 h-5 text-amber-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center">
          <p className="text-amber-900">
            AI Assistant is available for Admin and Agent roles only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-amber-50">
      <div className="h-16 border-b border-amber-200 bg-amber-100 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden w-10 h-10 rounded-full hover:bg-amber-200 flex items-center justify-center"
          >
            <svg
              className="w-5 h-5 text-amber-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold">
            AI
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-amber-900 truncate">
              AI Operations Assistant
            </h3>
            <p className="text-xs text-amber-800 truncate">
              Separate from team chats - Read-only mode
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-amber-200 flex items-center justify-center"
        >
          <svg
            className="w-5 h-5 text-amber-800"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div
        ref={messagesRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3"
      >
        {historyLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-amber-200 text-slate-700 rounded-2xl rounded-bl-md px-4 py-2">
              <p className="text-sm">Loading previous AI conversation...</p>
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div
              key={message.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm ${
                  isUser
                    ? "bg-slate-700 text-white rounded-br-md"
                    : "bg-white border border-amber-200 text-slate-800 rounded-bl-md"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    className={`text-[11px] ${isUser ? "text-slate-200" : "text-slate-500"}`}
                  >
                    {formatTime(message.created_at)}
                  </span>
                  {!isUser && message.meta?.tool && (
                    <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      {message.meta.tool}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-amber-200 text-slate-700 rounded-2xl rounded-bl-md px-4 py-2">
              <p className="text-sm">Analyzing your request...</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 pb-2 shrink-0">
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-amber-200 bg-amber-100 px-3 py-3 shrink-0"
      >
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI about tenants, balances, payments, complaints..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="h-10 px-4 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

export default AIAssistantPanel;
