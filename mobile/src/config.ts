import Constants from 'expo-constants';

/**
 * Resolve the backend host.
 *
 * In development the app usually runs on a phone (Expo Go) or emulator, where
 * `127.0.0.1` points at the device, not the dev machine. Expo exposes the Metro
 * bundler host (`hostUri`, e.g. "192.168.1.20:8081"); we reuse that host and
 * swap in the API port. Override with EXPO_PUBLIC_API_URL when needed.
 */
function resolveApiBase(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:8099/api/v1`;

  return 'http://127.0.0.1:8099/api/v1';
}

export const API_BASE = resolveApiBase();
