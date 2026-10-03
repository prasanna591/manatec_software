import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setAccessToken } from '../api/client';
import type { UserProfile } from '../api/types';
import { storage } from './storage';

const TOKEN_KEY = 'manatec.access_token';
const REFRESH_KEY = 'manatec.refresh_token';
const USER_KEY = 'manatec.user';

async function persistSession(res: { access_token: string; refresh_token: string; user: UserProfile }) {
  setAccessToken(res.access_token);
  await Promise.all([
    storage.set(TOKEN_KEY, res.access_token),
    storage.set(REFRESH_KEY, res.refresh_token),
    storage.set(USER_KEY, JSON.stringify(res.user)),
  ]);
}

async function clearSession() {
  setAccessToken(null);
  await Promise.all([storage.remove(TOKEN_KEY), storage.remove(REFRESH_KEY), storage.remove(USER_KEY)]);
}

interface AuthContextValue {
  user: UserProfile | null;
  initializing: boolean;
  authError: string | null;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.get(TOKEN_KEY);
        if (token) {
          setAccessToken(token);
          const fresh = await api.me();
          setUser(fresh);
          await storage.set(USER_KEY, JSON.stringify(fresh));
        }
      } catch {
        await clearSession();
      }
      setInitializing(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      authError,
      signOut() {
        clearSession();
        setUser(null);
      },
    }),
    [user, initializing, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
