import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { startDebate } from '../api/debate';
import { useAuth } from '../context/AuthContext';

const MAX_LENGTH = 4000;

export default function DashboardPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const { email, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return; // prevent double submission
    setError('');

    if (!prompt.trim()) {
      setError('Please enter a decision or question.');
      return;
    }
    if (prompt.length > MAX_LENGTH) {
      setError(`Input exceeds ${MAX_LENGTH} character limit.`);
      return;
    }

    // Debounce: prevent rapid re-submissions
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      submittingRef.current = true;
      setLoading(true);
      try {
        const res = await startDebate(prompt);
        navigate(`/session/${res.data.sessionId}`);
      } catch {
        setError('Failed to start debate. Please try again.');
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    }, 300);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>MultiMind</h1>
        <div className="header-right">
          <span>{email}</span>
          <button onClick={() => { logout(); navigate('/login'); }} className="btn-ghost">
            Sign Out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <h2>Submit a Decision</h2>
        <p className="subtitle">
          Three AI agents — Strategist, Risk Analyst, and Engineer — will independently 
          evaluate your decision and debate it across structured rounds.
        </p>

        <form onSubmit={handleSubmit} className="debate-form">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a business or technical decision, e.g. 'Should we migrate our monolith to microservices in the next 6 months?'"
            rows={6}
            maxLength={MAX_LENGTH}
            disabled={loading}
          />
          <div className="char-count">{prompt.length} / {MAX_LENGTH}</div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !prompt.trim()} className="btn-primary">
            {loading ? 'Running debate...' : 'Start Debate'}
          </button>
        </form>

        <HistorySection />
      </main>
    </div>
  );
}

function HistorySection() {
  const [history, setHistory] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    if (loaded) return;
    const { getHistory } = await import('../api/debate');
    const res = await getHistory();
    setHistory(res.data);
    setLoaded(true);
  };

  return (
    <div className="history-section">
      <button onClick={load} className="btn-ghost">
        {loaded ? 'Refresh History' : 'Load Past Debates'}
      </button>
      {history.length > 0 && (
        <ul className="history-list">
          {history.map((item) => (
            <li key={item.id} onClick={() => navigate(`/session/${item.id}`)} className="history-item">
              <span className="history-prompt">{item.originalPrompt.slice(0, 80)}...</span>
              <span className={`status status-${item.status}`}>{item.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
