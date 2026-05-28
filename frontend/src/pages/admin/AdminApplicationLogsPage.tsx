import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import type { ApplicationLog } from '../../api/admin';

const LEVEL_COLORS: Record<string, string> = {
  Info:    '#34d399',
  Warning: '#fbbf24',
  Error:   '#f87171',
};

const CATEGORY_ICONS: Record<string, string> = {
  HttpRequest: '🌐',
  Exception:   '💥',
  AiCall:      '🤖',
};

const PAGE_SIZE = 50;

export default function AdminApplicationLogsPage() {
  const [logs, setLogs]         = useState<ApplicationLog[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [level, setLevel]       = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = (pg = page, lv = level, cat = category) => {
    setLoading(true);
    adminApi.getApplicationLogs(lv || undefined, cat || undefined, pg, PAGE_SIZE)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); })
      .catch(() => setError('Failed to load application logs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, '', ''); }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => load(), 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, page, level, category]);

  const applyFilters = () => { setPage(1); load(1, level, category); };

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1>Application Logs ({total.toLocaleString()})</h1>
        <label className="admin-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (10s)
        </label>
      </div>

      {/* Filters */}
      <div className="admin-filter-row">
        <select className="input" value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">All Levels</option>
          <option value="Info">Info</option>
          <option value="Warning">Warning</option>
          <option value="Error">Error</option>
        </select>
        <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          <option value="HttpRequest">HTTP Requests</option>
          <option value="Exception">Exceptions</option>
          <option value="AiCall">AI Calls</option>
        </select>
        <button className="btn btn--primary" onClick={applyFilters}>Apply</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Category</th>
              <th>Message</th>
              <th>Path</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j}><div className="skeleton skeleton-text" /></td>
                  ))}
                </tr>
              ))
              : logs.map(log => (
                <>
                  <tr
                    key={log.id}
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    style={{ cursor: log.details ? 'pointer' : 'default' }}
                  >
                    <td>
                      <span
                        className="admin-badge"
                        style={{ background: LEVEL_COLORS[log.level] + '33', color: LEVEL_COLORS[log.level] }}
                      >
                        {log.level}
                      </span>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge--neutral">
                        {CATEGORY_ICONS[log.category] ?? ''} {log.category}
                      </span>
                    </td>
                    <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.message}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.path ?? '—'}</td>
                    <td>
                      {log.statusCode != null ? (
                        <span style={{
                          color: log.statusCode >= 500 ? '#f87171' : log.statusCode >= 400 ? '#fbbf24' : '#34d399',
                          fontWeight: 600,
                        }}>
                          {log.statusCode}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{log.durationMs != null ? `${log.durationMs}ms` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {new Date(log.createdAt).toLocaleTimeString()} {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                  {expanded === log.id && log.details && (
                    <tr key={`${log.id}-detail`}>
                      <td colSpan={7}>
                        <pre style={{
                          margin: 0,
                          padding: '0.75rem',
                          background: '#0a0a0a',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          overflowX: 'auto',
                          maxHeight: 300,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}>
                          {log.details}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="admin-pagination">
          <button className="btn btn--ghost" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>
            ← Prev
          </button>
          <span>{page} / {pages}</span>
          <button className="btn btn--ghost" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p); }}>
            Next →
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
