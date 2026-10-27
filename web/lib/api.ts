export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiKey = {
  id: string; name: string; prefix: string; rpmLimit: number;
  monthlyBudgetUsd: number | null; revokedAt: string | null;
  createdAt: string; lastUsedAt: string | null; monthSpendUsd: number;
};
export type Stats = {
  days: number;
  summary: {
    requests: number; costUsd: number; inputTokens: number; outputTokens: number;
    cacheHitRate: number; errorRate: number; p50Ms: number | null; p95Ms: number | null;
  };
  daily: { day: string; requests: number; costUsd: number }[];
  byModel: { model: string; requests: number; costUsd: number; inputTokens: number; outputTokens: number }[];
};
export type RequestRow = {
  id: string; keyName: string; model: string; inputTokens: number; outputTokens: number;
  costUsd: number; latencyMs: number; cached: boolean; status: number; error: string | null; createdAt: string;
};

const KEY = 'gatewaykit_token';
export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(KEY));
export const setToken = (t: string) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);
export class UnauthorizedError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') throw new UnauthorizedError();
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const login = (email: string, password: string) =>
  request<{ accessToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const getStats = (days: number) => request<Stats>(`/admin/stats?days=${days}`);
export const getRequests = () => request<RequestRow[]>('/admin/requests?limit=50');
export const listKeys = () => request<ApiKey[]>('/admin/keys');
export const createKey = (k: { name: string; rpmLimit?: number; monthlyBudgetUsd?: number }) =>
  request<ApiKey & { secret: string }>('/admin/keys', { method: 'POST', body: JSON.stringify(k) });
export const revokeKey = (id: string) => request<ApiKey>(`/admin/keys/${id}`, { method: 'DELETE' });

export const money = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
