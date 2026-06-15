import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  ['Multi-agent debate', 'Strategy, risk, engineering, and moderator perspectives in one structured workflow.'],
  ['Business forecasting', 'Future outlooks surface market trends, risks, opportunities, and practical next moves.'],
  ['Live decision arena', 'Watch arguments unfold with real-time streaming, visuals, analytics, and optional voice.'],
  ['Executive-ready outputs', 'Export decisions, confidence scores, themes, comments, and structured recommendations.'],
];

const STEPS = [
  ['Submit a decision', 'Describe a strategic, technical, marketing, finance, or operations question.'],
  ['Agents debate', 'Specialized AI roles challenge assumptions and develop independent viewpoints.'],
  ['Moderator synthesizes', 'A final recommendation combines the strongest arguments with a confidence score.'],
  ['Act with clarity', 'Use forecasts, analytics, and comments to align stakeholders and decide faster.'],
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link to="/" className="landing-logo gradient-text">MultiMind</Link>
        <div>
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn btn--primary">Open Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn--ghost">Sign In</Link>
              <Link to="/register" className="btn btn--primary">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <span className="landing-pill">AI decision intelligence for modern teams</span>
          <h1>Debate important decisions before they become expensive bets.</h1>
          <p>
            MultiMind turns complex business questions into structured AI debates, forecasted
            outlooks, and confidence-scored recommendations your team can act on.
          </p>
          <div className="landing-hero__actions">
            <Link to={isAuthenticated ? '/dashboard' : '/register'} className="btn btn--primary">
              Start a Debate
            </Link>
            <Link to="/login" className="btn btn--ghost">View Demo Flow</Link>
          </div>
          <div className="landing-proof">
            <span>Strategy</span>
            <span>Risk</span>
            <span>Engineering</span>
            <span>Forecasting</span>
          </div>
        </div>
        <div className="landing-hero__visual" aria-hidden="true">
          <img src="/debate-constellation.svg" alt="" />
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section__heading">
          <span className="landing-pill">Platform capabilities</span>
          <h2>Designed for high-stakes decisions</h2>
          <p>Every feature is built to reduce ambiguity, expose trade-offs, and create clear next actions.</p>
        </div>
        <div className="landing-feature-grid">
          {FEATURES.map(([title, body]) => (
            <article key={title} className="landing-card">
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-workflow">
        <div className="landing-section__heading">
          <span className="landing-pill">How it works</span>
          <h2>From question to recommendation</h2>
        </div>
        <div className="landing-steps">
          {STEPS.map(([title, body], index) => (
            <article key={title} className="landing-step">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-demo">
        <div>
          <span className="landing-pill">Example decision</span>
          <h2>“Should we invest in AI automation this quarter?”</h2>
          <p>
            MultiMind compares growth upside, implementation complexity, adoption risk,
            and long-term market positioning before producing an actionable recommendation.
          </p>
        </div>
        <Link to={isAuthenticated ? '/dashboard' : '/register'} className="btn btn--primary">
          Try MultiMind
        </Link>
      </section>
    </main>
  );
}
