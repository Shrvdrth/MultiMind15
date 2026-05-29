import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { submitUserInput } from '../api/debate';
import type { DebateSessionDto } from '../api/debate';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'divider';
  agentType?: string;
  text: string;
  isStreaming?: boolean;
  round?: number;
  isUserInput?: boolean; // true = injected mid-debate (right-aligned), false = original prompt
}

interface DebateEvent {
  eventType: string;
  sessionId: string;
  round?: number;
  agentType?: string;
  text?: string;
}

export interface ChatDebateViewProps {
  sessionId: string;
  userPrompt: string;
  /** If provided, the component renders in completed/static mode instead of streaming */
  completedSession?: DebateSessionDto;
  onComplete?: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const AGENT_COLORS: Record<string, string> = {
  Strategist:  'var(--strategist, #6366f1)',
  RiskAnalyst: 'var(--risk, #f87171)',
  Engineer:    'var(--engineer, #34d399)',
  Moderator:   'var(--moderator, #a855f7)',
};

const AGENT_ICONS: Record<string, string> = {
  Strategist:  '🎯',
  RiskAnalyst: '⚠️',
  Engineer:    '⚙️',
  Moderator:   '🧠',
};

const AGENT_DISPLAY: Record<string, string> = {
  Strategist:  'Strategist',
  RiskAnalyst: 'Risk Analyst',
  Engineer:    'Engineer',
  Moderator:   'Moderator',
};

// ── Build messages from a completed DebateSessionDto ─────────────────────────

function buildFromSession(session: DebateSessionDto): ChatMessage[] {
  const msgs: ChatMessage[] = [];

  msgs.push({
    id: 'prompt',
    role: 'user',
    text: session.originalPrompt,
    isUserInput: false,
  });

  for (const round of session.rounds) {
    msgs.push({ id: `div-r${round.roundNumber}`, role: 'divider', text: `Round ${round.roundNumber}` });
    for (const r of round.responses) {
      msgs.push({
        id: `r${round.roundNumber}-${r.agentType}`,
        role: 'agent',
        agentType: r.agentType,
        text: r.responseText,
        round: round.roundNumber,
      });
    }
  }

  if (session.userInput) {
    msgs.push({
      id: 'user-input',
      role: 'user',
      text: session.userInput,
      isUserInput: true,
    });
  }

  if (session.synthesis) {
    msgs.push({ id: 'div-mod', role: 'divider', text: 'Moderator Synthesis' });
    msgs.push({
      id: 'moderator',
      role: 'agent',
      agentType: 'Moderator',
      text: session.synthesis.fullSynthesis,
    });
  }

  return msgs;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatDebateView({ sessionId, userPrompt, completedSession, onComplete }: ChatDebateViewProps) {
  const { token } = useAuth();
  const [messages, setMessages]             = useState<ChatMessage[]>(() =>
    completedSession ? buildFromSession(completedSession) : [{
      id: 'prompt', role: 'user', text: userPrompt, isUserInput: false,
    }]
  );
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null);
  const [status, setStatus]                 = useState<'connecting' | 'live' | 'waiting-input' | 'done' | 'error'>(
    completedSession ? 'done' : 'connecting'
  );
  const [inputText, setInputText]           = useState('');
  const [inputSending, setInputSending]     = useState(false);
  const [inputSubmitted, setInputSubmitted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentRoundRef = useRef(0);

  // ── Typewriter engine state ──────────────────────────────
  const typingQueues    = useRef<Map<string, string>>(new Map());
  const nextCharTime    = useRef<Map<string, number>>(new Map());
  const streamingMsgIds = useRef<Map<string, string>>(new Map());
  const displayedRef    = useRef<Record<string, string>>({});
  const [displayedTexts, setDisplayedTexts] = useState<Record<string, string>>({});
  const [verdictData, setVerdictData] = useState<{ confidenceScore: number; recommendation: string } | null>(null);

  // ── Static / completed mode — no streaming ──
  useEffect(() => {
    if (completedSession) {
      setMessages(buildFromSession(completedSession));
    }
  }, [completedSession]);

  // ── Live streaming mode ──
  useEffect(() => {
    if (completedSession || !token) return;

    const url = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5125/api'}/debate/${sessionId}/stream`;
    const controller = new AbortController();

    const streamSSE = async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { setStatus('error'); return; }

        setStatus('live');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            try {
              const evt: DebateEvent = JSON.parse(line.slice(5).trim());
              handleEvent(evt);
            } catch { /* skip malformed */ }
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string }).name !== 'AbortError') setStatus('error');
      }
    };

    const handleEvent = (evt: DebateEvent) => {
      switch (evt.eventType) {
        case 'RoundStart':
          currentRoundRef.current = evt.round ?? 0;
          setMessages(prev => [...prev, {
            id: `div-r${evt.round}-${Date.now()}`,
            role: 'divider',
            text: `Round ${evt.round}`,
          }]);
          break;

        case 'AgentStart': {
          const newMsgId = `${evt.agentType}-${Date.now()}`;
          streamingMsgIds.current.set(evt.agentType!, newMsgId);
          typingQueues.current.set(newMsgId, '');
          const initDisplayed = { ...displayedRef.current, [newMsgId]: '' };
          displayedRef.current = initDisplayed;
          setDisplayedTexts(initDisplayed);
          setStreamingAgent(evt.agentType ?? null);
          setMessages(prev => [...prev, {
            id: newMsgId,
            role: 'agent',
            agentType: evt.agentType,
            text: '',
            isStreaming: true,
            round: currentRoundRef.current,
          }]);
          break;
        }

        case 'AgentChunk': {
          const chunk = evt.text ?? '';
          const qMsgId = streamingMsgIds.current.get(evt.agentType!);
          if (qMsgId) {
            typingQueues.current.set(qMsgId, (typingQueues.current.get(qMsgId) ?? '') + chunk);
            setMessages(prev => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].id === qMsgId) {
                  updated[i] = { ...updated[i], text: updated[i].text + chunk };
                  break;
                }
              }
              return updated;
            });
          }
          break;
        }

        case 'AgentDone':
          setStreamingAgent(null);
          setMessages(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].agentType === evt.agentType && updated[i].isStreaming) {
                updated[i] = { ...updated[i], isStreaming: false };
                break;
              }
            }
            return updated;
          });
          break;

        case 'WaitingForUserInput':
          setStatus('waiting-input');
          break;

        case 'UserInputReceived':
          setInputSubmitted(true);
          setStatus('live');
          if (evt.text) {
            setMessages(prev => [...prev, {
              id: `user-input-${Date.now()}`,
              role: 'user',
              text: evt.text!,
              isUserInput: true,
            }]);
          }
          break;

        case 'RoundEnd':
          break;

        case 'ModeratorStart': {
          const modId = `moderator-${Date.now()}`;
          streamingMsgIds.current.set('Moderator', modId);
          typingQueues.current.set(modId, '');
          const modInit = { ...displayedRef.current, [modId]: '' };
          displayedRef.current = modInit;
          setDisplayedTexts(modInit);
          setStreamingAgent('Moderator');
          setMessages(prev => [...prev,
            { id: `div-mod-${Date.now()}`, role: 'divider', text: 'Moderator Synthesis' },
            { id: modId, role: 'agent', agentType: 'Moderator', text: '', isStreaming: true },
          ]);
          break;
        }

        case 'ModeratorChunk': {
          const mChunk = evt.text ?? '';
          const mId = streamingMsgIds.current.get('Moderator');
          if (mId) {
            typingQueues.current.set(mId, (typingQueues.current.get(mId) ?? '') + mChunk);
            setMessages(prev => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].id === mId) {
                  updated[i] = { ...updated[i], text: updated[i].text + mChunk };
                  break;
                }
              }
              return updated;
            });
          }
          break;
        }

        case 'ModeratorDone':
          setStreamingAgent(null);
          setMessages(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].agentType === 'Moderator' && updated[i].isStreaming) {
                updated[i] = { ...updated[i], isStreaming: false };
                break;
              }
            }
            return updated;
          });
          break;

        case 'DebateComplete':
          try {
            const payload = JSON.parse(evt.text ?? '{}') as { confidenceScore?: number; recommendation?: string };
            setVerdictData({ confidenceScore: payload.confidenceScore ?? 0, recommendation: payload.recommendation ?? '' });
          } catch { /* ignore */ }
          setStatus('done');
          setTimeout(() => onComplete?.(), 1500);
          break;

        case 'Error':
          setStatus('error');
          break;
      }
    };

    streamSSE();
    return () => controller.abort();
  }, [sessionId, token, completedSession]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Typewriter engine — drains typing queues one char at a time with natural variable speed
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const next = { ...displayedRef.current };
      for (const [msgId, queue] of typingQueues.current) {
        if (!queue.length) continue;
        if (now < (nextCharTime.current.get(msgId) ?? 0)) continue;
        const char = queue[0];
        typingQueues.current.set(msgId, queue.slice(1));
        next[msgId] = (next[msgId] ?? '') + char;
        changed = true;
        const pause = '.!?'.includes(char) ? 110 : ',;:'.includes(char) ? 55 : 13;
        nextCharTime.current.set(msgId, now + pause);
      }
      if (changed) { displayedRef.current = next; setDisplayedTexts(next); }
    }, 10);
    return () => clearInterval(id);
  }, []);

  const handleSendInput = async () => {
    if (!inputText.trim() || inputSending) return;
    setInputSending(true);
    try {
      await submitUserInput(sessionId, inputText.trim());
      setStatus('live');
    } catch {
      // Input rejected (debate already moved on — timeout) — that's fine
      setStatus('live');
    } finally {
      setInputSending(false);
    }
  };

  const skipInput = () => {
    setInputSubmitted(true);
    setStatus('live');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="chat-debate">
      {/* Status bar (live mode only) */}
      {status !== 'done' && !completedSession && (
        <div className="chat-debate__status">
          <div className="live-badge">
            {status === 'connecting'     && <><span className="dot dot--pulse" /> Connecting…</>}
            {status === 'live' && !streamingAgent && <><span className="dot dot--live" /> Live</>}
            {status === 'live' && streamingAgent  && <><span className="dot dot--live" /> {streamingAgent === 'Moderator' ? 'Moderator synthesizing…' : `${AGENT_DISPLAY[streamingAgent] ?? streamingAgent} speaking…`}</>}
            {status === 'waiting-input'  && <><span className="dot dot--pulse" style={{ background: '#fbbf24' }} /> Waiting for your input…</>}
            {status === 'error'          && <><span className="dot dot--error" /> Error — debate failed</>}
          </div>
        </div>
      )}

      {/* Message feed */}
      <div className="chat-debate__feed">
        {messages.map((msg) => {
          if (msg.role === 'divider') {
            return (
              <div key={msg.id} className="chat-divider">
                <span className="chat-divider__label">{msg.text}</span>
              </div>
            );
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className={`chat-bubble chat-bubble--user${msg.isUserInput ? ' chat-bubble--user-input' : ''}`}>
                <div className="chat-bubble__header chat-bubble__header--right">
                  <span className="chat-bubble__name" style={{ color: '#94a3b8' }}>
                    {msg.isUserInput ? '💬 You' : '📝 Your Decision'}
                  </span>
                </div>
                <div className="chat-bubble__body">{msg.text}</div>
              </div>
            );
          }

          // Agent bubble
          const color = AGENT_COLORS[msg.agentType!] ?? '#888';
          const icon  = AGENT_ICONS[msg.agentType!]  ?? '🤖';
          const name  = AGENT_DISPLAY[msg.agentType!] ?? msg.agentType;
          const isMod = msg.agentType === 'Moderator';

          return (
            <div
              key={msg.id}
              className={`chat-bubble chat-bubble--agent${isMod ? ' chat-bubble--moderator' : ''}`}
              data-agent={msg.agentType}
            >
              <div className="chat-bubble__header">
                <span className="chat-bubble__avatar" style={{ background: color + '22', border: `1px solid ${color}44` }}>
                  {icon}
                </span>
                <span className="chat-bubble__name" style={{ color }}>
                  {name}
                </span>
                {msg.round != null && msg.round > 0 && (
                  <span className="chat-bubble__round">R{msg.round}</span>
                )}
              </div>
              {(() => {
                const typed = displayedTexts[msg.id];
                const displayText = typed !== undefined ? typed : msg.text;
                const isCursorVisible = typed !== undefined
                  ? typed.length < msg.text.length || msg.isStreaming
                  : msg.isStreaming && msg.text.length > 0;
                return (
                  <div className="chat-bubble__body">
                    {displayText || (msg.isStreaming
                      ? <span className="thinking-indicator">thinking<span className="dots"><span>.</span><span>.</span><span>.</span></span></span>
                      : null
                    )}
                    {isCursorVisible && <span className="typing-cursor">▌</span>}
                  </div>
                );
              })()}
            </div>
          );
        })}

        <div ref={bottomRef} />
        {verdictData && (
          <VerdictCard score={verdictData.confidenceScore} recommendation={verdictData.recommendation} />
        )}
      </div>

      {/* User input box — shown when backend fires WaitingForUserInput */}
      {status === 'waiting-input' && !inputSubmitted && (
        <div className="chat-input-panel">
          <div className="chat-input-panel__title">
            💬 Join the debate — share your perspective before Round 2 begins
          </div>
          <div className="chat-input-panel__row">
            <textarea
              className="chat-input-panel__textarea"
              placeholder="Add your thoughts, challenge a point, or ask the agents to dig deeper…"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendInput(); }}
              rows={3}
            />
            <div className="chat-input-panel__actions">
              <button
                className="btn btn--primary"
                onClick={handleSendInput}
                disabled={inputSending || !inputText.trim()}
              >
                {inputSending ? 'Sending…' : 'Send ↵'}
              </button>
              <button className="btn btn--ghost" onClick={skipInput}>Skip</button>
            </div>
          </div>
          <p className="chat-input-panel__hint">Ctrl + Enter to send • Round 2 starts automatically in 5 min</p>
        </div>
      )}
    </div>
  );
}

// ── Verdict Card ──────────────────────────────────────────────────────────────

function VerdictCard({ score, recommendation }: { score: number; recommendation: string }) {
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(score), 150);
    return () => clearTimeout(t);
  }, [score]);
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : score >= 40 ? '#f97316' : '#f87171';
  return (
    <div className="verdict-card">
      <div className="verdict-card__header">
        <span style={{ fontSize: '1.1rem' }}>⚡</span>
        <span className="verdict-label">Final Verdict</span>
      </div>
      <div className="verdict-confidence">
        <div className="verdict-confidence__row">
          <span className="verdict-confidence__label">Consensus Score</span>
          <span className="verdict-confidence__score" style={{ color }}>{score}</span>
        </div>
        <div className="verdict-bar-track">
          <div
            className="verdict-bar-fill"
            style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${color}77, ${color})` }}
          />
        </div>
      </div>
      <div className="verdict-recommendation">
        <div className="verdict-recommendation__label">Recommendation</div>
        <div className="verdict-recommendation__text">{recommendation}</div>
      </div>
    </div>
  );
}
