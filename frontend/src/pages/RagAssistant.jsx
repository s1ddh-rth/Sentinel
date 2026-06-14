/* SENTINEL — RAG Assistant page (ported from prototype page-assistant.jsx) */
import React, { useState, useRef, useEffect } from "react";
import { Icon } from "../components/ui.jsx";
import { api } from "../lib/api.js";

// Conversations are kept ONLY in this browser's localStorage — never persisted on the server (the
// agent /chat endpoint is stateless). Users own their history here and can delete it at any time.
const STORAGE_KEY = "sentinel.assistant.conversations.v1";
const NEW_TITLE = "New conversation";

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const freshConversation = () => ({ id: uid(), title: NEW_TITLE, createdAt: Date.now(), messages: [] });

const formatDate = (ts) => {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* corrupt or unavailable storage — fall through to a fresh conversation */
  }
  return [freshConversation()];
}

export default function RagAssistant() {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const [input, setInput] = useState("");
  const [openCite, setOpenCite] = useState(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const activeConv = conversations.find(c => c.id === activeId) || conversations[0];
  const messages = activeConv ? activeConv.messages : [];

  // Persist to this browser only. Wrapped so a full/blocked localStorage never breaks the chat.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      /* ignore quota / private-mode errors — chat still works in-memory for this session */
    }
  }, [conversations]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, activeId]);

  // Append messages to a specific conversation, and set its title from the first question.
  const patchConversation = (id, updater) =>
    setConversations(cs => cs.map(c => (c.id === id ? updater(c) : c)));

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const convId = activeId;
    const question = input.trim();
    const userMsg = { role: "user", content: question };
    patchConversation(convId, c => ({
      ...c,
      title: c.title === NEW_TITLE ? question.slice(0, 48) : c.title,
      messages: [...c.messages, userMsg],
    }));
    setInput("");
    setOpenCite(null);
    setSending(true);
    try {
      const r = await api.chat({ session_id: convId, message: question, offender_id: "OFN-2014-0847" });
      // Map the agent's structured AgentResponse {answer, citations:[{source,snippet,score}]}.
      const citations = (r.citations || []).map((c, i) => ({
        idx: i + 1, source: c.source, chunk: c.snippet, score: c.score ?? 0,
      }));
      patchConversation(convId, c => ({
        ...c,
        messages: [...c.messages, {
          role: "assistant",
          content: r.answer || "(the assistant returned no answer)",
          citations,
          risk: r.risk_context || null,
          retrieval: "Hybrid",
          review: false,
        }],
      }));
    } catch (err) {
      patchConversation(convId, c => ({
        ...c,
        messages: [...c.messages, {
          role: "assistant",
          offline: true,
          content:
            "The assistant is currently offline. Retrieval and the risk/graph tools are live, but " +
            "answer generation needs a connected LLM. " +
            (err?.status === 503 ? "The agent service reported the model is unavailable." : ""),
          citations: [],
        }],
      }));
    } finally {
      setSending(false);
    }
  };

  const newConversation = () => {
    const conv = freshConversation();
    setConversations(cs => [conv, ...cs]);
    setActiveId(conv.id);
    setInput("");
    setOpenCite(null);
  };

  const deleteConversation = (id, e) => {
    if (e) e.stopPropagation();
    setConversations(cs => {
      const next = cs.filter(c => c.id !== id);
      // Never leave the user with zero conversations — start a fresh one if they deleted the last.
      const ensured = next.length ? next : [freshConversation()];
      if (id === activeId) setActiveId(ensured[0].id);
      return ensured;
    });
    setOpenCite(null);
  };

  const downloadTranscript = () => {
    if (messages.length === 0) return;
    const lines = messages.map(m => {
      const who = m.role === "user" ? "You" : "Assistant";
      const cites = (m.citations || []).map(c => `  [${c.idx}] ${c.source}`).join("\n");
      return `${who}: ${m.content}${cites ? "\n" + cites : ""}`;
    });
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentinel-assistant-transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, height: "calc(100vh - 56px - 64px)", minHeight: 580 }}>
      {/* Conversations sidebar */}
      <aside style={{
        background: "var(--color-bg-card)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-md)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid var(--color-divider)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>Conversations</h3>
            <span className="mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{conversations.length}</span>
          </div>
          <button className="btn btn-primary" onClick={newConversation} style={{ width: "100%", justifyContent: "center" }}>
            <Icon name="Plus" size={14} /> New conversation
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 6 }}>
          {conversations.map(c => {
            const isActive = c.id === activeId;
            return (
              <div key={c.id} onClick={() => { setActiveId(c.id); setOpenCite(null); }}
                className="conv-row"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 8px 8px 12px", cursor: "pointer", marginBottom: 2,
                  background: isActive ? "var(--color-accent-subtle)" : "transparent",
                  borderRadius: "var(--radius-sm)",
                  borderLeft: isActive ? "3px solid var(--color-accent)" : "3px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--color-bg-elevated)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {formatDate(c.createdAt)} · {c.messages.length} msg{c.messages.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button className="btn btn-ghost" title="Delete conversation" aria-label="Delete conversation"
                  onClick={e => deleteConversation(c.id, e)}
                  style={{ flexShrink: 0, padding: 6, color: "var(--color-text-tertiary)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--color-risk-high)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-tertiary)"}>
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main chat */}
      <div style={{
        background: "var(--color-bg-card)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-md)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeConv?.title || NEW_TITLE}
            </h2>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {activeConv ? `Started ${formatDate(activeConv.createdAt)}` : "New session"} · context: <span className="mono">OFN-2014-0847</span> · stored in your browser
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button className="btn btn-ghost" title="Download transcript" aria-label="Download transcript"
              onClick={downloadTranscript} disabled={messages.length === 0}>
              <Icon name="Download" size={15} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} style={{
          flex: 1, overflow: "auto", padding: "20px 24px 24px",
          background: "var(--color-bg-content)",
          display: "flex", flexDirection: "column", gap: 16,
        }}>
          <SystemMessage />
          {messages.map((m, i) => (
            <ChatMessage key={i} m={m} openCite={openCite} setOpenCite={setOpenCite} idx={i} />
          ))}
          {sending && (
            <div style={{ alignSelf: "flex-start", padding: "12px 16px", background: "var(--color-bg-card)",
              borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)",
              fontSize: 13, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 10 }}>
              <Dots /> Retrieving (hybrid) and generating…
            </div>
          )}
        </div>

        <form onSubmit={send} style={{
          padding: 16, borderTop: "1px solid var(--color-divider)",
          display: "flex", gap: 10, alignItems: "flex-end", background: "var(--color-bg-card)",
        }}>
          <div style={{ flex: 1, position: "relative" }}>
            <textarea className="textarea" rows={1}
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
              placeholder="Ask about policies, guidelines, or case details…"
              style={{ minHeight: 42, paddingRight: 60, resize: "none" }} />
            <div style={{ position: "absolute", right: 12, bottom: 10,
              fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
              ⏎ to send
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!input.trim() || sending}
            style={{ height: 42, flexShrink: 0, opacity: input.trim() && !sending ? 1 : 0.5 }}>
            <Icon name="Send" size={14} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}

function SystemMessage() {
  return (
    <div style={{
      padding: "14px 18px", background: "var(--color-bg-elevated)",
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
      borderLeft: "3px solid var(--color-accent)",
      fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6,
    }}>
      I can surface sentencing guidelines, policy documents, and case details, look up risk assessments,
      and query the knowledge graph. Responses cite their sources and tag the retrieval path so you can
      verify them. I am a research aid, not a decision-maker — confirm anything consequential against the
      cited source before acting on it.
    </div>
  );
}

function ChatMessage({ m, openCite, setOpenCite, idx }) {
  if (m.role === "user") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "75%", padding: "10px 14px",
        background: "var(--color-accent-subtle)", borderRadius: "var(--radius-md)",
        color: "var(--color-text-primary)", fontSize: 13.5, lineHeight: 1.55 }}>
        {m.content}
      </div>
    );
  }

  if (m.offline) {
    return (
      <div style={{ alignSelf: "flex-start", maxWidth: "82%", display: "flex", alignItems: "flex-start",
        gap: 10, padding: "14px 18px", background: "var(--color-risk-medium-bg)",
        border: "1px solid var(--color-border)", borderLeft: "3px solid var(--color-risk-medium)",
        borderRadius: "var(--radius-md)", color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
        <Icon name="AlertTriangle" size={15} color="var(--color-risk-medium)" />
        <span>{m.content}</span>
      </div>
    );
  }
  const parts = [];
  let last = 0;
  const re = /\[(\d+)\]/g; let mt;
  while ((mt = re.exec(m.content)) !== null) {
    parts.push(m.content.slice(last, mt.index));
    parts.push({ cite: +mt[1] });
    last = mt.index + mt[0].length;
  }
  parts.push(m.content.slice(last));

  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "82%" }}>
      <div style={{
        padding: "14px 18px", background: "var(--color-bg-card)",
        boxShadow: "var(--shadow-sm)", borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-primary)", fontSize: 14, lineHeight: 1.65,
      }}>
        {m.review && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--color-risk-medium-bg)", color: "var(--color-risk-medium)",
            padding: "6px 10px", borderRadius: "var(--radius-sm)",
            fontSize: 12, fontWeight: 500, marginBottom: 10,
          }}>
            <Icon name="AlertTriangle" size={13} />
            This response may require human review · ethical flag raised
          </div>
        )}
        <div style={{ position: "relative" }}>
          {parts.map((p, i) => {
            if (typeof p === "string") return <React.Fragment key={i}>{p}</React.Fragment>;
            const cite = (m.citations || []).find(c => c.idx === p.cite);
            const key = `${idx}-${p.cite}`;
            return (
              <span key={i} style={{ position: "relative", display: "inline-block" }}>
                <button className="citation-chip"
                  onClick={() => setOpenCite(openCite === key ? null : key)}>
                  {p.cite}
                </button>
                {openCite === key && cite && (
                  <div className="popover" style={{ left: 0, top: "calc(100% + 6px)", minWidth: 320 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {cite.source}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.55, fontStyle: "italic", marginBottom: 8 }}>
                      "{cite.chunk}"
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-divider)", paddingTop: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>relevance</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 600 }}>
                        {cite.score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </span>
            );
          })}
        </div>
      </div>
      {(m.citations || []).length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {m.citations.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "baseline", gap: 8, fontSize: 12,
              color: "var(--color-text-secondary)", padding: "4px 10px",
              background: "var(--color-bg-elevated)", borderRadius: "var(--radius-sm)",
            }}>
              <span className="mono" style={{ color: "var(--color-accent)" }}>[{c.idx}]</span>
              <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{c.source}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.chunk}
              </span>
              <span className="mono" style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                {Number(c.score).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: "var(--color-text-tertiary)", alignItems: "center" }}>
        <span className="tag">{m.retrieval} retrieval</span>
        {m.risk && (
          <>
            <span>·</span>
            <span>risk <span className="mono">{Number(m.risk.risk_score).toFixed(2)}</span> ({m.risk.risk_band})</span>
          </>
        )}
        <span>·</span>
        <span>{(m.citations || []).length} source{(m.citations || []).length === 1 ? "" : "s"}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 11 }}>
          <Icon name="ThumbsUp" size={12} /> Helpful
        </button>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 11 }}>
          <Icon name="Copy" size={12} />
        </button>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%", background: "var(--color-text-tertiary)",
          animation: `dotPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
      <style>{`@keyframes dotPulse { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }`}</style>
    </span>
  );
}
