import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../api/client';
import * as authApi from '../api/auth';

interface AuthContextType {
  token: string | null;
  userId: string | null;
  email: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (token: string, userId: string, email: string, role: string, refreshToken: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [userId, setUserId] = useState<string | null>(localStorage.getItem('userId'));
  const [email, setEmail] = useState<string | null>(localStorage.getItem('email'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('role'));

  const login = (newToken: string, newUserId: string, newEmail: string, newRole: string, newRefreshToken: string) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('userId', newUserId);
    localStorage.setItem('email', newEmail);
    localStorage.setItem('role', newRole);
    localStorage.setItem('refreshToken', newRefreshToken);
    setToken(newToken);
    setUserId(newUserId);
    setEmail(newEmail);
    setRole(newRole);
  };

  const logout = async () => {
    const rt = localStorage.getItem('refreshToken');
    if (rt) {
      try { await authApi.logout(rt); } catch { /* ignore */ }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    localStorage.removeItem('role');
    localStorage.removeItem('refreshToken');
    setToken(null);
    setUserId(null);
    setEmail(null);
    setRole(null);
  };

  // Intercept 401 responses and attempt token refresh
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      res => res,
      async err => {
        const originalRequest = err.config;
        const requestUrl = String(originalRequest?.url ?? '');
        const isAuthRequest = requestUrl.includes('/auth/login')
          || requestUrl.includes('/auth/register')
          || requestUrl.includes('/auth/refresh')
          || requestUrl.includes('/auth/logout');
        if (err.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRequest) {
          const rt = localStorage.getItem('refreshToken');
          if (rt) {
            try {
              originalRequest._retry = true;
              const { data } = await authApi.refreshToken(rt);
              login(data.token, data.userId, data.email, data.role, data.refreshToken);
              originalRequest.headers = originalRequest.headers ?? {};
              originalRequest.headers['Authorization'] = `Bearer ${data.token}`;
              return api(originalRequest);
            } catch {
              await logout();
            }
          } else {
            await logout();
          }
        }
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  return (
    <AuthContext.Provider value={{
      token, userId, email, role,
      isAuthenticated: !!token,
      isAdmin: role === 'Admin',
      login, logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
