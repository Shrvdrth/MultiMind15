import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { ReactNode } from 'react';

interface Props { children: ReactNode }

export function AdminLayout({ children }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <span className="logo-mark">M²</span>
          <span>Admin</span>
        </div>
        <nav className="admin-sidebar__nav">
          <NavLink to="/admin" end className={({ isActive }) => isActive ? 'active' : ''}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'active' : ''}>
            👥 Users
          </NavLink>
          <NavLink to="/admin/debates" className={({ isActive }) => isActive ? 'active' : ''}>
            💬 Debates
          </NavLink>
          <NavLink to="/admin/logs" className={({ isActive }) => isActive ? 'active' : ''}>
            📋 Audit Logs
          </NavLink>
          <NavLink to="/admin/application-logs" className={({ isActive }) => isActive ? 'active' : ''}>
            🖥️ App Logs
          </NavLink>
          <NavLink to="/dashboard" className="">
            ← Back to App
          </NavLink>
        </nav>
        <button className="admin-sidebar__logout" onClick={handleLogout}>
          Sign Out
        </button>
      </aside>
      <main className="admin-content">
        {children}
      </main>
    </div>
  );
}
