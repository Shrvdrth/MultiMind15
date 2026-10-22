import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../api/config';

interface AgentMessage {
  agentType: string;
  round: number;
  text: string;
  done: boolean;
}

interface DebateEvent {
  eventType: string;
  sessionId: string;
  round?: number;
  agentType?: string;
  text?: string;
}

interface Props {
  sessionId: string;
  onComplete: () => void;
}

const AGENT_COLORS: Record<string, string> = {
  Strategist: 'var(--strategist)',
  RiskAnalyst: 'var(--risk)',
  Engineer: 'var(--engineer)',
  Moderator: 'var(--moderator)',
};

const AGENT_ICONS: Record<string, string> = {
  Strategist: '🎯',
  RiskAnalyst: '⚠️',
  Engineer: '⚙️',
  Moderator: '⚖️',
};

export function LiveDebateView({ sessionId, onComplete }: Props) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'done' | 'error'>('connecting');
  const bottomRef = useRef<HTMLDivElement>(null);
  // Ref so handleEvent closure always reads the latest round without going stale
  const currentRoundRef = useRef(0);

  useEffect(() => {
    if (!token) return;

    const url = `${API_BASE_URL}/debate/${sessionId}/stream`;

    // Use fetch-based SSE because EventSource doesn't support Authorization headers
    const controller = new AbortController();

    const streamSSE = async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setStatus('error');
          return;
        }

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
            const json = line.slice(5).trim();
            try {
              const evt: DebateEvent = JSON.parse(json);
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
          setCurrentRound(evt.round ?? 0);
          break;
        case 'AgentStart':
          setStreamingAgent(evt.agentType ?? null);
          setMessages(prev => [
            ...prev,
            { agentType: evt.agentType!, round: currentRoundRef.current, text: '', done: false }
          ]);
          break;
        case 'AgentChunk':
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.agentType === evt.agentType && !last.done) {
              updated[updated.length - 1] = { ...last, text: last.text + (evt.text ?? '') };
            }
            return updated;
          });
          break;
        case 'AgentDone':
          setStreamingAgent(null);
          setMessages(prev => {
            const updated = [...prev];
            const idx = [...updated].reverse().findIndex(m => m.agentType === evt.agentType && !m.done);
            if (idx !== -1) {
              const realIdx = updated.length - 1 - idx;
              updated[realIdx] = { ...updated[realIdx], done: true };
            }
            return updated;
          });
          break;
        case 'ModeratorStart':
          setStreamingAgent('Moderator');
          setMessages(prev => [...prev, { agentType: 'Moderator', round: 0, text: '', done: false }]);
          break;
        case 'ModeratorChunk':
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.agentType === 'Moderator' && !last.done) {
              updated[updated.length - 1] = { ...last, text: last.text + (evt.text ?? '') };
            }
            return updated;
          });
          break;
        case 'ModeratorDone':
          setStreamingAgent(null);
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.agentType === 'Moderator') updated[updated.length - 1] = { ...last, done: true };
            return updated;
          });
          break;
        case 'DebateComplete':
          setStatus('done');
          setTimeout(onComplete, 1500);
          break;
        case 'Error':
          setStatus('error');
          break;
      }
    };

    streamSSE();

    return () => controller.abort();
  }, [sessionId, token]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="live-debate">
      <div className="live-debate__header">
        <div className="live-badge">
          {status === 'connecting' && <><span className="dot dot--pulse" /> Connecting…</>}
          {status === 'live' && <><span className="dot dot--live" /> Live</>}
          {status === 'done' && <><span className="dot dot--done" /> Complete</>}
          {status === 'error' && <><span className="dot dot--error" /> Error</>}
        </div>
        {currentRound > 0 && <span className="round-badge">Round {currentRound}</span>}
      </div>

      <div className="live-debate__feed">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${msg.agentType.toLowerCase()}`}>
            <div className="chat-bubble__header">
              <span className="chat-bubble__icon">{AGENT_ICONS[msg.agentType] ?? '🤖'}</span>
              <span className="chat-bubble__name" style={{ color: AGENT_COLORS[msg.agentType] }}>
                {msg.agentType}
              </span>
              {msg.round > 0 && <span className="chat-bubble__round">R{msg.round}</span>}
            </div>
            <div className="chat-bubble__body">
              {msg.text}
              {!msg.done && streamingAgent === msg.agentType && (
                <span className="typing-cursor">▌</span>
              )}
            </div>
          </div>
        ))}

        {streamingAgent && messages.length === 0 && (
          <div className="typing-indicator">
            <span>{AGENT_ICONS[streamingAgent] ?? '🤖'} {streamingAgent} is thinking</span>
            <span className="dots"><span>.</span><span>.</span><span>.</span></span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
