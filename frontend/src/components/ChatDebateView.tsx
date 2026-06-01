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

const AGENT_COLORS: Record<string, string> = {
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

const AGENT_KEYS = ['Strategist', 'RiskAnalyst', 'Engineer'] as const;
type AgentKey = typeof AGENT_KEYS[number];

const AGENT_TITLES: Record<string, string> = {
  Strategist:  'Chief Strategy Officer',
  RiskAnalyst: 'Risk Officer',
  Engineer:    'Principal Engineer',
};

// ── Text-to-Speech helper ───────────────────────────────────────────────────

function speakText(text: string, agentType: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang   = 'en-US';
  utterance.volume = 1;
  switch (agentType) {
    case 'Strategist':  utterance.pitch = 1.00; utterance.rate = 0.93; break;
    case 'RiskAnalyst': utterance.pitch = 0.85; utterance.rate = 0.90; break;
    case 'Engineer':    utterance.pitch = 1.15; utterance.rate = 1.00; break;
    case 'Moderator':   utterance.pitch = 1.05; utterance.rate = 0.87; break;
    default:            utterance.pitch = 1.00; utterance.rate = 0.95; break;
  }
  window.speechSynthesis.speak(utterance);
}

// ── Derive 3-column layout from flat messages at render time ──────────────────

interface GroupedRound {
  roundNumber: number;
  agents: Partial<Record<AgentKey, ChatMessage>>;
}

function groupRounds(messages: ChatMessage[]): {
  rounds: GroupedRound[];
  moderator: ChatMessage | null;
  userInput: ChatMessage | null;
} {
  const rounds: GroupedRound[] = [];
  let current: GroupedRound | null = null;
  let moderator: ChatMessage | null = null;
  let userInput: ChatMessage | null = null;

  for (const msg of messages) {
    if (msg.role === 'divider') {
      if (msg.text.startsWith('Round ')) {
        const num = parseInt(msg.text.split(' ')[1], 10);
        current = { roundNumber: num, agents: {} };
        rounds.push(current);
      }
      // Skip 'Moderator Synthesis' divider — handled separately
    } else if (msg.role === 'agent') {
      if (msg.agentType === 'Moderator') {
        moderator = msg;
      } else if (current) {
        current.agents[msg.agentType as AgentKey] = msg;
      }
    } else if (msg.role === 'user' && msg.isUserInput) {
      userInput = msg;
    }
  }

  return { rounds, moderator, userInput };
}

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

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const ttsEnabledRef = useRef(true);

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
                if (ttsEnabledRef.current && updated[i].text)
                  speakText(updated[i].text, evt.agentType ?? '');
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
                if (ttsEnabledRef.current && updated[i].text)
                  speakText(updated[i].text, 'Moderator');
                updated[i] = { ...updated[i], isStreaming: false };
                break;
              }
            }
            return updated;
          });
          break;

        case 'DebateComplete':
          window.speechSynthesis?.cancel();
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
    return () => {
      controller.abort();
      window.speechSynthesis?.cancel();
    };
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

  const { rounds, moderator, userInput } = groupRounds(messages);

  return (
    <div className="debate-arena">

      {/* ── Status bar (live mode only) ── */}
      {!completedSession && (
        <div className="debate-status-bar">
          <div className="live-badge">
            {status === 'connecting'    && <><span className="dot dot--pulse" /> Connecting…</> }
            {status === 'live' && !streamingAgent && <><span className="dot dot--live" /> Live</> }
            {status === 'live' && streamingAgent  && (
              <>
                <span className="dot dot--live" />
                <span className="arena-speaking-name" style={{ color: AGENT_COLORS[streamingAgent] }}>
                  {AGENT_ICONS[streamingAgent]}&nbsp;
                  {streamingAgent === 'Moderator'
                    ? 'Moderator synthesizing…'
                    : `${AGENT_DISPLAY[streamingAgent] ?? streamingAgent} speaking…`}
                </span>
              </>
            )}
            {status === 'waiting-input' && <><span className="dot dot--pulse" style={{ background: '#fbbf24' }} /> Waiting for your input…</> }
            {status === 'error'         && <><span className="dot dot--error" /> Debate failed</> }
          </div>
          <div className="debate-status-bar__actions">
            <button
              className={`tts-toggle${ttsEnabled ? ' tts-toggle--on' : ''}`}
              title={ttsEnabled ? 'Mute agent voices' : 'Enable agent voices'}
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabled(next);
                ttsEnabledRef.current = next;
                if (!next) window.speechSynthesis?.cancel();
              }}
            >
              {ttsEnabled ? '🔊' : '🔇'}
              <span>{ttsEnabled ? 'Voice On' : 'Voice Off'}</span>
            </button>
            {status === 'done' && <span className="arena-done-badge">✓ Complete</span>}
          </div>
        </div>
      )}

      {/* ── Agent identity header ── */}
      <div className="arena-agents-header">
        {AGENT_KEYS.map(agent => (
          <div
            key={agent}
            className={`arena-agent-card${streamingAgent === agent ? ' arena-agent-card--speaking' : ''}`}
            data-agent={agent}
          >
            <div className="arena-agent-card__icon">{AGENT_ICONS[agent]}</div>
            <div className="arena-agent-card__info">
              <div className="arena-agent-card__name" style={{ color: AGENT_COLORS[agent] }}>
                {AGENT_DISPLAY[agent]}
              </div>
              <div className="arena-agent-card__title">{AGENT_TITLES[agent]}</div>
            </div>
            {streamingAgent === agent && (
              <div className="arena-wave">
                <span className="arena-wave__bar" data-agent={agent} />
                <span className="arena-wave__bar" data-agent={agent} style={{ animationDelay: '0.1s' }} />
                <span className="arena-wave__bar" data-agent={agent} style={{ animationDelay: '0.2s' }} />
                <span className="arena-wave__bar" data-agent={agent} style={{ animationDelay: '0.3s' }} />
                <span className="arena-wave__bar" data-agent={agent} style={{ animationDelay: '0.4s' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Rounds ── */}
      {rounds.map(round => (
        <div key={round.roundNumber} className="arena-round">
          <div className="arena-round__banner">
            <span className="arena-round__label">Round {round.roundNumber}</span>
          </div>
          <div className="arena-columns">
            {AGENT_KEYS.map(agent => {
              const msg = round.agents[agent];
              const typed = msg ? displayedTexts[msg.id] : undefined;
              const displayText = typed !== undefined ? typed : (msg?.text ?? '');
              const isCursorVisible = !!msg?.isStreaming && streamingAgent === agent;
              const isWaiting = !msg && !!streamingAgent && streamingAgent !== 'Moderator';

              return (
                <div
                  key={agent}
                  className={`arena-column${msg?.isStreaming ? ' arena-column--streaming' : ''}${isWaiting ? ' arena-column--waiting' : ''}`}
                  data-agent={agent}
                >
                  {msg ? (
                    <div className="arena-column__body">
                      {displayText || (msg.isStreaming
                        ? <span className="thinking-indicator">thinking<span className="dots"><span>.</span><span>.</span><span>.</span></span></span>
                        : null
                      )}
                      {isCursorVisible && (
                        <span className="typing-cursor" style={{ color: AGENT_COLORS[agent] }}>▌</span>
                      )}
                      {!msg.isStreaming && msg.text && (
                        <button
                          className="column-speak-btn"
                          title={`Listen to ${AGENT_DISPLAY[agent]}`}
                          onClick={() => speakText(msg.text, agent)}
                        >
                          🔊
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="arena-column__empty">
                      {isWaiting && (
                        <span className="waiting-dots"><span>·</span><span>·</span><span>·</span></span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── User mid-debate input ── */}
      {userInput && (
        <div className="arena-user-bubble">
          <div className="arena-user-bubble__label">💬 Your Perspective</div>
          <div className="arena-user-bubble__text">{userInput.text}</div>
        </div>
      )}

      {/* ── Moderator Synthesis Panel ── */}
      {moderator && (
        <ModeratorPanel
          msg={moderator}
          displayedTexts={displayedTexts}
          isStreaming={streamingAgent === 'Moderator'}
        />
      )}

      {/* ── Verdict card ── */}
      {verdictData && (
        <VerdictCard score={verdictData.confidenceScore} recommendation={verdictData.recommendation} />
      )}

      {/* ── User input box (WaitingForUserInput) ── */}
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

      <div ref={bottomRef} />
    </div>
  );
}

// ── Moderator Panel ───────────────────────────────────────────────────────────

function ModeratorPanel({
  msg,
  displayedTexts,
  isStreaming,
}: {
  msg: ChatMessage;
  displayedTexts: Record<string, string>;
  isStreaming: boolean;
}) {
  const typed = displayedTexts[msg.id];
  const displayText = typed !== undefined ? typed : msg.text;
  return (
    <div className={`moderator-panel${msg.isStreaming ? ' moderator-panel--active' : ''}`}>
      <div className="moderator-panel__header">
        <div className="moderator-panel__icon">🧠</div>
        <div>
          <div className="moderator-panel__name">Moderator AI</div>
          <div className="moderator-panel__subtitle">Synthesis &amp; Recommendation</div>
        </div>
        {isStreaming && (
          <div className="moderator-panel__live">
            <span className="dot dot--pulse" style={{ background: 'var(--moderator)' }} />
            Synthesizing…
          </div>
        )}
      </div>
      <div className="moderator-panel__body">
        {displayText || (msg.isStreaming
          ? <span className="thinking-indicator">synthesizing<span className="dots"><span>.</span><span>.</span><span>.</span></span></span>
          : null
        )}
        {isStreaming && <span className="typing-cursor" style={{ color: 'var(--moderator)' }}>▌</span>}
        {!msg.isStreaming && msg.text && (
          <button
            className="column-speak-btn column-speak-btn--mod"
            title="Listen to Moderator synthesis"
            onClick={() => speakText(msg.text, 'Moderator')}
          >
            🔊 Listen
          </button>
        )}
      </div>
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
