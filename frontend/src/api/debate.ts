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
}

export interface HistoryItem {
  id: string;
  originalPrompt: string;
  status: string;
  createdAt: string;
}

export const startDebate = (prompt: string) =>
  api.post<{ sessionId: string }>('/debate/start', { prompt });

export const getSession = (sessionId: string) =>
  api.get<DebateSessionDto>(`/debate/${sessionId}`);

export const getHistory = () =>
  api.get<HistoryItem[]>('/debate/history');
