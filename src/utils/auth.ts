import type { AuthSession } from '../types';

const AUTH_SESSION_KEY = 'ece297-auth-session';

export const getAuthSession = (): AuthSession | null => {
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
};

export const saveAuthSession = (session: AuthSession): void => {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
};

export const clearAuthSession = (): void => {
  localStorage.removeItem(AUTH_SESSION_KEY);
};

export const getAuthToken = (): string | null =>
  getAuthSession()?.token ?? null;
