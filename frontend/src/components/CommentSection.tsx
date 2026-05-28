import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as commentsApi from '../api/comments';
import type { Comment } from '../api/comments';

interface Props {
  sessionId: string;
  userId: string | null;
}

const AGENT_ICONS: Record<string, string> = {
  Strategist: '🎯',
  RiskAnalyst: '⚠️',
  Engineer: '⚙️',
};

export function CommentSection({ sessionId, userId }: Props) {
  const { isAuthenticated } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    commentsApi.getComments(sessionId)
      .then(r => setComments(r.data))
      .catch(() => setError('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const submit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await commentsApi.createComment(sessionId, newComment);
      setComments(prev => [data, ...prev]);
      setNewComment('');
    } catch {
      setError('Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await commentsApi.deleteComment(sessionId, commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return (
    <section className="comment-section">
      <h3 className="comment-section__title">💬 My Two Cents</h3>
      <p className="comment-section__hint">Share your perspective — the agents will reply.</p>

      {isAuthenticated && (
        <div className="comment-input">
          <textarea
            className="comment-input__textarea"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="What do you think about this debate?"
            rows={3}
            maxLength={2000}
          />
          <div className="comment-input__footer">
            <span className="comment-input__count">{newComment.length}/2000</span>
            <button
              className="btn btn--primary"
              onClick={submit}
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="comment-list">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="comment-card skeleton-card">
              <div className="skeleton skeleton-avatar" />
              <div className="comment-card__body">
                <div className="skeleton skeleton-text" style={{ width: '30%' }} />
                <div className="skeleton skeleton-text" style={{ width: '80%', marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="comment-list">
          {comments.length === 0 && (
            <p className="comment-empty">No comments yet. Be the first to weigh in!</p>
          )}
          {comments.map(c => (
            <CommentCard
              key={c.id}
              comment={c}
              currentUserId={userId}
              onDelete={deleteComment}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CommentCard({
  comment,
  currentUserId,
  onDelete,
}: {
  comment: Comment;
  currentUserId: string | null;
  onDelete: (id: string) => void;
}) {
  const isOwn = !comment.isAiGenerated && comment.userId === currentUserId;
  const icon = comment.isAiGenerated
    ? (AGENT_ICONS[comment.agentType ?? ''] ?? '🤖')
    : '👤';

  const agentClass = comment.isAiGenerated
    ? `comment-card--${comment.agentType?.toLowerCase() ?? 'ai'}`
    : 'comment-card--user';

  return (
    <div className={`comment-card ${agentClass}`}>
      <div className="comment-card__header">
        <span className="comment-card__icon">{icon}</span>
        <strong className="comment-card__author">
          {comment.isAiGenerated ? comment.agentType : (comment.displayName ?? 'User')}
        </strong>
        {comment.isAiGenerated && <span className="admin-badge admin-badge--ai">AI</span>}
        <span className="comment-card__time">
          {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isOwn && (
          <button className="comment-card__delete" onClick={() => onDelete(comment.id)} title="Delete">✕</button>
        )}
      </div>
      <p className="comment-card__content">{comment.content}</p>
      {comment.replies.length > 0 && (
        <div className="comment-tree">
          {comment.replies.map(r => (
            <CommentCard key={r.id} comment={r} currentUserId={currentUserId} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
