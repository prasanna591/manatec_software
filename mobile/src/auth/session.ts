import { ApiError } from '../api/client';

/** The API answered 401 — the stored token is gone or expired. */
export function isSessionExpired(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

/** Network unreachable / timeout, as opposed to a server-side rejection. */
export function isOffline(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}

export function messageOf(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}