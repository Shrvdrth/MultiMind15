import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession } from '../api/debate';
import type { DebateSessionDto, AgentResponseDto } from '../api/debate';

const AGENT_COLORS: Record<string, string> = {
  Strategist: '#4f8ef7',
  RiskAnalyst: '#f7694f',
  Engineer: '#4fc97f',
  Moderator: '#a64ff7',
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

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId]);

  if (error) return <div className="page-error">{error}</div>;

  if (!session || session.status === 'running') {
    return (
      <div className="loading-debate">
        <div className="spinner" />
        <h2>Debate in progress...</h2>
        <p>Three AI agents are debating your decision across 2 rounds.</p>
        <p className="loading-sub">This takes around 30–60 seconds. Hang tight.</p>
      </div>
    );
  }

  if (session.status === 'failed') {
    return (
      <div className="page-error">
        <p>The debate failed to complete. Please go back and try again.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="session-page">
      <header className="session-header">
        <button onClick={() => navigate('/dashboard')} className="btn-ghost">← Back</button>
        <h1>Debate Results</h1>
        <span className={`status status-${session.status}`}>{session.status}</span>
      </header>

      <div className="original-prompt">
        <h3>Decision Submitted</h3>
        <p>{session.originalPrompt}</p>
      </div>

      {session.rounds.map((round) => (
        <section key={round.roundNumber} className="round-section">
          <h2 className="round-title">Round {round.roundNumber}</h2>
          <div className="agent-cards">
            {round.responses.map((response) => (
              <AgentCard key={response.agentType} response={response} />
            ))}
          </div>
        </section>
      ))}

      {session.synthesis && (
        <section className="synthesis-section">
          <h2>Moderator Synthesis</h2>

          <div className="confidence-bar">
            <span>Confidence Score</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${session.synthesis.confidenceScore}%` }}
              />
            </div>
            <span className="score-label">{session.synthesis.confidenceScore}/100</span>
          </div>

          <div className="synthesis-card">
            <h3>Recommendation</h3>
            <p>{session.synthesis.recommendation}</p>
          </div>

          <div className="synthesis-card dissent">
            <h3>Key Dissenting Viewpoints</h3>
            <p>{session.synthesis.keyDissentingViewpoints}</p>
          </div>

          <div className="synthesis-card full">
            <h3>Full Synthesis</h3>
            <p>{session.synthesis.fullSynthesis}</p>
          </div>
        </section>
      )}
    </div>
  );
}

function AgentCard({ response }: { response: AgentResponseDto }) {
  const color = AGENT_COLORS[response.agentType] || '#888';
  return (
    <div className="agent-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="agent-label" style={{ color }}>
        {response.agentType === 'RiskAnalyst' ? 'Risk Analyst' : response.agentType}
      </div>
      <p>{response.responseText}</p>
    </div>
  );
}
