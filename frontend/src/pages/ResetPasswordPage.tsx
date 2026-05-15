import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../api/auth';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', token: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(form.email, form.token, form.newPassword);
      navigate('/login', { state: { message: 'Password reset! You can now sign in.' } });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid or expired token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="brand-content">
          <div className="brand-logo gradient-text">MultiMind</div>
          <p className="brand-tagline">Set a new secure password</p>
          <div className="brand-features">
            <div className="brand-feature">
              <span className="feature-icon">🔑</span>
              <div><strong>Token Verified</strong><p>Paste the token from the previous step</p></div>
            </div>
            <div className="brand-feature">
              <span className="feature-icon">🛡️</span>
              <div><strong>BCrypt Hashed</strong><p>Passwords stored securely</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <h2 className="auth-title">Reset Password</h2>
          <p className="auth-sub">Enter your email, reset token, and new password</p>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email Address</label>
              <input name="email" type="email" value={form.email}
                onChange={handleChange} placeholder="you@example.com" required autoFocus />
            </div>
            <div className="input-group">
              <label>Reset Token</label>
              <input name="token" type="text" value={form.token}
                onChange={handleChange} placeholder="6-digit token" required />
            </div>
            <div className="input-group">
              <label>New Password</label>
              <input name="newPassword" type="password" value={form.newPassword}
                onChange={handleChange} placeholder="Min 8 characters" required />
            </div>
            <div className="input-group">
              <label>Confirm New Password</label>
              <input name="confirm" type="password" value={form.confirm}
                onChange={handleChange} placeholder="Repeat new password" required />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password →'}
            </button>
          </form>
          <p className="auth-switch">
            <Link to="/forgot-password">← Get a new token</Link>
            {' · '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
