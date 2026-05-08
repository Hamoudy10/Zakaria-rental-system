import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { aiAgentAPI } from "../services/api";

const MAX_LOCAL_HISTORY = 6;

const LOADING_STEPS = [
  { label: "Understanding...", icon: "🧠" },
  { label: "Querying database...", icon: "🔍" },
  { label: "Formatting...", icon: "📊" },
];

const SUGGESTED_PROMPTS = [
  { label: "Tenants owing rent", text: "who has not paid this month" },
  { label: "Payment overview", text: "show recent payments" },
  { label: "Vacant units", text: "how many vacant units do we have" },
  { label: "Open complaints", text: "list open complaints" },
  { label: "Search the web", text: "search the web for latest property market trends in Kenya" },
];

const formatTime = (dateStr) => {
  try { return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

const buildHistoryPayload = (messages) =>
  messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-MAX_LOCAL_HISTORY).map((m) => ({ role: m.role, content: m.content }));

const newConversationId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });

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
        {boldParts.length > 0 ? boldParts.map((p, j) => (p.bold ? <strong key={j} className="font-semibold text-slate-900">{p.text}</strong> : <span key={j}>{p.text}</span>)) : line || "\u00A0"}
      </span>
    );
  });
};

const LoadingStep = ({ step }) => (
  <div className="flex items-center gap-2 px-1 py-1">
    <span className="text-sm">{LOADING_STEPS[step]?.icon}</span>
    <span className="text-xs text-slate-500 animate-pulse">{LOADING_STEPS[step]?.label}</span>
  </div>
);

