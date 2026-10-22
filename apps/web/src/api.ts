import { ApiError, type PublicConfig, type SessionUser } from './types';

const BASE = '/api/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(response.status, error?.code ?? 'UNKNOWN', error?.message ?? '请求失败');
  }
  return payload as T;
}

export interface AuthState {
  needsSetup: boolean;
  authenticated: boolean;
  user: SessionUser | null;
}

export const api = {
  authState: () => request<AuthState>('/auth/state'),
  setup: (username: string, password: string) =>
    request<{ user: SessionUser }>('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<{ user: SessionUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  publicConfig: () =>
    request<PublicConfig>('/public/config'),

  groups: () => request<{ items: AdminGroupDto[] }>('/admin/groups'),
  createGroup: (body: Record<string, unknown>) =>
    request<AdminGroupDto>('/admin/groups', { method: 'POST', body: JSON.stringify(body) }),
  updateGroup: (id: string, body: Record<string, unknown>) =>
    request<AdminGroupDto>(`/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGroup: (id: string, cascade = false) =>
    request<void>(`/admin/groups/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }),
  reorderGroups: (orderedIds: string[]) =>
    request<{ ok: true }>('/admin/groups/order', {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    }),

  items: (groupId?: string) =>
    request<{ items: AdminItemDto[]; total: number }>(`/admin/items${groupId ? `?groupId=${groupId}` : ''}`),
  createItem: (body: Record<string, unknown>) =>
    request<AdminItemDto>('/admin/items', { method: 'POST', body: JSON.stringify(body) }),
  updateItem: (id: string, body: Record<string, unknown>) =>
    request<AdminItemDto>(`/admin/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteItem: (id: string) => request<void>(`/admin/items/${id}`, { method: 'DELETE' }),
  reorderItems: (groupId: string, orderedIds: string[]) =>
    request<{ ok: true }>('/admin/items/order', {
      method: 'PUT',
      body: JSON.stringify({ groupId, ordered_ids: orderedIds }),
    }),

  settings: () => request<Record<string, unknown>>('/admin/settings'),
  updateSettings: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
};

export interface AdminGroupDto {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  collapsed: boolean;
  visibility: 'public' | 'private';
  enabled: boolean;
  itemCount: number;
}

export interface AdminItemDto {
  id: string;
  groupId: string;
  title: string;
  url: string;
  lanUrl: string | null;
  description: string | null;
  icon: { type: string; ref: string | null; assetId: string | null };
  openInNewTab: boolean;
  pinned: boolean;
  sortOrder: number;
  visibility: 'public' | 'private';
  enabled: boolean;
  tags: string[];
}
