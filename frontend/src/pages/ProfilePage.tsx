import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getProfile, updateProfile, changePassword } from '../api/auth';
import { getStats } from '../api/debate';
import type { UserProfile } from '../api/auth';
import type { DebateStats } from '../api/debate';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<DebateStats | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    getProfile().then(r => {
      setProfile(r.data);
      setDisplayName(r.data.displayName || '');
    }).catch(() => {});
    getStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(''); setProfileErr('');
    setSavingProfile(true);
    try {
      const r = await updateProfile(displayName);
      setProfileMsg(r.data.message);
      setProfile(p => p ? { ...p, displayName: r.data.displayName } : p);
    } catch (err: any) {
      setProfileErr(err?.response?.data?.message ?? 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(''); setPwErr('');
    if (pwForm.next !== pwForm.confirm) { setPwErr('New passwords do not match.'); return; }
    if (pwForm.next.length < 8) { setPwErr('New password must be at least 8 characters.'); return; }
    setSavingPw(true);
    try {
      const r = await changePassword(pwForm.current, pwForm.next);
      setPwMsg(r.data.message);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setPwErr(err?.response?.data?.message ?? 'Failed to change password.');
    } finally {
      setSavingPw(false);
    }
  };

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : '—';

  return (
    <div className="profile-page">
      <div className="profile-header">
        <Link to="/dashboard" className="btn-back">← Dashboard</Link>
        <h1 className="gradient-text">My Profile</h1>
        <p className="profile-sub">Manage your account and view your analytics stats</p>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="profile-stats-grid">
          <div className="profile-stat-card">
            <span className="pstat-value">{stats.total}</span>
            <span className="pstat-label">Total Debates</span>
          </div>
          <div className="profile-stat-card">
            <span className="pstat-value">{stats.completed}</span>
            <span className="pstat-label">Completed</span>
          </div>
          <div className="profile-stat-card">
            <span className="pstat-value">{stats.favourites}</span>
            <span className="pstat-label">Favourites</span>
          </div>
          <div className="profile-stat-card">
            <span className="pstat-value">
              {stats.avgConfidence > 0 ? `${Math.round(stats.avgConfidence)}%` : '—'}
            </span>
            <span className="pstat-label">Avg Confidence</span>
          </div>
          <div className="profile-stat-card">
            <span className="pstat-value">{memberSince}</span>
            <span className="pstat-label">Member Since</span>
          </div>
        </div>
      )}

      <div className="profile-panels">
        {/* Account info */}
        <div className="profile-panel glass-card">
          <h2 className="panel-title">Account Info</h2>
          <div className="account-detail">
            <span className="detail-label">Email</span>
            <span className="detail-value">{profile?.email ?? '—'}</span>
          </div>
          <form onSubmit={handleProfileSave}>
            <div className="input-group">
              <label>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                maxLength={100}
              />
            </div>
            {profileMsg && <div className="success-banner">{profileMsg}</div>}
            {profileErr && <div className="error-banner">{profileErr}</div>}
            <button type="submit" className="btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="profile-panel glass-card">
          <h2 className="panel-title">Change Password</h2>
          <form onSubmit={handlePasswordChange}>
            <div className="input-group">
              <label>Current Password</label>
              <input
                type="password"
                value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                placeholder="Enter current password"
                required
              />
            </div>
            <div className="input-group">
              <label>New Password</label>
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                placeholder="Min 8 characters"
                required
              />
            </div>
            <div className="input-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Repeat new password"
                required
              />
            </div>
            {pwMsg && <div className="success-banner">{pwMsg}</div>}
            {pwErr && <div className="error-banner">{pwErr}</div>}
            <button type="submit" className="btn-primary" disabled={savingPw}>
              {savingPw ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
