import api from './client';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalDebates: number;
  completedDebates: number;
  totalComments: number;
  totalAiCalls: number;
  generatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  debateCount: number;
}

export interface AdminUserList {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminDebate {
  id: string;
  prompt: string;
  status: string;
  userEmail: string;
  createdAt: string;
  isDeleted: boolean;
}

export interface AdminDebateList {
  debates: AdminDebate[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminLog {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

export interface AdminLogList {
  logs: AdminLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminComment {
  id: string;
  sessionId: string;
  userEmail: string | null;
  agentType: string | null;
  content: string;
  isAiGenerated: boolean;
  isDeleted: boolean;
  createdAt: string;
}

export interface AdminCommentList {
  comments: AdminComment[];
  total: number;
  page: number;
  pageSize: number;
}

export const getStats = () =>
  api.get<AdminStats>('/admin/stats');

export const getUsers = (search?: string, page = 1, pageSize = 20) =>
  api.get<AdminUserList>('/admin/users', { params: { search, page, pageSize } });

export const setUserRole = (userId: string, role: string) =>
  api.put(`/admin/users/${userId}/role`, { role });

export const setUserStatus = (userId: string, isActive: boolean) =>
  api.put(`/admin/users/${userId}/status`, { isActive });

export const deleteUser = (userId: string) =>
  api.delete(`/admin/users/${userId}`);

export const getDebates = (search?: string, userId?: string, status?: string, page = 1, pageSize = 20) =>
  api.get<AdminDebateList>('/admin/debates', { params: { search, userId, status, page, pageSize } });

export const deleteDebate = (sessionId: string) =>
  api.delete(`/admin/debates/${sessionId}`);

export const getComments = (sessionId?: string, page = 1, pageSize = 20) =>
  api.get<AdminCommentList>('/admin/comments', { params: { sessionId, page, pageSize } });

export const deleteComment = (commentId: string) =>
  api.delete(`/admin/comments/${commentId}`);

export const getLogs = (page = 1, pageSize = 30) =>
  api.get<AdminLogList>('/admin/logs', { params: { page, pageSize } });

// ── Password Reset ──

export interface ResetPasswordResponse {
  message: string;
  token?: string;
  expiresAt?: string;
}

export const resetUserPasswordDirect = (userId: string, newPassword: string) =>
  api.post<ResetPasswordResponse>(`/admin/users/${userId}/reset-password`, {
    mode: 'direct',
    newPassword,
  });

export const generateUserResetToken = (userId: string) =>
  api.post<ResetPasswordResponse>(`/admin/users/${userId}/reset-password`, {
    mode: 'generate',
  });

// ── Application Logs ──

export interface ApplicationLog {
  id: string;
  level: string;
  category: string;
  message: string;
  details: string | null;
  userId: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ApplicationLogList {
  logs: ApplicationLog[];
  total: number;
  page: number;
  pageSize: number;
}

export const getApplicationLogs = (level?: string, category?: string, page = 1, pageSize = 50) =>
  api.get<ApplicationLogList>('/admin/application-logs', { params: { level, category, page, pageSize } });
