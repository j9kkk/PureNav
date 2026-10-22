import { db, nowIso } from '../db/index.js';
import { ulid } from './ids.js';

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'site.identity': { title: 'PureNav', logo: null, favicon: null, description: 'A fast, self-hosted navigation page.' },
  'site.theme': { mode: 'auto', accent: '#5b8def', radius: 16, shadow: 'soft' },
  'site.layout': { density: 'comfortable', cardSize: 'md', showDescription: true, defaultView: 'grid' },
  'site.security': { allowFaviconFetch: true, lanUnlockEnabled: false },
  'site.meta': { version: 1, setupCompletedAt: null },
};

export function getSetting<T = unknown>(key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return DEFAULT_SETTINGS[key] as T | undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return DEFAULT_SETTINGS[key] as T | undefined;
  }
}

export function setSetting(key: string, value: unknown, updatedBy: string | null = null): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(key, JSON.stringify(value), nowIso(), updatedBy);
}

/** Deep-merges a patch into an existing object setting. Arrays are replaced wholesale. */
export function mergeSetting(key: string, patch: Record<string, unknown>, updatedBy: string | null = null): unknown {
  const current = (getSetting<Record<string, unknown>>(key) ?? {}) as Record<string, unknown>;
  const merged = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const existing = merged[k];
      merged[k] = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), ...(v as Record<string, unknown>) }
        : v;
    } else {
      merged[k] = v;
    }
  }
  setSetting(key, merged, updatedBy);
  return merged;
}

/** Bumps the global config version used for ETag / client cache invalidation. */
export function bumpVersion(): number {
  const meta = (getSetting<Record<string, unknown>>('site.meta') ?? {}) as Record<string, unknown>;
  const next = Number(meta.version ?? 0) + 1;
  setSetting('site.meta', { ...meta, version: next });
  return next;
}

export function configVersion(): number {
  const meta = (getSetting<Record<string, unknown>>('site.meta') ?? {}) as Record<string, unknown>;
  return Number(meta.version ?? 0);
}

export function audit(
  actorId: string | null,
  action: string,
  entityType: string | null,
  entityId: string | null,
  payload: unknown,
  ip: string | null,
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ulid(), actorId, action, entityType, entityId, payload === undefined ? null : JSON.stringify(payload), ip, nowIso());
}
