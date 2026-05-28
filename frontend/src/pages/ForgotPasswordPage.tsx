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
        <div className="auth-brand-logo gradient-text">MultiMind</div>
        <p>Reset your password securely using a one-time token sent to your account.</p>
        <div className="auth-features">
          <div className="auth-feature">
            <span className="auth-feature-icon">🔒</span>
            <div><h4>Secure Reset</h4><p>Token-based password reset — no email required</p></div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">⏱️</span>
            <div><h4>15-Minute Window</h4><p>Tokens expire automatically for your safety</p></div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          {!token ? (
            <>
              <div className="auth-card-logo gradient-text">MultiMind</div>
              <h2>Forgot Password</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1rem' }}>Enter your email to receive a reset token</p>
              {error && <p className="error">⚠ {error}</p>}
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
              <p style={{ marginTop: '1.25rem', color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center' }}>
                Remember your password? <Link to="/login">Sign in</Link>
              </p>
            </>
          ) : (
            <div className="reset-token-reveal">
              <div className="token-icon">🎯</div>
              <h2>Your Reset Token</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1rem' }}>Copy this token — it expires in 15 minutes</p>
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
