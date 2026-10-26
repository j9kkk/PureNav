import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireUser } from '../lib/http.js';
import { configVersion, getSetting } from '../lib/settings.js';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  collapsed: number;
}

interface ItemRow {
  id: string;
  group_id: string;
  title: string;
  url: string;
  description: string | null;
  icon_type: string;
  icon_ref: string | null;
  icon_asset_id: string | null;
  open_in_new_tab: number;
  pinned: number;
  sort_order: number;
}

export interface PublicItem {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: { type: string; ref: string | null; assetId: string | null };
  openInNewTab: boolean;
  pinned: boolean;
  tags: string[];
}

export interface PublicGroup {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  collapsed: boolean;
  items: PublicItem[];
}

/** Anonymous payload: public + enabled rows only, and lan_url is never included. */
export function buildPublicConfig(): {
  version: number;
  site: Record<string, unknown>;
  groups: PublicGroup[];
  tags: { id: string; name: string; color: string | null }[];
} {
  const groups = db
    .prepare(
      `SELECT id, name, description, icon, parent_id, sort_order, collapsed FROM groups
       WHERE enabled = 1 AND visibility = 'public' ORDER BY sort_order ASC, id ASC`,
    )
    .all() as GroupRow[];

  const items = db
    .prepare(
      `SELECT id, group_id, title, url, description, icon_type, icon_ref, icon_asset_id,
              open_in_new_tab, pinned, sort_order
       FROM items
       WHERE enabled = 1 AND visibility = 'public'
       ORDER BY pinned DESC, sort_order ASC, id ASC`,
    )
    .all() as ItemRow[];

  const tagRows = db
    .prepare(
      `SELECT t.id, t.name, t.color, it.item_id FROM tags t
       JOIN item_tags it ON it.tag_id = t.id`,
    )
    .all() as { id: string; name: string; color: string | null; item_id: string }[];

  const tagNameById = new Map<string, string>();
  const itemTags = new Map<string, string[]>();
  for (const row of tagRows) {
    tagNameById.set(row.id, row.name);
    const list = itemTags.get(row.item_id) ?? [];
    list.push(row.name);
    itemTags.set(row.item_id, list);
  }

  const itemsByGroup = new Map<string, PublicItem[]>();
  for (const row of items) {
    const list = itemsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      url: row.url,
      description: row.description,
      icon: resolveIcon(row),
      openInNewTab: row.open_in_new_tab === 1,
      pinned: row.pinned === 1,
      tags: itemTags.get(row.id) ?? [],
    });
    itemsByGroup.set(row.group_id, list);
  }

  const usedTagIds = new Set(tagRows.map((r) => r.id));
  const tags = db
    .prepare('SELECT id, name, color FROM tags ORDER BY name ASC')
    .all()
    .filter((row) => usedTagIds.has((row as { id: string }).id)) as {
    id: string;
    name: string;
    color: string | null;
  }[];

  return {
    version: configVersion(),
    site: {
      identity: getSetting('site.identity'),
      theme: getSetting('site.theme'),
      layout: getSetting('site.layout'),
    },
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      icon: group.icon,
      parentId: group.parent_id ?? null,
      collapsed: group.collapsed === 1,
      items: itemsByGroup.get(group.id) ?? [],
    })),
    tags,
  };
}

/** Resolves an `asset` icon to a servable URL; asset ids alone are not valid paths. */
export function resolveIcon(row: {
  icon_type: string;
  icon_ref: string | null;
  icon_asset_id: string | null;
}): { type: string; ref: string | null; assetId: string | null } {
  if (row.icon_type === 'asset' && row.icon_asset_id) {
    const asset = db.prepare('SELECT storage_key FROM assets WHERE id = ?').get(row.icon_asset_id) as
      | { storage_key: string }
      | undefined;
    return { type: 'asset', ref: asset ? `/uploads/${asset.storage_key}` : null, assetId: row.icon_asset_id };
  }
  return { type: row.icon_type, ref: row.icon_ref, assetId: row.icon_asset_id };
}

/**
 * Admin-only payload: identical to the public config plus `lanUrl`.
 * This is the ONLY place lan_url leaves the server, and it requires a session.
 */
export function buildAdminConfig(): ReturnType<typeof buildPublicConfig> & {
  items: Record<string, { lanUrl: string | null }>;
} {
  const base = buildPublicConfig();
  const rows = db
    .prepare('SELECT id, lan_url FROM items WHERE enabled = 1 AND visibility = ?')
    .all('public') as { id: string; lan_url: string | null }[];

  const items: Record<string, { lanUrl: string | null }> = {};
  for (const row of rows) items[row.id] = { lanUrl: row.lan_url };

  return { ...base, items };
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/config', async (req, reply) => {
    const etag = `W/"cfg-${configVersion()}"`;
    if (req.headers['if-none-match'] === etag) {
      return reply.status(304).send();
    }
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'no-cache');
    return buildPublicConfig();
  });

  // Never cached: the response depends on the session, so a shared cache must not store it.
  app.get('/public/config/admin', async (req, reply) => {
    requireUser(req);
    reply.header('Cache-Control', 'no-store');
    return buildAdminConfig();
  });
}
