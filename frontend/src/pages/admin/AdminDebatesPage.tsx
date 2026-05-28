import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import type { AdminDebate } from '../../api/admin';

export default function AdminDebatesPage() {
  const [debates, setDebates] = useState<AdminDebate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 20;

  const load = (pg = page, q = search, s = status) => {
    setLoading(true);
    adminApi.getDebates(q || undefined, undefined, s || undefined, pg, pageSize)
      .then(r => { setDebates(r.data.debates); setTotal(r.data.total); })
      .catch(() => setError('Failed to load debates'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, '', ''); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search, status);
  };

  const deleteDebate = async (id: string) => {
    if (!window.confirm('Soft-delete this debate?')) return;
    await adminApi.deleteDebate(id);
    load();
  };

  const pages = Math.ceil(total / pageSize);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1>Debates ({total})</h1>
        <form onSubmit={handleSearch} className="admin-search-form">
          <input
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search prompt..."
          />
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
          <button className="btn btn--primary" type="submit">Filter</button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Status</th>
              <th>User</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j}><div className="skeleton skeleton-text" /></td>
                  ))}
                </tr>
              ))
              : debates.map(d => (
                <tr key={d.id} className={d.isDeleted ? 'row--deleted' : ''}>
                  <td className="td--truncate">{d.prompt}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${d.status}`}>{d.status}</span>
                  </td>
                  <td>{d.userEmail}</td>
                  <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td>
                    {!d.isDeleted && (
                      <button className="btn btn--sm btn--danger" onClick={() => deleteDebate(d.id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="admin-pagination">
          <button className="btn btn--ghost" disabled={page <= 1} onClick={() => { setPage(p => p - 1); load(page - 1); }}>← Prev</button>
          <span>{page} / {pages}</span>
          <button className="btn btn--ghost" disabled={page >= pages} onClick={() => { setPage(p => p + 1); load(page + 1); }}>Next →</button>
        </div>
      )}
    </AdminLayout>
  );
}
