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

const formatTime = (s) => { try { return new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

const buildHistoryPayload = (m) => m.filter((x) => x.role === "user" || x.role === "assistant").slice(-MAX_LOCAL_HISTORY).map((x) => ({ role: x.role, content: x.content }));

const newId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });

const renderContent = (text) => {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const parts = []; let idx = 0; const re = /\*\*(.+?)\*\*/g; let m;
    while ((m = re.exec(line)) !== null) { if (m.index > idx) parts.push({ t: line.slice(idx, m.index), b: false }); parts.push({ t: m[1], b: true }); idx = m.index + m[0].length; }
    if (idx < line.length) parts.push({ t: line.slice(idx), b: false });
    return <span key={i} className="block leading-relaxed">{parts.length > 0 ? parts.map((p, j) => p.b ? <strong key={j} className="font-semibold text-slate-900">{p.t}</strong> : <span key={j}>{p.t}</span>) : line || "\u00A0"}</span>;
  });
};

const AIFloatingButton = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [convId, setConvId] = useState("");
  const [visible, setVisible] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const msgsRef = useRef(null);
  const taRef = useRef(null);
  const msgSnap = useRef(messages);
  const portalTgt = useRef(null);

  useEffect(() => { msgSnap.current = messages; });
  const canUse = user?.role === "admin" || user?.role === "agent";

  useEffect(() => {
    if (!canUse) return;
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    document.documentElement.appendChild(el);
    portalTgt.current = el;
    return () => { el.remove(); document.body.style.overflow = ""; };
  }, [canUse]);

  useEffect(() => {
    if (!user?.id) return;
    const s = localStorage.getItem(`ai_fcb_${user.id}`);
    const id = s || newId();
    if (!s) localStorage.setItem(`ai_fcb_${user.id}`, id);
    setConvId(id);
    setMessages([{ id: "w", role: "assistant", content: "Hi! I'm ZakariaAI. Ask me about tenants, payments, complaints, properties, or anything about your system.", created_at: new Date().toISOString(), meta: { tool: "system" } }]);
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) { requestAnimationFrame(() => setVisible(true)); document.body.style.overflow = "hidden"; }
    else { setVisible(false); document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => { const e = msgsRef.current; if (e) e.scrollTo({ top: e.scrollHeight, behavior: "smooth" }); }, [messages.length, loading]);

  const autoResize = useCallback(() => { const e = taRef.current; if (!e) return; e.style.height = "auto"; e.style.height = Math.min(e.scrollHeight, 100) + "px"; }, []);
  useEffect(() => { autoResize(); }, [input, autoResize]);

  const pickSuggestion = useCallback((t) => { setInput(t); setShowSuggestions(false); setTimeout(() => { taRef.current?.focus(); autoResize(); }, 50); }, [autoResize]);

  const sendMessage = useCallback(async () => {
    const q = input.trim();
    if (!q || loading || !canUse || !convId) return;
    const mid = `a-${Date.now()}`;
    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: "user", content: q, created_at: new Date().toISOString() }, { id: mid, role: "assistant", content: "", created_at: new Date().toISOString(), meta: { streaming: true } }]);
    setInput(""); setShowSuggestions(false); setLoading(true); setError("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      await aiAgentAPI.askStream(q, buildHistoryPayload(msgSnap.current), convId, {
        onProgress: () => {},
        onToken: (t) => setMessages((p) => p.map((m) => m.id === mid ? { ...m, content: m.content + t } : m)),
        onDone: (d) => { setMessages((p) => p.map((m) => m.id === mid ? { ...m, meta: { tool: d.tool || "sql", records: d.records || 0, streaming: false }, content: m.content || d.answer || "Done." } : m)); setLoading(false); taRef.current?.focus(); },
        onError: (e) => { setError(e || "Stream failed."); setMessages((p) => p.map((m) => m.id === mid ? { ...m, content: e || "Error", meta: { tool: "error", streaming: false } } : m)); setLoading(false); },
      });
    } catch { setError("ZakariaAI is temporarily unavailable."); setMessages((p) => p.map((m) => m.id === mid ? { ...m, content: "AI unavailable.", meta: { tool: "error", streaming: false } } : m)); setLoading(false); }
  }, [input, loading, canUse, convId]);

  const handleKeyDown = useCallback((e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }, [sendMessage]);

  if (!canUse || !portalTgt.current) return null;

  const isEmpty = messages.length === 1 && messages[0].id === "w";
  const hasStreaming = messages.some((m) => m.meta?.streaming);

  const panel = (
    <>
      <div onClick={() => setIsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.3)", opacity: visible ? 1 : 0, transition: "opacity 250ms", pointerEvents: visible ? "auto" : "none" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "auto", width: "100%", maxWidth: "420px", transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 250ms ease-out", display: "flex", flexDirection: "column", background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
        <div style={{ height: 56, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#f59e0b,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>AI</div>
            <div><div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>ZakariaAI</div><div style={{ fontSize: 10, color: "#94a3b8" }}>Powered by DeepSeek</div></div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => { setMessages([{ id: "w", role: "assistant", content: "Hi! I'm ZakariaAI.", created_at: new Date().toISOString(), meta: { tool: "system" } }]); setShowSuggestions(true); setError(""); }} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width={16} height={16} fill="none" stroke="#94a3b8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></button>
            <button onClick={() => setIsOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width={16} height={16} fill="none" stroke="#64748b" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>
        <div ref={msgsRef} style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto", padding: 16 }}>
          {isEmpty && showSuggestions && !loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#f59e0b,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}><svg width={28} height={28} fill="none" stroke="#fff" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg></div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#334155" }}>Ask ZakariaAI anything</div>
              <div style={{ fontSize: 12, color: "#64748b", maxWidth: 260 }}>Tenants, payments, complaints, properties, water bills, arrears, or search the web.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 260 }}>
                {SUGGESTED_PROMPTS.map((p) => <button key={p.label} onClick={() => pickSuggestion(p.text)} style={{ textAlign: "left", padding: "10px 14px", fontSize: 12, color: "#334155", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, cursor: "pointer" }}>{p.label}</button>)}
              </div>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.id === "w" && messages.length > 1) return null;
            const u = msg.role === "user"; const s = msg.meta?.streaming;
            return (
              <div key={msg.id} style={{ display: "flex", justifyContent: u ? "flex-end" : "flex-start", marginBottom: 12 }}>
                {!u && <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#f59e0b,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0, marginRight: 8, marginTop: 2 }}>AI</div>}
                <div style={{ maxWidth: "85%", borderRadius: 16, padding: "10px 14px", fontSize: 13, lineHeight: 1.5, background: u ? "#1e293b" : "#fff", color: u ? "#fff" : "#334155", border: u ? "none" : "1px solid #e2e8f0", borderBottomRightRadius: u ? 6 : 16, borderBottomLeftRadius: u ? 16 : 6, boxShadow: u ? "0 1px 3px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div>{renderContent(msg.content)}</div>
                  {s && !msg.content && <span style={{ color: "#f59e0b" }}>...</span>}
                  <div style={{ marginTop: 4, fontSize: 10, color: u ? "rgba(255,255,255,0.6)" : "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                    <span>{formatTime(msg.created_at)}</span>
                    {!u && msg.meta?.tool && msg.meta.tool !== "system" && !s && <span style={{ padding: "2px 6px", borderRadius: 99, fontSize: 9, background: "#f1f5f9", color: "#64748b" }}>{msg.meta.tool}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && !hasStreaming && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#f59e0b,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0, marginRight: 8, marginTop: 2 }}>AI</div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px 16px 16px 6px", padding: "10px 14px", display: "flex", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", animation: "ai-bounce 1.2s infinite" }} />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", animation: "ai-bounce 1.2s infinite", animationDelay: "0.15s" }} />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", animation: "ai-bounce 1.2s infinite", animationDelay: "0.3s" }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "10px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask anything..." rows={1} disabled={loading}
              style={{ flex: 1, resize: "none", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", padding: "10px 14px", fontSize: 13, lineHeight: 1.4, outline: "none", maxHeight: 100, minHeight: 42, fontFamily: "inherit", opacity: loading ? 0.5 : 1 }} />
            <button onClick={sendMessage} disabled={!canUse || loading || !input.trim()}
              style={{ width: 42, height: 42, borderRadius: 12, border: "none", background: canUse && input.trim() && !loading ? "#1e293b" : "#e2e8f0", color: canUse && input.trim() && !loading ? "#fff" : "#94a3b8", cursor: canUse && input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {SUGGESTED_PROMPTS.slice(0, 3).map((p) => <button key={p.label} onClick={() => pickSuggestion(p.text)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, border: "1px solid #e2e8f0", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>{p.label}</button>)}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 6 }}>Enter to send · Shift+Enter new line</div>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(
    <>
      <style>{`@keyframes ai-bounce{0%,80%,to{transform:scale(.4);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
      <button onClick={() => setIsOpen(true)} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9997, pointerEvents: "auto", width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#f59e0b,#b45309)", border: "2px solid rgba(255,255,255,0.2)", boxShadow: "0 4px 20px rgba(245,158,11,0.35)", cursor: "pointer", display: isOpen ? "none" : "flex", alignItems: "center", justifyContent: "center" }} title="ZakariaAI">
        <svg width={24} height={24} fill="none" stroke="#fff" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
      </button>
      {isOpen && panel}
    </>,
    portalTgt.current,
  );
};

export default AIFloatingButton;
