import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

/**
 * Devtools are web-only (they touch `document`/`window` and pull in
 * react-dom). Importing `@tanstack/react-query-devtools` unconditionally
 * ships that DOM code into the native Hermes bundle and can blank/crash
 * Expo Go on Android/iOS. Use the browser devtools when running
 * `expo start --web` instead.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}