const AIFloatingButton = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const stepTimerRef = useRef(null);
  const messagesSnapRef = useRef(messages);

  useEffect(() => { messagesSnapRef.current = messages; });

  const canUseAI = user?.role === "admin" || user?.role === "agent";

  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem(`ai_floating_conv_${user.id}`);
    const id = stored || newConversationId();
    if (!stored) localStorage.setItem(`ai_floating_conv_${user.id}`, id);
    setConversationId(id);
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm ZakariaAI, your rental operations assistant. Ask me about tenants, payments, complaints, water bills, or anything about your system.",
      created_at: new Date().toISOString(),
      meta: { tool: "system" },
    }]);
  }, [user?.id]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  useEffect(() => { autoResize(); }, [input, autoResize]);

  const pickSuggestion = useCallback((text) => {
    setInput(text);
    setShowSuggestions(false);
    setTimeout(() => { textareaRef.current?.focus(); autoResize(); }, 50);
  }, [autoResize]);

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || loading || !canUseAI || !conversationId) return;

    const msgId = `assistant-${Date.now()}`;
    const userMsg = { id: `user-${Date.now()}`, role: "user", content: question, created_at: new Date().toISOString() };

    setMessages((prev) => [...prev, userMsg, { id: msgId, role: "assistant", content: "", created_at: new Date().toISOString(), meta: { tool: "streaming", streaming: true } }]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);
    setError("");

    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    try {
      const history = buildHistoryPayload(messagesSnapRef.current);
      await aiAgentAPI.askStream(question, history, conversationId, {
        onProgress: (step) => {
          if (step === "understanding") setLoadingStep(0);
          else if (step === "routing") setLoadingStep(1);
          else setLoadingStep(2);
        },
        onToken: (token) => {
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: m.content + token } : m)));
        },
        onDone: (data) => {
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, meta: { tool: data.tool || "dynamic_sql", records: data.records || 0, streaming: false }, content: m.content || data.answer || "Done." } : m)));
          setLoading(false);
          textareaRef.current?.focus();
        },
        onError: (msg) => {
          setError(msg || "Stream failed.");
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: msg || "Error", meta: { tool: "error", streaming: false } } : m)));
          setLoading(false);
        },
      });
    } catch (err) {
      setError("ZakariaAI is temporarily unavailable.");
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: "AI assistant is temporarily unavailable.", meta: { tool: "error", streaming: false } } : m)));
      setLoading(false);
    }
  }, [input, loading, canUseAI, conversationId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Speech recognition is not supported in your browser."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-KE";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setInput(transcript);
      autoResize();
    };
    recognition.onerror = (event) => { console.error("Speech error:", event.error); setIsListening(false); };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, autoResize]);

  useEffect(() => { return () => { recognitionRef.current?.stop(); }; }, []);

  if (!canUseAI) return null;

  const hasStreaming = messages.some((m) => m.meta?.streaming);
  const isEmpty = messages.length === 1 && messages[0].id === "welcome";

  return ReactDOM.createPortal(
    <>
      {/* Floating button — always visible, fixed bottom-right */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="z-[99999] w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-white/20"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          background: isOpen ? "#1e293b" : "linear-gradient(135deg, #f59e0b, #b45309)",
          transform: isOpen ? "scale(0)" : "scale(1)",
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? "none" : "auto",
        }}
        title="ZakariaAI Assistant"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      </button>

      {/* Fullscreen overlay when open */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Chat panel — fixed right side, screen height, slide-in width */}
          <div className="fixed top-0 bottom-0 right-0 z-[99999] w-full sm:w-[420px] flex flex-col bg-white shadow-2xl transform transition-transform duration-300">
            {/* Header */}
            <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center text-[10px] font-bold">AI</div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">ZakariaAI</h3>
                  <p className="text-[10px] text-slate-400">Powered by DeepSeek</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setMessages([{ id: "welcome", role: "assistant", content: "Hi! I'm ZakariaAI.", created_at: new Date().toISOString(), meta: { tool: "system" } }]); setShowSuggestions(true); setError(""); }}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                  title="New chat"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Messages — scrollable middle */}
            <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              {isEmpty && showSuggestions && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                  </div>
                  <p className="text-slate-700 font-semibold text-sm">Ask ZakariaAI anything</p>
                  <p className="text-slate-500 text-xs max-w-xs">Tenants, payments, complaints, properties, water bills, arrears, or search the web.</p>
                  <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button key={p.label} onClick={() => pickSuggestion(p.text)} className="text-left px-3 py-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors">{p.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const isError = msg.meta?.tool === "error";
                const isStreaming = msg.meta?.streaming;
                if (msg.id === "welcome" && messages.length > 1) return null;
                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0 mr-2 mt-0.5">AI</div>}
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm text-sm ${isUser ? "bg-slate-800 text-white rounded-br-md" : isError ? "bg-red-50 border border-red-200 text-red-800 rounded-bl-md" : isStreaming ? "bg-white border border-amber-300 text-slate-800 rounded-bl-md shadow-md shadow-amber-100" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}>
                      <div>{renderMessageContent(msg.content)}</div>
                      {isStreaming && !msg.content && <span className="text-amber-400 animate-pulse">...</span>}
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span>{formatTime(msg.created_at)}</span>
                        {!isUser && msg.meta?.tool && msg.meta.tool !== "error" && !isStreaming && (
                          <span className="px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">{msg.meta.tool}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {loading && !hasStreaming && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0 mr-2 mt-0.5">AI</div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3 py-2 shadow-sm"><LoadingStep step={loadingStep} /></div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 pb-1 shrink-0">
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg flex items-center justify-between">
                  <span className="truncate">{error}</span>
                  <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600 shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            )}

            {/* Input — fixed at bottom */}
            <div className="border-t border-slate-200 bg-white px-3 py-2.5 shrink-0">
              <div className="flex gap-2 items-end max-w-3xl mx-auto">
                <button
                  onClick={toggleListening}
                  disabled={loading}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isListening ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  } disabled:opacity-40`}
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Listening..." : "Ask ZakariaAI anything..."}
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:bg-white disabled:opacity-60 placeholder-slate-400 transition-colors"
                  style={{ maxHeight: 120, minHeight: 44 }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!canUseAI || loading || !input.trim()}
                  className="h-10 w-10 rounded-xl bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
              {showSuggestions && isEmpty && (
                <div className="flex flex-wrap gap-1 mt-2 max-w-3xl mx-auto">
                  {SUGGESTED_PROMPTS.slice(0, 3).map((p) => (
                    <button key={p.label} onClick={() => pickSuggestion(p.text)} className="text-[10px] px-2 py-1 rounded-full border border-slate-200 text-slate-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition-colors">{p.label}</button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400 text-center mt-1">Enter to send · Shift+Enter new line · 🎤 Voice</p>
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
};

export default AIFloatingButton;
