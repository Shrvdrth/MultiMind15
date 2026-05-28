import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import type { AdminStats } from '../../api/admin';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.getStats()
      .then(r => setStats(r.data))
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout>
      <h1>Dashboard</h1>
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <div className="admin-stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-stat-card skeleton-card">
              <div className="skeleton skeleton-text" style={{ width: '60%' }} />
              <div className="skeleton skeleton-text" style={{ width: '40%', marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="admin-stats-grid">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Active Users" value={stats.activeUsers} accent="success" />
          <StatCard label="Suspended" value={stats.suspendedUsers} accent="danger" />
          <StatCard label="Total Debates" value={stats.totalDebates} />
          <StatCard label="Completed" value={stats.completedDebates} accent="success" />
          <StatCard label="AI Calls" value={stats.totalAiCalls} />
        </div>
      ) : null}
    </AdminLayout>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className={`admin-stat-card${accent ? ` admin-stat-card--${accent}` : ''}`}>
      <div className="admin-stat-card__value">{value.toLocaleString()}</div>
      <div className="admin-stat-card__label">{label}</div>
    </div>
  );
}
