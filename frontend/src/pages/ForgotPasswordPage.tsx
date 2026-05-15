import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setToken(res.data.token);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="brand-content">
          <div className="brand-logo gradient-text">MultiMind</div>
          <p className="brand-tagline">Reset your password securely</p>
          <div className="brand-features">
            <div className="brand-feature">
              <span className="feature-icon">🔒</span>
              <div><strong>Secure Reset</strong><p>Token-based password reset</p></div>
            </div>
            <div className="brand-feature">
              <span className="feature-icon">⏱️</span>
              <div><strong>15-Minute Window</strong><p>Tokens expire for your safety</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          {!token ? (
            <>
              <h2 className="auth-title">Forgot Password</h2>
              <p className="auth-sub">Enter your email to receive a reset token</p>
              {error && <div className="error-banner">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="input-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Sending...' : 'Get Reset Token →'}
                </button>
              </form>
              <p className="auth-switch">
                Remember your password? <Link to="/login">Sign in</Link>
              </p>
            </>
          ) : (
            <div className="reset-token-reveal">
              <div className="token-icon">🎯</div>
              <h2 className="auth-title">Your Reset Token</h2>
              <p className="auth-sub">Copy this token — it expires in 15 minutes</p>
              <div className="token-display">{token}</div>
              <button
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(token)}
              >
                Copy Token
              </button>
              <Link to="/reset-password" className="btn-primary" style={{ display: 'block', marginTop: '1rem', textAlign: 'center' }}>
                Reset Password →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
