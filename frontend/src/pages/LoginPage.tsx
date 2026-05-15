import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login as loginApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginApi(email, password);
      login(res.data.token, res.data.email);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-logo gradient-text">MultiMind</div>
        <p>
          A multi-agent AI debate platform that gives you structured, evidence-based
          analysis on your most complex decisions — from three independent AI perspectives.
        </p>
        <div className="auth-features">
          <div className="auth-feature">
            <span className="auth-feature-icon">🧠</span>
            <div>
              <h4>3 Specialized Agents</h4>
              <p>Strategist, Risk Analyst & Engineer debate your decision across 2 rounds</p>
            </div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">📊</span>
            <div>
              <h4>Data-Driven Analytics</h4>
              <p>Radar charts, word analysis, confidence scoring and key theme extraction</p>
            </div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">⚡</span>
            <div>
              <h4>Real-time Debate</h4>
              <p>Watch agents debate live with async polling — results in 30–60 seconds</p>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-logo gradient-text">MultiMind</div>
          <h2>Welcome back</h2>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Password</span>
                <Link to="/forgot-password" style={{ fontSize: '0.8rem', fontWeight: 400 }}>Forgot password?</Link>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="error">⚠ {error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
          <p>No account? <Link to="/register">Create one free</Link></p>
        </div>
      </div>
    </div>
  );
}
