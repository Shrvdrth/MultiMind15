import api from './client';

export interface Comment {
  id: string;
  sessionId: string;
  userId: string | null;
  displayName: string | null;
  agentType: string | null;
  content: string;
  isAiGenerated: boolean;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string | null;
  replies: Comment[];
}

export const getComments = (sessionId: string) =>
  api.get<Comment[]>(`/debate/${sessionId}/comments`);

export const createComment = (sessionId: string, content: string) =>
  api.post<Comment>(`/debate/${sessionId}/comments`, { content });

export const updateComment = (sessionId: string, commentId: string, content: string) =>
  api.put<Comment>(`/debate/${sessionId}/comments/${commentId}`, { content });

export const deleteComment = (sessionId: string, commentId: string) =>
  api.delete(`/debate/${sessionId}/comments/${commentId}`);
