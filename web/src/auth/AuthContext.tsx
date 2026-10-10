import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  api,
  ApiError,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setTokenRefreshHandler,
  setUnauthorizedHandler,
} from '../api/client';
import type { UserProfile } from '../api/types';

const TOKEN_KEY = 'manatec.access_token';
const REFRESH_KEY = 'manatec.refresh_token';
const USER_KEY = 'manatec.user';

interface AuthContextValue {
  user: UserProfile | null;
  initializing: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function clearLocal(): void {
  setAccessToken(null);
  setRefreshToken(null);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Rotated tokens must outlive a reload.
  useEffect(() => {
    setTokenRefreshHandler((access, refresh) => {
      window.localStorage.setItem(TOKEN_KEY, access);
      window.localStorage.setItem(REFRESH_KEY, refresh);
    });
    return () => setTokenRefreshHandler(null);
  }, []);

  // A session the server has revoked (or a dead refresh token) drops to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearLocal();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = window.localStorage.getItem(TOKEN_KEY);
        const refresh = window.localStorage.getItem(REFRESH_KEY);
        const cached = window.localStorage.getItem(USER_KEY);
        if (token || refresh) {
          setAccessToken(token);
          setRefreshToken(refresh);
          if (cached) setUser(JSON.parse(cached) as UserProfile);
          // `request` transparently renews from the refresh token if the
          // access token is stale, so an expired access token still recovers.
          const fresh = await api.me();
          setUser(fresh);
          window.localStorage.setItem(USER_KEY, JSON.stringify(fresh));
        }
      } catch {
        clearLocal();
        setUser(null);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      signIn: async (username: string, password: string) => {
        const res = await api.login(username.trim(), password);
        setAccessToken(res.access_token);
        setRefreshToken(res.refresh_token);
        setUser(res.user);
        window.localStorage.setItem(TOKEN_KEY, res.access_token);
        window.localStorage.setItem(REFRESH_KEY, res.refresh_token);
        window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      },
      signOut: async () => {
        await api.logout(getRefreshToken());
        clearLocal();
        setUser(null);
      },
      signOutAll: async () => {
        try {
          await api.logoutAll();
        } catch {
          // token may already be dead; local clear still applies
        }
        clearLocal();
        setUser(null);
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
