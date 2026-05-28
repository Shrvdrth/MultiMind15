import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import type { AdminLog } from '../../api/admin';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 30;

  const load = (pg = page) => {
    setLoading(true);
    adminApi.getLogs(pg, pageSize)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); })
      .catch(() => setError('Failed to load audit logs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const pages = Math.ceil(total / pageSize);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1>Audit Logs ({total})</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Action</th>
              <th>Target Type</th>
              <th>Details</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j}><div className="skeleton skeleton-text" /></td>
                  ))}
                </tr>
              ))
              : logs.map(l => (
                <tr key={l.id}>
                  <td>{l.adminEmail}</td>
                  <td><span className="admin-badge">{l.action}</span></td>
                  <td>{l.targetType}</td>
                  <td>{l.details ?? '—'}</td>
                  <td>{new Date(l.createdAt).toLocaleString()}</td>
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
