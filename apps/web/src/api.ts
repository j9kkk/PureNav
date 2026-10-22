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

  /** Includes `lanUrl` per item; requires a session and is never cached. */
  adminConfig: () => request<AdminConfigResponse>('/public/config/admin'),

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

  settings: () => request<AdminSettings>('/admin/settings'),
  updateSettings: (body: SettingsPatch) =>
    request<AdminSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),

  exportJson: async (): Promise<Blob> => {
    const response = await fetch(`${BASE}/admin/export?format=json`, { credentials: 'same-origin' });
    if (!response.ok) throw new ApiError(response.status, 'EXPORT_FAILED', '导出失败');
    return response.blob();
  },
  exportBookmarks: async (): Promise<Blob> => {
    const response = await fetch(`${BASE}/admin/export?format=bookmarks.html`, { credentials: 'same-origin' });
    if (!response.ok) throw new ApiError(response.status, 'EXPORT_FAILED', '导出失败');
    return response.blob();
  },
  importConfig: (payload: unknown, mode: 'merge' | 'replace') =>
    request<{ created: number; mode: string }>(`/admin/import?mode=${mode}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  auditLogs: (cursor?: string) =>
    request<AuditLogPage>(`/admin/audit-logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  sessions: () => request<{ items: SessionInfo[] }>('/auth/sessions'),
  revokeSession: (id: string) => request<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),

  batchItems: (op: 'enable' | 'disable' | 'delete' | 'move', ids: string[], groupId?: string) =>
    request<{ affected: number }>('/admin/items/batch', {
      method: 'POST',
      body: JSON.stringify({ op, ids, groupId }),
    }),

  searchIcons: (q: string) =>
    request<{ items: { id: string; url: string }[] }>(`/admin/icons/search?q=${encodeURIComponent(q)}`),

  uploadIcon: async (file: File): Promise<{ assetId: string; url: string }> => {
    const form = new FormData();
    form.append('file', file);
    // No Content-Type header: the browser must set the multipart boundary itself.
    const response = await fetch(`${BASE}/admin/icons/upload`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(response.status, payload?.error?.code ?? 'UNKNOWN', payload?.error?.message ?? '上传失败');
    }
    return payload as { assetId: string; url: string };
  },
};

export interface AdminConfigResponse {
  version: number;
  site: PublicConfig['site'];
  groups: PublicConfig['groups'];
  tags: PublicConfig['tags'];
  items: Record<string, { lanUrl: string | null }>;
}

export interface AdminSettings {
  identity: { title: string; logo: string | null; favicon: string | null; description: string | null };
  theme: { mode: 'light' | 'dark' | 'auto'; accent: string; radius: number; shadow: 'none' | 'soft' | 'strong' };
  layout: {
    density: 'compact' | 'comfortable';
    cardSize: 'sm' | 'md' | 'lg';
    showDescription: boolean;
    defaultView: 'grid' | 'list';
  };
  security: { allowFaviconFetch: boolean; lanUnlockEnabled: boolean };
  meta: { version: number; setupCompletedAt: string | null };
}

/** Deep-partial: any section may be sent on its own. */
export interface SettingsPatch {
  identity?: Partial<AdminSettings['identity']>;
  theme?: Partial<AdminSettings['theme']>;
  layout?: Partial<AdminSettings['layout']>;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: string | null;
  ip: string | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  ip: string | null;
  userAgent: string | null;
}

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
