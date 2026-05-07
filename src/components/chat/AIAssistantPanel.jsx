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
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const formatDate = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

const buildHistoryPayload = (messages) =>
  messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-MAX_LOCAL_HISTORY).map((m) => ({ role: m.role, content: m.content }));

const newConversationId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const LOADING_STEPS = [
  { label: "Understanding your question...", icon: "🧠" },
  { label: "Querying database...", icon: "🔍" },
  { label: "Formatting results...", icon: "📊" },
];

const LoadingDots = () => (
  <div className="flex gap-1 px-1 py-2">
    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
  </div>
);

const LoadingStep = ({ step }) => (
  <div className="flex items-center gap-2 px-1 py-2">
    <span className="text-sm">{LOADING_STEPS[step]?.icon}</span>
    <span className="text-xs text-slate-500 animate-pulse">{LOADING_STEPS[step]?.label}</span>
    <span className="text-[10px] text-slate-400">{step + 1}/{LOADING_STEPS.length}</span>
  </div>
);

const renderMessageContent = (text) => {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const boldParts = [];
    let lastIdx = 0;
    const re = /\*\*(.+?)\*\*/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIdx) boldParts.push({ text: line.slice(lastIdx, m.index), bold: false });
      boldParts.push({ text: m[1], bold: true });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < line.length) boldParts.push({ text: line.slice(lastIdx), bold: false });
    return (
      <span key={i} className="block leading-relaxed">
        {boldParts.length > 0
          ? boldParts.map((p, j) => (p.bold ? <strong key={j} className="font-semibold text-slate-900">{p.text}</strong> : <span key={j}>{p.text}</span>))
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
  const [conversations, setConversations] = useState([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const stepTimerRef = useRef(null);

  useEffect(() => {
    if (loading) {
      setLoadingStep(0);
      let step = 0;
      stepTimerRef.current = setInterval(() => {
        step = (step + 1) % LOADING_STEPS.length;
        setLoadingStep(step);
      }, 2500);
    } else {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setLoadingStep(0);
    }
    return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
  }, [loading]);

  const welcomeMessage = useMemo(
    () => ({
      id: "welcome-ai",
      role: "assistant",
      content: "Hello! I'm your AI Operations Assistant. I can help with tenant balances, payments, complaints, water bills, dashboard stats, and more. I can also send SMS reminders, create water bills, and search the web. Just ask!",
      created_at: new Date().toISOString(),
      meta: { tool: "system" },
    }),
    [],
  );

  const loadConversations = useCallback(async () => {
    if (!canUseAI) return;
    try {
      const res = await aiAgentAPI.getConversations(30);
      setConversations(res?.data?.data?.conversations || []);
    } catch {
      // non-critical
    }
  }, [canUseAI]);

  const loadHistory = useCallback(
    async (convId) => {
      if (!convId) return;
      setHistoryLoading(true);
      setError("");
      try {
        const res = await aiAgentAPI.getHistory(convId, 200);
        const items = res?.data?.data?.items || [];
        if (!items.length) {
          setMessages([welcomeMessage]);
          return;
        }
        setMessages(
          items.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.message_text,
            created_at: r.created_at,
            meta: {
              tool: r.tool_used || "history",
              blocked: Boolean(r.blocked),
              fallback: Boolean(r.fallback),
              records: Number(r.records_count || 0),
            },
          })),
        );
      } catch {
        setMessages([welcomeMessage]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [welcomeMessage],
  );

  useEffect(() => {
    if (!currentUserId) return;
    const stored = localStorage.getItem(`ai_active_conversation_${currentUserId}`);
    const id = stored || newConversationId();
    if (!stored) localStorage.setItem(`ai_active_conversation_${currentUserId}`, id);
    setConversationId(id);
  }, [currentUserId]);

  useEffect(() => {
    if (!canUseAI || !conversationId) return;
    loadHistory(conversationId);
  }, [canUseAI, conversationId, loadHistory]);

  useEffect(() => {
    if (canUseAI) loadConversations();
  }, [canUseAI, loadConversations, conversationId, messages.length]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 300) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const canSend = useMemo(
    () => canUseAI && !loading && !historyLoading && input.trim().length > 0 && Boolean(conversationId),
    [canUseAI, input, loading, historyLoading, conversationId],
  );

  const switchConversation = useCallback(
    (convId) => {
      if (convId === conversationId) {
        setShowSidebar(false);
        return;
      }
      localStorage.setItem(`ai_active_conversation_${currentUserId}`, convId);
      setConversationId(convId);
      setMessages([welcomeMessage]);
      setShowSidebar(false);
    },
    [conversationId, currentUserId, welcomeMessage],
  );

  const startNewConversation = useCallback(() => {
    const id = newConversationId();
    localStorage.setItem(`ai_active_conversation_${currentUserId}`, id);
    setConversationId(id);
    setMessages([welcomeMessage]);
    setShowSidebar(false);
    setError("");
  }, [currentUserId, welcomeMessage]);

  const deleteCurrentConversation = useCallback(async () => {
    if (!conversationId) return;
    try {
      await aiAgentAPI.deleteConversation(conversationId);
    } catch {
      // proceed even if delete fails
    }
    loadConversations();
    startNewConversation();
  }, [conversationId, loadConversations, startNewConversation]);

  const deleteConversationById = useCallback(
    async (convId) => {
      try {
        await aiAgentAPI.deleteConversation(convId);
        loadConversations();
        if (convId === conversationId) startNewConversation();
      } catch {
        // non-critical
      }
    },
    [conversationId, loadConversations, startNewConversation],
  );

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || !canSend) return;

    const msgId = `assistant-${Date.now()}`;
    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: msgId, role: "assistant", content: "", created_at: new Date().toISOString(), meta: { tool: "streaming", streaming: true } },
    ]);
    setInput("");
    setLoading(true);
    setError("");
    setLoadingStep(0);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }

    try {
      const history = buildHistoryPayload(messages);
      await aiAgentAPI.askStream(question, history, conversationId, {
        onProgress: (step) => {
          if (step === "understanding") setLoadingStep(0);
          else if (step === "routing") setLoadingStep(1);
          else if (step === "querying" || step === "formatting") setLoadingStep(2);
        },
        onToken: (token) => {
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: m.content + token } : m)));
        },
        onDone: (data) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, meta: { tool: data.tool || "dynamic_sql", records: data.records || 0, streaming: false }, content: m.content || data.answer || "Done." }
                : m,
            ),
          );
          setLoading(false);
          setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 100);
        },
        onError: (msg) => {
          setError(msg || "Stream failed.");
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: msg || "Error", meta: { tool: "error", streaming: false } } : m)));
          setLoading(false);
          setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 100);
        },
      });
    } catch (err) {
      setError("AI assistant is temporarily unavailable.");
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: "AI assistant is temporarily unavailable.", meta: { tool: "error", streaming: false } } : m)));
      setLoading(false);
    }
  }, [input, canSend, messages, conversationId]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const pickSuggestion = useCallback(
    (text) => {
      setInput(text);
      setTimeout(() => {
        textareaRef.current?.focus();
        autoResize();
      }, 50);
    },
    [autoResize],
  );

  if (!canUseAI) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h3 className="font-semibold text-slate-800">AI Assistant</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="text-slate-500 text-sm">AI Assistant is available for Admin and Agent roles only.</p>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 1 && messages[0].id === "welcome-ai";

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50">
      {/* Sidebar overlay for mobile */}
      {showSidebar && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setShowSidebar(false)}>
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Conversation sidebar */}
      <div
        className={`${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        } fixed md:relative z-40 md:z-0 md:translate-x-0 w-72 shrink-0 h-full bg-white border-r border-slate-200 flex flex-col transition-transform duration-200`}
      >
        <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-800 text-sm">Conversations</h3>
          <button onClick={() => setShowSidebar(false)} className="md:hidden w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <button
          onClick={startNewConversation}
          className="mx-3 mt-3 mb-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 text-sm font-medium hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Chat
        </button>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {conversations.map((conv) => (
            <div
              key={conv.conversationId}
              onClick={() => switchConversation(conv.conversationId)}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                conv.conversationId === conversationId
                  ? "bg-amber-50 border border-amber-200"
                  : "hover:bg-slate-50 border border-transparent"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${conv.conversationId === conversationId ? "text-amber-900 font-medium" : "text-slate-700"}`}>
                  {conv.title}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {conv.messageCount} messages · {formatDate(conv.lastActiveAt)}
                  {conv.hasPending ? " · ⏳" : ""}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversationById(conv.conversationId);
                }}
                className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center shrink-0 transition-opacity"
                title="Delete conversation"
              >
                <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {conversations.length === 0 && !historyLoading && (
            <p className="text-xs text-slate-400 text-center py-8 px-4">No conversations yet. Start a new chat!</p>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setShowSidebar(!showSidebar)} className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button onClick={onBack} className="md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-800 truncate text-sm">AI Assistant</h3>
              <p className="text-[10px] text-slate-400 truncate">Phase 2 — Read + Write</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={deleteCurrentConversation} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center" title="Delete this conversation">
              <svg className="w-4 h-4 text-slate-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {historyLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"><p className="text-sm text-slate-500">Loading...</p></div>
            </div>
          )}

          {isEmpty && !historyLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
              </div>
              <p className="text-slate-700 font-semibold">AI Operations Assistant</p>
              <p className="text-slate-500 text-sm max-w-xs">Ask about tenants, payments, complaints, properties, or water bills. Send SMS reminders, create water bills, or search the web.</p>
              <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button key={p.label} onClick={() => pickSuggestion(p.text)} className="text-left px-4 py-2.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors shadow-sm">{p.label}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const isError = msg.meta?.tool === "error";
            const needsConfirm = msg.meta?.needsConfirmation;
            const isStreaming = msg.meta?.streaming;
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">AI</div>}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${isUser ? "bg-slate-800 text-white rounded-br-md" : isError ? "bg-red-50 border border-red-200 text-red-800 rounded-bl-md" : needsConfirm ? "bg-amber-50 border-2 border-amber-300 text-slate-800 rounded-bl-md" : isStreaming ? "bg-white border border-amber-300 text-slate-800 rounded-bl-md shadow-md shadow-amber-100" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}>
                  <div className="text-sm">{renderMessageContent(msg.content)}</div>
                  {isStreaming && !msg.content && (
                    <div className="flex items-center gap-1 text-amber-400 text-sm">
                      <span className="animate-pulse">...</span>
                    </div>
                  )}
                  <div className={`mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-400`}>
                    <span>{formatTime(msg.created_at)}</span>
                    {!isUser && msg.meta?.tool && msg.meta.tool !== "error" && (
                      <span className={`px-2 py-0.5 rounded-full font-medium ${msg.meta.blocked ? "bg-red-100 text-red-700" : msg.meta.fallback ? "bg-orange-100 text-orange-700" : needsConfirm ? "bg-amber-200 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{msg.meta.tool}</span>
                    )}
                    {isUser && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {loading && !messages.some((m) => m.meta?.streaming) && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">AI</div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm min-w-[220px]"><LoadingStep step={loadingStep} /></div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 pb-1 shrink-0">
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg flex items-center justify-between">
              <span className="truncate">{error}</span>
              <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 bg-white px-3 py-3 shrink-0">
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your rental operations..."
              rows={3}
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:bg-white disabled:opacity-60 placeholder-slate-400 transition-colors"
              style={{ maxHeight: 300, minHeight: 60 }}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="h-12 w-12 rounded-xl bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors self-end mb-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 max-w-3xl mx-auto">
            {SUGGESTED_PROMPTS.slice(0, 5).map((p) => (
              <button key={p.label} onClick={() => pickSuggestion(p.text)} className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition-colors">{p.label}</button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1.5">Enter to send · Shift+Enter for new line · Write actions require confirmation</p>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPanel;
