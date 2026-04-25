import { api, setTokens, clearTokens } from './api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'SALES' | 'READONLY';
}

export async function login(email: string, password: string, totpCode?: string) {
  const data = await api.post('/auth/login', { email, password, totpCode });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout() {
  try { await api.post('/auth/logout'); } catch {}
  clearTokens();
}

export async function me(): Promise<User> {
  return api.get('/auth/me');
}
