// Free-tier usage limits: the API answers 429 with { code: "usage_limit" | "rate_limited" }.

/** Static demo page that works without the backend (served from frontend/public). */
export const DEMO_URL: string = import.meta.env.VITE_DEMO_URL || '/MultiMind-Demo.html';

export interface LimitInfo {
  /** "user" = this visitor's daily limit, "site" = the whole site's, "rate" = too many attempts. */
  scope: 'user' | 'site' | 'rate';
  message: string;
}

/** Turns a 429 response body into a friendly message, or null if it isn't a limit error. */
export function parseLimit(status: number | undefined, body: unknown): LimitInfo | null {
  if (status !== 429) return null;
  const data = (body ?? {}) as { code?: string; scope?: string; message?: string; retryAfterSeconds?: number };

  if (data.code === 'rate_limited')
    return { scope: 'rate', message: data.message || 'Too many attempts. Please wait a few minutes and try again.' };

  const scope = data.scope === 'site' ? 'site' : 'user';
  const base = data.message || 'The free daily limit has been reached.';
  const when = formatRetry(data.retryAfterSeconds);
  return { scope, message: `${base} ${when ? `Try again ${when}.` : 'Try again tomorrow.'}` };
}

function formatRetry(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (hours >= 1) return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
