import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSession, toggleFavourite } from '../api/debate';
import type { DebateSessionDto } from '../api/debate';
import AnalyticsPanel from '../components/AnalyticsPanel';
import { ChatDebateView } from '../components/ChatDebateView';
import { CommentSection } from '../components/CommentSection';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 4000;

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<DebateSessionDto | null>(null);
  const [error, setError] = useState('');
  const [isFavourite, setIsFavourite] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { userId } = useAuth();

  useEffect(() => {
    if (!sessionId) return;
    const fetchSession = async () => {
      try {
        const res = await getSession(sessionId);
        setSession(res.data);
        if (res.data.isFavourite !== undefined) setIsFavourite(res.data.isFavourite);
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
      <Link to="/dashboard" className="btn-primary" style={{ maxWidth: 200 }}>← Back</Link>
    </div>
  );

  // Brief spinner only before the first fetch returns
  if (!session) return (
    <div className="loading-debate">
      <div className="spinner" />
      <p>Loading session…</p>
    </div>
  );

  if (session.status === 'failed') return (
    <div className="page-error">
      <p>The debate failed to complete. Please go back and try again.</p>
      <Link to="/dashboard" className="btn-primary" style={{ maxWidth: 200 }}>← Dashboard</Link>
    </div>
  );

  const isLive = session.status === 'running';

  const totalWords = session.rounds
    .flatMap(r => r.responses)
    .reduce((sum, r) => sum + r.responseText.split(/\s+/).length, 0);
  const confidenceLabel = session.synthesis ? `${session.synthesis.confidenceScore}/100` : 'Pending';

  const exportDebate = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multimind-debate-${session.sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFav = async () => {
    if (!sessionId) return;
    try {
      const res = await toggleFavourite(sessionId);
      setIsFavourite(res.data.isFavourite);
    } catch {
      // Leave the current favourite state unchanged if the request fails.
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="session-page">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="session-header">
        <Link to="/dashboard" className="btn-ghost">← Back</Link>
        <h1>{isLive ? 'Live Debate' : 'Debate Results'}</h1>
        <div className="session-actions">
          {!isLive && (
            <>
              <button
                className={`fav-btn-session${isFavourite ? ' active' : ''}`}
                onClick={handleFav}
                title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              >
                {isFavourite ? '★' : '☆'} {isFavourite ? 'Saved' : 'Save'}
              </button>
              <button className="btn-ghost" onClick={copyLink}>
                {linkCopied ? '✓ Copied!' : '🔗 Share'}
              </button>
            </>
          )}
          <span className={`status status-${session.status}`}>{session.status}</span>
        </div>
      </header>

      <section className="debate-hero-card" aria-labelledby="debate-hero-title">
        <div className="debate-hero-card__copy">
          <span className={`debate-hero-card__eyebrow status status-${session.status}`}>
            {isLive ? 'Live analysis' : session.status}
          </span>
          <h2 id="debate-hero-title">
            {isLive ? 'Your AI panel is debating the decision' : 'Decision intelligence summary'}
          </h2>
          <p>
            MultiMind brings strategy, risk, engineering, and moderator perspectives into one
            structured workspace so you can compare trade-offs with confidence.
          </p>
          <div className="debate-hero-card__metrics" aria-label="Debate summary metrics">
            <div>
              <strong>{session.rounds.length}</strong>
              <span>Rounds captured</span>
            </div>
            <div>
              <strong>{totalWords.toLocaleString()}</strong>
              <span>Words analyzed</span>
            </div>
            <div>
              <strong>{confidenceLabel}</strong>
              <span>Confidence</span>
            </div>
          </div>
        </div>
        <div className="debate-hero-card__visual" aria-hidden="true">
          <img src="/debate-constellation.svg" alt="" />
        </div>
      </section>

      {/* ── Prompt ─────────────────────────────────────────── */}
      <div className="prompt-card">
        <h3>Decision Submitted</h3>
        <p>{session.originalPrompt}</p>
      </div>

      {/* ── Stats Bar (completed only) ──────────────────────── */}
      {!isLive && (
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
      )}

      {/* ── Live stream OR completed rounds ────────────────── */}
      {isLive && sessionId ? (
        <ChatDebateView
          sessionId={sessionId}
          userPrompt={session.originalPrompt}
          onComplete={() => {
            getSession(sessionId).then(r => setSession(r.data));
          }}
        />
      ) : (
        <>
          <ChatDebateView
            sessionId={sessionId!}
            userPrompt={session.originalPrompt}
            completedSession={session}
          />

          {session.rounds.length > 0 && (
            <AnalyticsPanel
              rounds={session.rounds}
              synthesisText={session.synthesis?.fullSynthesis}
            />
          )}

          {session.status === 'completed' && sessionId && (
            <CommentSection sessionId={sessionId} userId={userId} />
          )}

          <div className="export-row">
            <span>Export this debate</span>
            <button className="btn-ghost" onClick={exportDebate}>⬇ Download JSON</button>
            <Link to="/dashboard" className="btn-ghost">+ New Debate</Link>
          </div>
        </>
      )}
    </div>
  );
}

