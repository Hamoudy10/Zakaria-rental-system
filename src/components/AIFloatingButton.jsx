import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { aiAgentAPI } from "../services/api";

const MAX_LOCAL_HISTORY = 6;

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

const AIFloatingButton = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesSnapRef = useRef(messages);
  const [visible, setVisible] = useState(false);

  useEffect(() => { messagesSnapRef.current = messages; });

  const canUseAI = user?.role === "admin" || user?.role === "agent";
  const portalTargetRef = useRef(null);

  useEffect(() => {
    if (!canUseAI) return;
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    document.documentElement.appendChild(el);
    portalTargetRef.current = el;
    return () => { el.remove(); document.body.style.overflow = ""; };
  }, [canUseAI]);

  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem(`ai_floating_conv_${user.id}`);
    const id = stored || newConversationId();
    if (!stored) localStorage.setItem(`ai_floating_conv_${user.id}`, id);
    setConversationId(id);
    setMessages([{
      id: "welcome", role: "assistant",
      content: "Hi! I'm ZakariaAI, your rental operations assistant. Ask me about tenants, payments, complaints, water bills, or anything about your system.",
      created_at: new Date().toISOString(), meta: { tool: "system" },
    }]);
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = "hidden";
    } else {
      setVisible(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  }, []);

  useEffect(() => { autoResize(); }, [input, autoResize]);

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || loading || !canUseAI || !conversationId) return;

    const msgId = `asst-${Date.now()}`;
    const userMsg = { id: `usr-${Date.now()}`, role: "user", content: question, created_at: new Date().toISOString() };

    setMessages((prev) => [...prev, userMsg, { id: msgId, role: "assistant", content: "", created_at: new Date().toISOString(), meta: { streaming: true } }]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);
    setError("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const history = buildHistoryPayload(messagesSnapRef.current);
      await aiAgentAPI.askStream(question, history, conversationId, {
        onProgress: () => {},
        onToken: (token) => setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: m.content + token } : m)),
        onDone: (data) => {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, meta: { tool: data.tool || "dynamic_sql", records: data.records || 0, streaming: false }, content: m.content || data.answer || "Done." } : m));
          setLoading(false);
          textareaRef.current?.focus();
        },
        onError: (msg) => {
          setError(msg || "Stream failed.");
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: msg || "Error", meta: { tool: "error", streaming: false } } : m));
          setLoading(false);
        },
      });
    } catch (err) {
      setError("ZakariaAI is temporarily unavailable.");
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: "AI unavailable.", meta: { tool: "error", streaming: false } } : m));
      setLoading(false);
    }
  }, [input, loading, canUseAI, conversationId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const toggleListening = useCallback(() => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Speech not supported."); return; }
    const r = new SpeechRecognition();
    r.continuous = true; r.interimResults = true; r.lang = "en-KE";
    r.onresult = (e) => { let t = ""; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t); autoResize(); };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
    setIsListening(true);
  }, [isListening, autoResize]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (!canUseAI || !portalTargetRef.current) return null;

  return ReactDOM.createPortal(
    <>
      {/* Button */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9997,
          width: 56, height: 56, borderRadius: 16,
          background: "linear-gradient(135deg, #f59e0b, #b45309)",
          border: "2px solid rgba(255,255,255,0.2)",
          boxShadow: "0 4px 20px rgba(245,158,11,0.35)",
          cursor: "pointer", display: isOpen ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
          transition: "transform 200ms",
        }}
        title="ZakariaAI"
      >
        <svg width={24} height={24} fill="none" stroke="#fff" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      </button>
      {isOpen && panel}
    </>,
    portalTargetRef.current,
  );
};

export default AIFloatingButton;
