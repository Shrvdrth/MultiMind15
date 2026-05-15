import api from './client';

export interface AuthResponse {
  token: string;
  email: string;
  userId: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export const register = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/register', { email, password });

export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/login', { email, password });

export const forgotPassword = (email: string) =>
  api.post<{ token: string; message: string }>('/auth/forgot-password', { email });

export const resetPassword = (email: string, token: string, newPassword: string) =>
  api.post<{ message: string }>('/auth/reset-password', { email, token, newPassword });

export const getProfile = () =>
  api.get<UserProfile>('/users/me');

export const updateProfile = (displayName: string) =>
  api.put<{ displayName: string; message: string }>('/users/me', { displayName });

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.put<{ message: string }>('/users/me/password', { currentPassword, newPassword });
