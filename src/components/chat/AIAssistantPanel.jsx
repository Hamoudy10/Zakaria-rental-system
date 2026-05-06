import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiAgentAPI } from "../../services/api";

const MAX_LOCAL_HISTORY = 6;

const SUGGESTED_PROMPTS = [
  { label: "Tenants owing rent", text: "who has not paid this month" },
  { label: "Payment overview", text: "show recent payments" },
  { label: "Vacant units", text: "how many vacant units do we have" },
  { label: "Open complaints", text: "list open complaints" },
  { label: "Search the web", text: "search the web for latest property market trends in Kenya" },
];

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

const buildHistoryPayload = (messages) =>
  messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_LOCAL_HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));

const getLocalConversationId = (currentUserId) => {
  const key = `ai_assistant_conversation_${currentUserId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const nextId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = Math.floor(Math.random() * 16);
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  localStorage.setItem(key, nextId);
  return nextId;
};

const LoadingDots = () => (
  <div className="flex gap-1 px-1 py-2">
    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
  </div>
);

const renderMessageContent = (text) => {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    let processed = line;
    const boldParts = [];
    let lastIndex = 0;
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(line)) !== null) {
      boldParts.push({ text: line.slice(lastIndex, match.index), bold: false });
      boldParts.push({ text: match[1], bold: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      boldParts.push({ text: line.slice(lastIndex), bold: false });
    }
    return (
      <span key={i} className="block leading-relaxed">
        {boldParts.length > 0
          ? boldParts.map((part, j) =>
              part.bold ? (
                <strong key={j} className="font-semibold text-slate-900">
                  {part.text}
                </strong>
              ) : (
                <span key={j}>{part.text}</span>
              ),
            )
          : line || "\u00A0"}
      </span>
    );
  });
};

const AIAssistantPanel = ({ onBack, onClose, canUseAI, currentUserId }) => {
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

  const welcomeMessage = useMemo(
    () => ({
      id: "welcome-ai",
      role: "assistant",
      content:
        "Hello! I'm your AI Operations Assistant. I can help with tenant balances, payments, complaints, water bills, dashboard stats, and more. I can also send SMS reminders, create water bills, and search the web. Just ask!",
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

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const canSend = useMemo(
    () =>
      canUseAI && !loading && !historyLoading && input.trim().length > 0 && Boolean(conversationId),
    [canUseAI, input, loading, historyLoading, conversationId],
  );

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || !canUseAI || loading || historyLoading || !conversationId) return;

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
    setShowSuggestions(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }

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
          needsConfirmation: Boolean(payload.needsConfirmation),
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
  }, [input, canUseAI, loading, historyLoading, conversationId, messages]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const clearConversation = useCallback(() => {
    if (currentUserId) {
      localStorage.removeItem(`ai_assistant_conversation_${currentUserId}`);
      setConversationId(getLocalConversationId(currentUserId));
    }
    setMessages([welcomeMessage]);
    setError("");
  }, [currentUserId, welcomeMessage]);

  const pickSuggestion = useCallback((text) => {
    setInput(text);
    setShowSuggestions(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      autoResize();
    }, 50);
  }, [autoResize]);

  if (!canUseAI) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center text-sm font-bold">
              AI
            </div>
            <h3 className="font-semibold text-slate-800">AI Assistant</h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center">
          <p className="text-slate-500 text-sm">AI Assistant is available for Admin and Agent roles only.</p>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 1 && messages[0].id === "welcome-ai";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center text-sm font-bold">
            AI
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 truncate text-sm">AI Operations Assistant</h3>
            <p className="text-[11px] text-slate-500 truncate">Read + Write — confirmation required for actions</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearConversation}
            title="New conversation"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {historyLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <p className="text-sm text-slate-500">Loading conversation...</p>
            </div>
          </div>
        )}

        {isEmpty && !historyLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <p className="text-slate-700 font-semibold">AI Operations Assistant</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Ask about tenants, payments, complaints, properties, or water bills. Send SMS reminders, create water bills, or search the web.
            </p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  onClick={() => pickSuggestion(prompt.text)}
                  className="text-left px-4 py-2.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors shadow-sm"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const isError = message.meta?.tool === "error";
          const needsConfirm = message.meta?.needsConfirmation;
          return (
            <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">
                  AI
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  isUser
                    ? "bg-slate-800 text-white rounded-br-md"
                    : isError
                      ? "bg-red-50 border border-red-200 text-red-800 rounded-bl-md"
                      : needsConfirm
                        ? "bg-amber-50 border-2 border-amber-300 text-slate-800 rounded-bl-md"
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
                }`}
              >
                <div className="text-sm">{renderMessageContent(message.content)}</div>
                <div className={`mt-1.5 flex items-center justify-between gap-2 text-[10px] ${isUser ? "text-slate-400" : "text-slate-400"}`}>
                  <span>{formatTime(message.created_at)}</span>
                  {!isUser && message.meta?.tool && message.meta.tool !== "error" && (
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      message.meta.blocked
                        ? "bg-red-100 text-red-700"
                        : message.meta.fallback
                          ? "bg-orange-100 text-orange-700"
                          : needsConfirm
                            ? "bg-amber-200 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                    }`}>
                      {message.meta.tool}
                    </span>
                  )}
                  {isUser && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">
              AI
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
              <LoadingDots />
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 pb-1 shrink-0">
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg flex items-center justify-between">
            <span className="truncate">{error}</span>
            <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600 shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white px-3 py-3 shrink-0">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="h-10 w-10 rounded-xl hover:bg-slate-100 flex items-center justify-center shrink-0 transition-colors"
            title="Quick prompts"
          >
            <svg className={`w-5 h-5 transition-colors ${showSuggestions ? "text-amber-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your rental operations..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:bg-white disabled:opacity-60 placeholder-slate-400 transition-colors"
            style={{ maxHeight: 160 }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!canSend}
            className="h-10 w-10 rounded-xl bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {showSuggestions && (
          <div className="flex flex-wrap gap-1.5 mt-2 max-w-3xl mx-auto">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p.label}
                onClick={() => pickSuggestion(p.text)}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-400 text-center mt-1.5">
          Enter to send · Shift+Enter for new line · Write actions require confirmation
        </p>
      </div>
    </div>
  );
};

export default AIAssistantPanel;
