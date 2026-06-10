import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../api/config";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SUGGESTED = [
  "How do I start a debate?",
  "What does the Moderator do?",
  "How do I export a session?",
  "What is the confidence score?",
];

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the **MultiMind Assistant** 🧠\n\nI can answer questions about how the app works, the agents, features, API, or anything else. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamedResponseRef = useRef("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    // placeholder assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    abortRef.current = new AbortController();
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_BASE_URL}/chatbot/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, history }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      streamedResponseRef.current = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { chunk?: string };
            streamedResponseRef.current = `${streamedResponseRef.current}${parsed.chunk ?? ""}`;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: streamedResponseRef.current,
                streaming: true,
              };
              return updated;
            });
          } catch {
            // ignore parse errors
          }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: streamedResponseRef.current };
        return updated;
      });
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 9999,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: open
            ? "linear-gradient(135deg,#4a4080,#2a5a50)"
            : "linear-gradient(135deg,#6c63ff,#00d4aa)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: open ? "1.2rem" : "1.5rem",
          boxShadow: "0 4px 24px rgba(108,99,255,.5)",
          transition: "all .3s",
          color: "#fff",
        }}
        title="MultiMind Assistant"
        aria-label="Open AI assistant"
      >
        {open ? "✕" : "🧠"}
      </button>

      {/* Unread dot when closed */}
      {!open && (
        <span
          style={{
            position: "fixed",
            bottom: 72,
            right: 26,
            zIndex: 10000,
            width: 10,
            height: 10,
            background: "#00d4aa",
            borderRadius: "50%",
            border: "2px solid #0b0d12",
            animation: "chatPulse 2s ease infinite",
          }}
        />
      )}

      {/* Chat panel */}
      <div
        style={{
          position: "fixed",
          bottom: 96,
          right: 28,
          zIndex: 9998,
          width: 380,
          maxWidth: "calc(100vw - 40px)",
          height: 520,
          maxHeight: "calc(100vh - 120px)",
          background: "#13161f",
          border: "1px solid #252a3d",
          borderRadius: 20,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(108,99,255,.15)",
          transform: open ? "scale(1) translateY(0)" : "scale(.92) translateY(16px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transition: "all .3s cubic-bezier(.34,1.56,.64,1)",
          transformOrigin: "bottom right",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid #252a3d",
            background: "linear-gradient(135deg,rgba(108,99,255,.12),rgba(0,212,170,.08))",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#6c63ff,#00d4aa)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1rem",
              flexShrink: 0,
            }}
          >
            🧠
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#eef0f8" }}>
              MultiMind Assistant
            </div>
            <div style={{ fontSize: ".72rem", color: "#00d4aa", display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: "#00d4aa",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "chatPulse 2s ease infinite",
                }}
              />
              Online · Ask me anything
            </div>
          </div>
          <button
            onClick={() => setMessages([{role:"assistant",content:"Hi! I'm the **MultiMind Assistant** 🧠\n\nI can answer questions about how the app works, the agents, features, API, or anything else. What would you like to know?"}])}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "#7a84a0",
              cursor: "pointer",
              fontSize: ".75rem",
              padding: "4px 8px",
              borderRadius: 6,
              fontFamily: "inherit",
              transition: "color .2s",
            }}
            title="Clear chat"
            onMouseOver={(e) => (e.currentTarget.style.color = "#eef0f8")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#7a84a0")}
          >
            Clear
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            scrollbarWidth: "thin",
            scrollbarColor: "#252a3d #0b0d12",
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              {m.role === "assistant" && (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#6c63ff,#00d4aa)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: ".7rem",
                    flexShrink: 0,
                  }}
                >
                  🧠
                </div>
              )}
              <div
                style={{
                  maxWidth: "82%",
                  padding: "10px 14px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background:
                    m.role === "user"
                      ? "linear-gradient(135deg,#6c63ff,#5a54e0)"
                      : "#1a1e2e",
                  color: "#eef0f8",
                  fontSize: ".855rem",
                  lineHeight: 1.6,
                  border: m.role === "assistant" ? "1px solid #252a3d" : "none",
                  position: "relative",
                }}
              >
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
                    code: ({ children }) => (
                      <code style={{
                        background: "rgba(255,255,255,.1)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontFamily: "monospace",
                        fontSize: ".85em",
                      }}>
                        {children}
                      </code>
                    ),
                    ul: ({ children }) => <ul style={{ margin: 0, paddingLeft: 18 }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: 0, paddingLeft: 18 }}>{children}</ol>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
              {m.streaming && (
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 14,
                    background: "#6c63ff",
                    borderRadius: 2,
                    animation: "cursorBlink .7s step-end infinite",
                    marginLeft: -6,
                    marginBottom: 10,
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          ))}

          {loading && messages[messages.length - 1]?.content === "" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6c63ff,#00d4aa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem" }}>🧠</div>
              <div style={{ background: "#1a1e2e", border: "1px solid #252a3d", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", display: "flex", gap: 5 }}>
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#6c63ff",
                      animation: `dotBounce .9s ease infinite`,
                      animationDelay: `${d * 0.15}s`,
                      display: "inline-block",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Suggested chips — only show on fresh chat */}
          {messages.length === 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: "rgba(108,99,255,.1)",
                    border: "1px solid rgba(108,99,255,.25)",
                    color: "#a09cf7",
                    borderRadius: 99,
                    padding: "5px 12px",
                    fontSize: ".75rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all .2s",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "rgba(108,99,255,.2)"; e.currentTarget.style.color = "#eef0f8"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "rgba(108,99,255,.1)"; e.currentTarget.style.color = "#a09cf7"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid #252a3d",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            background: "#0f1118",
            flexShrink: 0,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about MultiMind…"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              background: "#1a1e2e",
              border: "1px solid #252a3d",
              borderRadius: 12,
              color: "#eef0f8",
              padding: "10px 14px",
              fontSize: ".875rem",
              fontFamily: "inherit",
              outline: "none",
              lineHeight: 1.5,
              maxHeight: 100,
              overflowY: "auto",
              transition: "border-color .2s",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#6c63ff")}
            onBlur={(e) => (e.target.style.borderColor = "#252a3d")}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background:
                loading || !input.trim()
                  ? "#252a3d"
                  : "linear-gradient(135deg,#6c63ff,#00d4aa)",
              border: "none",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              color: loading || !input.trim() ? "#7a84a0" : "#fff",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all .2s",
            }}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>

      <style>{`
        @keyframes chatPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.5)} }
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes dotBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
      `}</style>
    </>
  );
}
