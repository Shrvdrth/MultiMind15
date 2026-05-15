import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession } from '../api/debate';
import type { DebateSessionDto, AgentResponseDto } from '../api/debate';
import AnalyticsPanel from '../components/AnalyticsPanel';

const AGENT_COLORS: Record<string, string> = {
  Strategist:  '#6366f1',
  RiskAnalyst: '#f87171',
  Engineer:    '#34d399',
  Moderator:   '#a855f7',
};

const AGENT_ICONS: Record<string, string> = {
  Strategist:  '🎯',
  RiskAnalyst: '⚠️',
  Engineer:    '⚙️',
  Moderator:   '🧠',
};

const POLL_INTERVAL_MS = 4000;

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<DebateSessionDto | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const fetchSession = async () => {
      try {
        const res = await getSession(sessionId);
        setSession(res.data);
        if (res.data.status !== 'running') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        setError('Failed to load session.');
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };
    fetchSession();
    pollRef.current = setInterval(fetchSession, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId]);

  if (error) return (
    <div className="page-error">
      <p>{error}</p>
      <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ maxWidth: 200 }}>← Back</button>
    </div>
  );

  if (!session || session.status === 'running') {
    return (
      <div className="loading-debate">
        <div className="spinner" />
        <h2>Debate in progress...</h2>
        <p>Three AI agents are debating your decision across 2 rounds.</p>
        <div className="agents-thinking">
          <div className="thinking-dot s">Strategist</div>
          <div className="thinking-dot r">Risk Analyst</div>
          <div className="thinking-dot e">Engineer</div>
        </div>
        <p className="loading-sub">Results in ~30–60 seconds</p>
      </div>
    );
  }

  if (session.status === 'failed') {
    return (
      <div className="page-error">
        <p>The debate failed to complete. Please go back and try again.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ maxWidth: 200 }}>← Dashboard</button>
      </div>
    );
  }

  // Stats
  const totalWords = session.rounds
    .flatMap(r => r.responses)
    .reduce((sum, r) => sum + r.responseText.split(/\s+/).length, 0);

  const exportDebate = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multimind-debate-${session.sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="session-page">
      <header className="session-header">
        <button onClick={() => navigate('/dashboard')} className="btn-ghost">← Back</button>
        <h1>Debate Results</h1>
        <span className={`status status-${session.status}`}>{session.status}</span>
      </header>

      {/* Prompt */}
      <div className="prompt-card">
        <h3>Decision Submitted</h3>
        <p>{session.originalPrompt}</p>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-value gradient-text">{session.rounds.length}</div>
          <div className="stat-label">Debate Rounds</div>
        </div>
        <div className="stat-card">
          <div className="stat-value gradient-text">3</div>
          <div className="stat-label">AI Agents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value gradient-text">{totalWords.toLocaleString()}</div>
          <div className="stat-label">Total Words</div>
        </div>
        <div className="stat-card">
          <div className="stat-value gradient-text">
            {session.synthesis?.confidenceScore ?? '—'}
            {session.synthesis ? '/100' : ''}
          </div>
          <div className="stat-label">Confidence</div>
        </div>
      </div>

      {/* Debate Rounds */}
      {session.rounds.map((round) => (
        <section key={round.roundNumber} className="round-section">
          <div className="round-header">
            <span className="round-badge">Round {round.roundNumber}</span>
            <div className="round-line" />
          </div>
          <div className="agent-cards">
            {round.responses.map((response) => (
              <AgentCard key={response.agentType} response={response} />
            ))}
          </div>
        </section>
      ))}

      {/* Analytics */}
      {session.rounds.length > 0 && (
        <AnalyticsPanel
          rounds={session.rounds}
          synthesisText={session.synthesis?.fullSynthesis}
        />
      )}

      {/* Synthesis */}
      {session.synthesis && (
        <section className="synthesis-section">
          <div className="synthesis-header">
            <span className="synthesis-badge">🧠 Moderator Synthesis</span>
            <div className="synthesis-line" />
          </div>

          <div className="confidence-display">
            <div className="confidence-header">
              <span className="confidence-label">Overall Confidence Score</span>
              <span className="confidence-score gradient-text">{session.synthesis.confidenceScore}/100</span>
            </div>
            <div className="confidence-bar">
              <div className="confidence-fill" style={{ width: `${session.synthesis.confidenceScore}%` }} />
            </div>
          </div>

          <div className="synthesis-cards">
            <div className="synthesis-card recommend">
              <h3>✅ Recommendation</h3>
              <p>{session.synthesis.recommendation}</p>
            </div>
            <div className="synthesis-card dissent">
              <h3>⚡ Key Dissenting Viewpoints</h3>
              <p>{session.synthesis.keyDissentingViewpoints}</p>
            </div>
            <div className="synthesis-card full">
              <h3>📋 Full Synthesis</h3>
              <p>{session.synthesis.fullSynthesis}</p>
            </div>
          </div>
        </section>
      )}

      {/* Export */}
      <div className="export-row">
        <span>Export this debate</span>
        <button className="btn-ghost" onClick={exportDebate}>⬇ Download JSON</button>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')}>+ New Debate</button>
      </div>
    </div>
  );
}

function AgentCard({ response }: { response: AgentResponseDto }) {
  const [copied, setCopied] = useState(false);
  const color = AGENT_COLORS[response.agentType] || '#888';
  const icon = AGENT_ICONS[response.agentType] || '🤖';
  const displayName = response.agentType === 'RiskAnalyst' ? 'Risk Analyst' : response.agentType;

  const copy = async () => {
    await navigator.clipboard.writeText(response.responseText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="agent-card" data-agent={response.agentType}>
      <div className="agent-card-header">
        <div className="agent-label" style={{ color }}>
          <div className="agent-dot" style={{ background: color }} />
          {icon} {displayName}
        </div>
        <button className="btn-icon" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <p>{response.responseText}</p>
    </div>
  );
}
