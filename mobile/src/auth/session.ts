import { ApiError, type ApiErrorCode } from '../api/client';

/** The API answered 401 — the stored token is gone or expired. */
export function isSessionExpired(e: unknown): boolean {
  return isApiError(e, 'UNAUTH');
}

/** Network unreachable / timeout, as opposed to a server-side rejection. */
export function isOffline(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'NETWORK';
}

/** The write lost a race with a concurrent edit — show server truth, never a bare retry. */
export function isConflict(e: unknown): boolean {
  return isApiError(e, 'CONFLICT');
}

/** The server rejected a mutation because a required permission is missing. */
export function missingPermission(e: unknown): string | undefined {
  if (e instanceof ApiError && e.code === 'DENIED') {
    return e.requiredPermission ?? e.message;
  }
  return undefined;
}

function isApiError(e: unknown, code: ApiErrorCode): boolean {
  return e instanceof ApiError && e.code === code;
}

/**
 * Human message for an API failure (AGENT.md §6). 409 keeps the server's
 * words plus a hint that the record moved underneath; DENIED backend text
 * already names the missing right.
 */
export function messageOf(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiError) {
    if (e.code === 'TIMEOUT') return e.message;
    if (e.code === 'NETWORK') return 'Offline — check your connection and try again.';
    if (e.code === 'RATE_LIMITED') return 'Too many requests — please wait a moment.';
    if (e.code === 'UNAUTH') return 'Your session expired — sign in again.';
    if (e.code === 'CONFLICT')
      return e.message
        ? `${e.message} This was changed by someone else — refresh to see the latest.`
        : 'This was changed by someone else — refresh to see the latest.';
    if (e.message) return e.message;
    return fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}