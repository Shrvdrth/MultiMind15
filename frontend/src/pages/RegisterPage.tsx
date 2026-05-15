import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register as registerApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await registerApi(email, password);
      login(res.data.token, res.data.email);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-logo gradient-text">MultiMind</div>
        <p>
          Built for analysts, researchers and decision-makers. Get structured AI debate
          on complex decisions — free of groupthink, driven by evidence.
        </p>
        <div className="auth-features">
          <div className="auth-feature">
            <span className="auth-feature-icon">🎯</span>
            <div>
              <h4>Perfect for Data Analytics</h4>
              <p>Evaluate research questions, methodology choices and analytical frameworks</p>
            </div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">🔍</span>
            <div>
              <h4>Structured Reasoning</h4>
              <p>Each agent argues independently — no consensus bias or hallucinated agreements</p>
            </div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">📤</span>
            <div>
              <h4>Export Ready</h4>
              <p>Download full debate transcripts as JSON for further analysis</p>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-logo gradient-text">MultiMind</div>
          <h2>Create your account</h2>
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
              <label>Password <span style={{color:'var(--text-dim)',fontWeight:400}}>(min 8 chars)</span></label>
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
              {loading ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>
          <p>Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
