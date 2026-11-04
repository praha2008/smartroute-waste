import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { APP } from '../appConfig';
import { api, ApiError, loadSession, setToken, setUnauthorizedHandler } from './api';
import { t } from './i18n';
import type { User } from './types';

export interface CodeSent {
  ok: boolean;
  channel: 'sms' | 'email';
  target: string;
  demo: boolean;
  fallback?: boolean;
  dev_code?: string | null;
}

interface AuthState {
  ready: boolean;
  user: User | null;
  /** identifier = mobile number or email. Throws ApiError; err.data.code === 'PHONE_NOT_VERIFIED' means show the OTP screen. */
  login: (identifier: string, password: string) => Promise<void>;
  /** step 1 of sign-up: creates the account and sends an SMS code */
  register: (data: Record<string, unknown>) => Promise<CodeSent>;
  /** step 2: check the SMS code; logs the user in */
  verifyPhone: (phone: string, code: string) => Promise<void>;
  resendCode: (phone: string) => Promise<CodeSent>;
  forgotPassword: (email: string) => Promise<CodeSent>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: Record<string, unknown>) => Promise<void>;
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
          // offline or expired: user will see the login screen
        }
      }
      setReady(true);
    })();
  }, []);

  const accept = useCallback(async (res: { token: string; user: User }) => {
    if (res.user.role !== APP.role) {
      throw new ApiError(403, t('auth.wrongApp', { app: APP.name, role: t(`role.${res.user.role}`) }));
    }
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => accept(await api.post('/auth/login', { email: identifier.trim(), password })),
    [accept],
  );
  const register = useCallback((data: Record<string, unknown>) => api.post<CodeSent>('/auth/register', { ...data, role: APP.role }), []);
  const verifyPhone = useCallback(async (phone: string, code: string) => accept(await api.post('/auth/verify-phone', { phone, code })), [accept]);
  const resendCode = useCallback((phone: string) => api.post<CodeSent>('/auth/resend-code', { phone }), []);
  const forgotPassword = useCallback((email: string) => api.post<CodeSent>('/auth/forgot-password', { email: email.trim() }), []);
  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) =>
      accept(await api.post('/auth/reset-password', { email: email.trim(), code, new_password: newPassword })),
    [accept],
  );
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    setUserState(await api.post<User>('/auth/change-password', { old_password: oldPassword, new_password: newPassword }));
  }, []);
  const updateProfile = useCallback(async (patch: Record<string, unknown>) => {
    setUserState(await api.patch<User>('/auth/me', patch));
  }, []);
  const refreshUser = useCallback(async () => {
    try {
      setUserState(await api.get<User>('/auth/me'));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ ready, user, login, register, verifyPhone, resendCode, forgotPassword, resetPassword, changePassword, updateProfile, logout, refreshUser, setUser: setUserState }),
    [ready, user, login, register, verifyPhone, resendCode, forgotPassword, resetPassword, changePassword, updateProfile, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
