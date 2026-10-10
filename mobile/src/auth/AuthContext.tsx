import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  api,
  ApiError,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setTokenRefreshHandler,
  setUnauthorizedHandler,
} from '../api/client';
import type { LoginResponse, UserProfile } from '../api/types';
import { storage } from './storage';
import {
  anyAction,
  can as canPerm,
  hasModule as hasModulePerm,
  type Action,
} from './permissions';

const TOKEN_KEY = 'manatec.access_token';
const REFRESH_KEY = 'manatec.refresh_token';

async function clearSession(): Promise<void> {
  setAccessToken(null);
  setRefreshToken(null);
  await Promise.all([storage.remove(TOKEN_KEY), storage.remove(REFRESH_KEY)]);
}

interface AuthContextValue {
  user: UserProfile | null;
  initializing: boolean;
  signingIn: boolean;
  authError: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Revoke every session on all devices, then clear locally (AGENT.md §3). */
  signOutAll: () => Promise<void>;
  reconnect: () => Promise<void>;
  can: (module: string, action: Action) => boolean;
  hasModule: (module: string) => boolean;
  canAny: (module: string) => boolean;
  /** Call when the API answers 401 so the shell falls back to the login screen. */
  invalidate: () => Promise<void>;
}

const BOOTSTRAP_TIMEOUT_MS = 10000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setInitializing(true);
    setAuthError(null);
    try {
      const initPromise = (async () => {
        const [access, refresh] = await Promise.all([
          storage.get(TOKEN_KEY),
          storage.get(REFRESH_KEY),
        ]);
        setAccessToken(access);
        setRefreshToken(refresh);
        if (!access && !refresh) {
          setUser(null);
          return;
        }
        if (!(await api.ensureAccessToken())) {
          await clearSession();
          setUser(null);
          return;
        }
        setUser(await api.me());
      })();

      await Promise.race([
        initPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Bootstrap timeout')), BOOTSTRAP_TIMEOUT_MS)
        ),
      ]);
    } catch (e) {
      if (e instanceof Error && e.message === 'Bootstrap timeout') {
        setAuthError('Unable to reach the server. Please check your connection.');
      } else if (e instanceof ApiError && e.status === 0) {
        setAuthError(e.message);
      } else {
        await clearSession();
        setUser(null);
      }
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (username: string, password: string) => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const res: LoginResponse = await api.login(username.trim(), password);
      setAccessToken(res.access_token);
      setRefreshToken(res.refresh_token);
      await Promise.all([
        storage.set(TOKEN_KEY, res.access_token),
        storage.set(REFRESH_KEY, res.refresh_token),
      ]);
      setUser(res.user);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Sign in failed');
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    // Revoke server-side first (rotating sessions means the token in hand is
    // one-time); a failure still clears the local session.
    await api.logout(getRefreshToken());
    await clearSession();
    setUser(null);
    setAuthError(null);
  }, []);

  const signOutAll = useCallback(async () => {
    try {
      await api.logoutAll();
    } catch {
      // token may already be dead; local clear below is the important part
    }
    await clearSession();
    setUser(null);
    setAuthError(null);
  }, []);

  const invalidate = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  // Any 401 from the API drops straight to the login screen, so screens never
  // have to special-case an expired token.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void invalidate();
    });
    return () => setUnauthorizedHandler(null);
  }, [invalidate]);

  // A token renewed mid-session must outlive the app restart.
  useEffect(() => {
    setTokenRefreshHandler((access, refresh) => {
      void Promise.all([storage.set(TOKEN_KEY, access), storage.set(REFRESH_KEY, refresh)]);
    });
    return () => setTokenRefreshHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      signingIn,
      authError,
      signIn,
      signOut,
      signOutAll,
      reconnect: bootstrap,
      invalidate,
      can: (module, action) => canPerm(user, module, action),
      hasModule: (module) => hasModulePerm(user, module),
      canAny: (module) => anyAction(user, module),
    }),
    [user, initializing, signingIn, authError, signIn, signOut, signOutAll, bootstrap, invalidate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}