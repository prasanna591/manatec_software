import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Resolve the backend host.
 *
 * On a device/emulator `127.0.0.1` points at the device itself, so we reuse the
 * Metro host from `hostUri` (e.g. "192.168.1.20:8081") and swap in the API port.
 * On web the page and the API share the machine, and `hostUri` points at Metro —
 * so reusing it would send every request to the dev server instead of the API.
 * Override with EXPO_PUBLIC_API_URL when needed.
 */
function resolveApiBase(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');

  if (Platform.OS === 'web') return 'http://localhost:8099/api/v1';

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8099/api/v1`;

  return 'http://127.0.0.1:8099/api/v1';
}

export const API_BASE = resolveApiBase();