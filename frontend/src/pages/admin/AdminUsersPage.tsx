import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import type { AdminUser } from '../../api/admin';

type ResetMode = 'direct' | 'generate';

interface ResetModalState {
  userId: string;
  email: string;
  mode: ResetMode;
  newPassword: string;
  newPassword2: string;
  loading: boolean;
  result: string | null;
  token: string | null;
  error: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers]   = useState<AdminUser[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [resetModal, setResetModal] = useState<ResetModalState | null>(null);
  const pageSize = 20;

  const load = (pg = page, q = search) => {
    setLoading(true);
    adminApi.getUsers(q || undefined, pg, pageSize)
      .then(r => { setUsers(r.data.users); setTotal(r.data.total); })
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, ''); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search);
  };

  const setRole = async (userId: string, role: string) => {
    await adminApi.setUserRole(userId, role);
    load();
  };

  const toggleStatus = async (userId: string, isActive: boolean) => {
    await adminApi.setUserStatus(userId, !isActive);
    load();
  };

  const deleteUser = async (userId: string) => {
    if (!window.confirm('Delete this user? This is a soft delete.')) return;
    await adminApi.deleteUser(userId);
    load();
  };

  const openResetModal = (u: AdminUser) => {
    setResetModal({
      userId: u.id,
      email: u.email,
      mode: 'direct',
      newPassword: '',
      newPassword2: '',
      loading: false,
      result: null,
      token: null,
      error: null,
    });
  };

  const handleResetSubmit = async () => {
    if (!resetModal) return;
    setResetModal(m => m ? { ...m, loading: true, error: null, result: null, token: null } : m);

    try {
      if (resetModal.mode === 'direct') {
        if (resetModal.newPassword.length < 8) {
          setResetModal(m => m ? { ...m, loading: false, error: 'Password must be at least 8 characters.' } : m);
          return;
        }
        if (resetModal.newPassword !== resetModal.newPassword2) {
          setResetModal(m => m ? { ...m, loading: false, error: 'Passwords do not match.' } : m);
          return;
        }
        const r = await adminApi.resetUserPasswordDirect(resetModal.userId, resetModal.newPassword);
        setResetModal(m => m ? { ...m, loading: false, result: r.data.message } : m);
      } else {
        const r = await adminApi.generateUserResetToken(resetModal.userId);
        setResetModal(m => m ? { ...m, loading: false, result: r.data.message, token: r.data.token ?? null } : m);
      }
    } catch {
      setResetModal(m => m ? { ...m, loading: false, error: 'Operation failed. Please try again.' } : m);
    }
  };

  const pages = Math.ceil(total / pageSize);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1>Users ({total})</h1>
        <form onSubmit={handleSearch} className="admin-search-form">
          <input
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or name..."
          />
          <button className="btn btn--primary" type="submit">Search</button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Debates</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j}><div className="skeleton skeleton-text" /></td>
                  ))}
                </tr>
              ))
              : users.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.displayName}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${u.role.toLowerCase()}`}>{u.role}</span>
                  </td>
                  <td>
                    <span className={`admin-badge ${u.isActive ? 'admin-badge--active' : 'admin-badge--suspended'}`}>
                      {u.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td>{u.debateCount}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="admin-actions">
                    <button
                      className="btn btn--sm btn--ghost"
                      onClick={() => setRole(u.id, u.role === 'Admin' ? 'User' : 'Admin')}
                    >
                      {u.role === 'Admin' ? 'Demote' : 'Make Admin'}
                    </button>
                    <button
                      className={`btn btn--sm ${u.isActive ? 'btn--warning' : 'btn--success'}`}
                      onClick={() => toggleStatus(u.id, u.isActive)}
                    >
                      {u.isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => deleteUser(u.id)}
                    >
                      Delete
                    </button>
                    <button
                      className="btn btn--sm btn--ghost"
                      onClick={() => openResetModal(u)}
                    >
                      🔑 Reset PW
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="admin-pagination">
          <button className="btn btn--ghost" disabled={page <= 1} onClick={() => { setPage(p => p - 1); load(page - 1); }}>
            ← Prev
          </button>
          <span>{page} / {pages}</span>
          <button className="btn btn--ghost" disabled={page >= pages} onClick={() => { setPage(p => p + 1); load(page + 1); }}>
            Next →
          </button>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetModal && (
        <div className="modal-overlay" onClick={() => setResetModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2>Reset Password</h2>
              <button className="modal__close" onClick={() => setResetModal(null)}>✕</button>
            </div>
            <p className="modal__subtitle" style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {resetModal.email}
            </p>

            {/* Mode tabs */}
            <div className="modal__tabs">
              <button
                className={`modal__tab${resetModal.mode === 'direct' ? ' active' : ''}`}
                onClick={() => setResetModal(m => m ? { ...m, mode: 'direct', error: null, result: null, token: null } : m)}
              >
                Set Password
              </button>
              <button
                className={`modal__tab${resetModal.mode === 'generate' ? ' active' : ''}`}
                onClick={() => setResetModal(m => m ? { ...m, mode: 'generate', error: null, result: null, token: null } : m)}
              >
                Generate Token
              </button>
            </div>

            {resetModal.mode === 'direct' ? (
              <div className="modal__body">
                <input
                  className="input"
                  type="password"
                  placeholder="New password (min 8 chars)"
                  value={resetModal.newPassword}
                  onChange={e => setResetModal(m => m ? { ...m, newPassword: e.target.value } : m)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Confirm new password"
                  value={resetModal.newPassword2}
                  onChange={e => setResetModal(m => m ? { ...m, newPassword2: e.target.value } : m)}
                  style={{ marginTop: '0.5rem' }}
                />
              </div>
            ) : (
              <div className="modal__body">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  A 6-digit reset token will be generated. Share it with the user so they can reset their password using the Reset Password page.
                  Token expires in 15 minutes.
                </p>
              </div>
            )}

            {resetModal.error && (
              <div className="error-banner" style={{ margin: '0.5rem 0' }}>{resetModal.error}</div>
            )}

            {resetModal.result && (
              <div className="success-banner" style={{ margin: '0.5rem 0' }}>
                {resetModal.result}
                {resetModal.token && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Token:</strong>{' '}
                    <code style={{
                      background: 'var(--surface-2)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 4,
                      fontSize: '1.1rem',
                      letterSpacing: '0.15em',
                    }}>
                      {resetModal.token}
                    </code>
                    <button
                      className="btn btn--sm btn--ghost"
                      style={{ marginLeft: '0.5rem' }}
                      onClick={() => navigator.clipboard.writeText(resetModal.token!)}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setResetModal(null)}>Cancel</button>
              {!resetModal.result && (
                <button
                  className="btn btn--primary"
                  onClick={handleResetSubmit}
                  disabled={resetModal.loading}
                >
                  {resetModal.loading
                    ? 'Processing…'
                    : resetModal.mode === 'direct' ? 'Set Password' : 'Generate Token'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
