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
function hostFromUri(uri: string | undefined | null): string | null {
  if (!uri) return null;
  const match = /(?:^|\/\/|exp:\/\/)([\d.]+)/.exec(uri);
  const host = match?.[1];
  if (!host || host === '127.0.0.1' || host === 'localhost') return null;
  return host;
}

function resolveApiBase(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');

  if (Platform.OS === 'web') return 'http://localhost:8000/api/v1';

  const host =
    hostFromUri(Constants.expoConfig?.hostUri) ??
    hostFromUri(Constants.platform?.hostUri) ??
    hostFromUri(Constants.linkingUri) ??
    hostFromUri(Constants.experienceUrl);

  if (host) return `http://${host}:8000/api/v1`;

  if (__DEV__) {
    console.warn(
      '[config] Could not derive the dev host from Metro. API requests will go to ' +
        '127.0.0.1 and will fail on a physical device. Start the dev server with ' +
        '`npx expo start --host lan` or set EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000/api/v1',
    );
  }

  return 'http://127.0.0.1:8000/api/v1';
}

export const API_BASE = resolveApiBase();