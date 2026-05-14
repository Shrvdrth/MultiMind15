import api from './client';

export interface AuthResponse {
  token: string;
  email: string;
  userId: string;
}

export const register = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/register', { email, password });

export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/login', { email, password });
