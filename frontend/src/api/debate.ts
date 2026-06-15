import api from './client';

export interface AgentResponseDto {
  agentType: string;
  responseText: string;
}

export interface DebateRoundDto {
  roundNumber: number;
  responses: AgentResponseDto[];
}

export interface ModeratorSynthesisDto {
  recommendation: string;
  confidenceScore: number;
  keyDissentingViewpoints: string;
  fullSynthesis: string;
}

export interface DebateSessionDto {
  sessionId: string;
  originalPrompt: string;
  status: string;
  rounds: DebateRoundDto[];
  synthesis: ModeratorSynthesisDto | null;
  isFavourite?: boolean;
  createdAt?: string;
  userInput?: string;
}

export interface HistoryItem {
  id: string;
  originalPrompt: string;
  status: string;
  createdAt: string;
  isFavourite: boolean;
}

export interface DebateStats {
  total: number;
  completed: number;
  failed: number;
  favourites: number;
  avgConfidence: number;
}

export const startDebate = (prompt: string) =>
  api.post<{ sessionId: string }>('/debate/start', { prompt });

export const getSession = (sessionId: string) =>
  api.get<DebateSessionDto>(`/debate/${sessionId}`);

export const getHistory = (search?: string, status?: string) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const qs = params.toString();
  return api.get<HistoryItem[]>(`/debate/history${qs ? `?${qs}` : ''}`);
};

export const getStats = () =>
  api.get<DebateStats>('/debate/stats');

export const toggleFavourite = (sessionId: string) =>
  api.put<{ isFavourite: boolean }>(`/debate/${sessionId}/favourite`);

export const submitUserInput = (sessionId: string, message: string) =>
  api.post<{ message: string }>(`/debate/${sessionId}/user-input`, { message });

export const skipUserInput = (sessionId: string) =>
  api.post<{ message: string }>(`/debate/${sessionId}/user-input/skip`);
