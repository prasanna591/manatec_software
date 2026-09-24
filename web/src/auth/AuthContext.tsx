import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, ApiError, setAccessToken } from '../api/client';
import type { UserProfile } from '../api/types';

const TOKEN_KEY = 'manatec.access_token';
const USER_KEY = 'manatec.user';

interface AuthContextValue {
  user: UserProfile | null;
  initializing: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = window.localStorage.getItem(TOKEN_KEY);
        const cached = window.localStorage.getItem(USER_KEY);
        if (!token) return;
        setAccessToken(token);
        if (cached) setUser(JSON.parse(cached) as UserProfile);
        const fresh = await api.me();
        setUser(fresh);
        window.localStorage.setItem(USER_KEY, JSON.stringify(fresh));
      } catch {
        setAccessToken(null);
        setUser(null);
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      async signIn(username: string, password: string) {
        const res = await api.login(username.trim(), password);
        setAccessToken(res.access_token);
        setUser(res.user);
        window.localStorage.setItem(TOKEN_KEY, res.access_token);
        window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      },
      async signOut() {
        setAccessToken(null);
        setUser(null);
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
      },
    }),
    [user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Used by pages: on 401 the session has expired → back to login. */
export function isSessionExpired(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}