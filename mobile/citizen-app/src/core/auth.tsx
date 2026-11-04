import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { APP } from '../appConfig';
import { api, ApiError, loadSession, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

interface AuthState {
  ready: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<User | null>(null);

  const logout = useCallback(async () => {
    await setToken(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUserState(null);
    });
    (async () => {
      const { token } = await loadSession();
      if (token) {
        try {
          const me = await api.get<User>('/auth/me');
          if (me.role === APP.role) setUserState(me);
          else await setToken(null);
        } catch {
          // offline or expired: user will see login screen
        }
      }
      setReady(true);
    })();
  }, []);

  const accept = useCallback(async (res: { token: string; user: User }) => {
    if (res.user.role !== APP.role) {
      throw new ApiError(403, `This is the ${APP.name} app. Your account is a "${res.user.role}" account — please use the matching app.`);
    }
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => accept(await api.post('/auth/login', { email, password })),
    [accept],
  );

  const register = useCallback(
    async (data: Record<string, unknown>) => accept(await api.post('/auth/register', { ...data, role: APP.role })),
    [accept],
  );

  const refreshUser = useCallback(async () => {
    try {
      setUserState(await api.get<User>('/auth/me'));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ ready, user, login, register, logout, refreshUser, setUser: setUserState }),
    [ready, user, login, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
