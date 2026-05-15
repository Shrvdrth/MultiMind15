import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { startDebate } from '../api/debate';
import { useAuth } from '../context/AuthContext';

const AGENTS = [
  {
    key: 'strategist',
    icon: '🎯',
    name: 'Strategist',
    color: '#6366f1',
    desc: 'Evaluates long-term business value, competitive positioning and ROI.',
  },
  {
    key: 'risk',
    icon: '⚠️',
    name: 'Risk Analyst',
    color: '#f87171',
    desc: 'Identifies threats, failure modes and mitigation paths. Challenges assumptions.',
  },
  {
    key: 'engineer',
    icon: '⚙️',
    name: 'Engineer',
    color: '#34d399',
    desc: 'Assesses technical feasibility, implementation complexity and architecture impact.',
  },
];

const EXAMPLE_PROMPTS = [
  'Should we migrate our monolith to microservices in the next 6 months?',
  'Should I use Python or R for our new data pipeline project?',
  'Is it worth investing in a real-time dashboard vs batch reporting for our analytics team?',
  'Should we adopt cloud-native infrastructure or stay on-premise for our ML workloads?',
];

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
    if (submittingRef.current) return;
    setError('');

    if (!prompt.trim()) {
      setError('Please enter a decision or question.');
      return;
    }
    if (prompt.length > MAX_LENGTH) {
      setError(`Input exceeds ${MAX_LENGTH} character limit.`);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      submittingRef.current = true;
      setLoading(true);
      try {
        const res = await startDebate(prompt);
        // Navigate immediately — session page polls for results
        navigate(`/session/${res.data.sessionId}`);
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(msg || 'Failed to start debate. Please try again.');
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    }, 300);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <span className="header-logo gradient-text">MultiMind</span>
        <div className="header-right">
          <span className="header-email">{email}</span>
          <button onClick={() => { logout(); navigate('/login'); }} className="btn-ghost">
            Sign Out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Hero */}
        <section className="hero-section">
          <h2>
            Make better decisions with<br />
            <span className="gradient-text">multi-agent AI debate</span>
          </h2>
          <p className="subtitle">
            Three specialized AI agents independently analyze your decision, debate across
            structured rounds, and a Moderator synthesizes a confidence-scored recommendation.
          </p>
        </section>

        {/* Agent Showcase */}
        <div className="agent-showcase">
          {AGENTS.map((a) => (
            <div key={a.key} className={`showcase-card ${a.key}`}>
              <div className="showcase-icon">{a.icon}</div>
              <h4 style={{ color: a.color }}>{a.name}</h4>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>

        {/* Debate Form */}
        <div className="form-section">
          <h3>Submit a Decision</h3>
          <form onSubmit={handleSubmit} className="debate-form">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe a business, technical or analytical decision..."
              rows={5}
              maxLength={MAX_LENGTH}
              disabled={loading}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="form-hint">
                <span>💡</span>
                <span>Try: <em
                  style={{ cursor: 'pointer', color: 'var(--accent)' }}
                  onClick={() => setPrompt(EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)])}
                >random example</em></span>
              </div>
              <div className="char-count">{prompt.length} / {MAX_LENGTH}</div>
            </div>
            {error && <p className="error">⚠ {error}</p>}
            <button type="submit" disabled={loading || !prompt.trim()} className="btn-primary">
              {loading ? 'Starting debate...' : '▶  Start Debate'}
            </button>
          </form>
        </div>

        <HistorySection />
      </main>
    </div>
  );
}

function HistorySection() {
  const [history, setHistory] = useState<{ id: string; originalPrompt: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingH, setLoadingH] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    if (loaded) { return; }
    setLoadingH(true);
    const { getHistory } = await import('../api/debate');
    const res = await getHistory();
    setHistory(res.data);
    setLoaded(true);
    setLoadingH(false);
  };

  return (
    <div className="history-section">
      <h3>Past Debates</h3>
      {!loaded && (
        <button onClick={load} className="btn-ghost" disabled={loadingH}>
          {loadingH ? 'Loading...' : '↺  Load History'}
        </button>
      )}
      {loaded && history.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No past debates yet.</p>
      )}
      {history.length > 0 && (
        <ul className="history-list">
          {history.map((item) => (
            <li key={item.id} onClick={() => navigate(`/session/${item.id}`)} className="history-item">
              <span className="history-prompt">{item.originalPrompt.slice(0, 90)}{item.originalPrompt.length > 90 ? '…' : ''}</span>
              <span className={`status status-${item.status}`}>{item.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
