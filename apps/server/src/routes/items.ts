import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { ulid } from '../lib/ids.js';
import { ApiError, assertSameOrigin, requireAdmin } from '../lib/http.js';
import { audit, bumpVersion } from '../lib/settings.js';
import { nextOrder, rewriteItemOrder } from './groups.js';
import { isAllowedIconHost } from './icons.js';
import { resolveIcon } from './public.js';

const iconSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auto') }),
  z.object({ type: z.literal('text') }),
  z.object({ type: z.literal('url'), ref: z.string().url().max(2048) }),
  z.object({ type: z.literal('iconify'), ref: z.string().min(1).max(200) }),
  z.object({ type: z.literal('asset'), assetId: z.string().min(1) }),
]);

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, '仅支持 http/https 地址');

const itemCreateSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1, '标题不能为空').max(80),
  url: httpUrl,
  lanUrl: httpUrl.nullish(),
  description: z.string().trim().max(300).nullish(),
  icon: iconSchema.optional(),
  openInNewTab: z.boolean().optional(),
  pinned: z.boolean().optional(),
  isInbox: z.boolean().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  enabled: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});

const itemUpdateSchema = itemCreateSchema.partial().extend({
  groupId: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  httpStatus: z.number().int().nullish(),
  finalUrl: z.string().max(2048).nullish(),
});

const orderSchema = z.object({
  groupId: z.string().min(1),
  ordered_ids: z.array(z.string().min(1)).min(1),
});

const batchSchema = z.object({
  op: z.enum(['enable', 'disable', 'delete', 'move', 'inbox', 'uninbox']),
  ids: z.array(z.string().min(1)).min(1).max(500),
  groupId: z.string().min(1).optional(),
});

const inspectUrlSchema = z.object({
  url: httpUrl,
});

interface ItemRow {
  id: string;
  group_id: string;
  title: string;
  url: string;
  lan_url: string | null;
  description: string | null;
  icon_type: string;
  icon_ref: string | null;
  icon_asset_id: string | null;
  open_in_new_tab: number;
  pinned: number;
  sort_order: number;
  visibility: string;
  enabled: number;
  is_inbox: number;
  visit_count: number;
  last_visited_at: string | null;
  http_status: number | null;
  final_url: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

function serializeItem(row: ItemRow, tags: string[] = []) {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    url: row.url,
    lanUrl: row.lan_url,
    description: row.description,
    icon: resolveIcon(row),
    openInNewTab: row.open_in_new_tab === 1,
    pinned: row.pinned === 1,
    isInbox: row.is_inbox === 1,
    visitCount: row.visit_count ?? 0,
    lastVisitedAt: row.last_visited_at ?? null,
    httpStatus: row.http_status ?? null,
    finalUrl: row.final_url ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    sortOrder: row.sort_order,
    visibility: row.visibility,
    enabled: row.enabled === 1,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tagsForItems(itemIds: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (itemIds.length === 0) return result;
  const placeholders = itemIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id
       WHERE it.item_id IN (${placeholders}) ORDER BY t.name ASC`,
    )
    .all(...itemIds) as { item_id: string; name: string }[];
  for (const row of rows) {
    const list = result.get(row.item_id) ?? [];
    list.push(row.name);
    result.set(row.item_id, list);
  }
  return result;
}

function setItemTags(itemId: string, names: string[]): void {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const now = nowIso();

  db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
  for (const name of unique) {
    const key = name.toLowerCase();
    let row = db.prepare('SELECT id FROM tags WHERE name_key = ?').get(key) as { id: string } | undefined;
    if (!row) {
      const id = ulid();
      db.prepare('INSERT INTO tags (id, name, name_key, created_at) VALUES (?, ?, ?, ?)').run(id, name, key, now);
      row = { id };
    }
    db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)').run(itemId, row.id);
  }

  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)').run();
}

function applyIcon(icon: z.infer<typeof iconSchema> | undefined): {
  iconType: string;
  iconRef: string | null;
  iconAssetId: string | null;
} {
  if (!icon) return { iconType: 'auto', iconRef: null, iconAssetId: null };
  switch (icon.type) {
    case 'url':
    case 'iconify':
      return { iconType: icon.type, iconRef: icon.ref, iconAssetId: null };
    case 'asset':
      return { iconType: 'asset', iconRef: null, iconAssetId: icon.assetId };
    default:
      return { iconType: icon.type, iconRef: null, iconAssetId: null };
  }
}

/**
 * Normalizes a URL for duplicate comparison: strips protocol difference, `www.`,
 * trailing slash, hash fragment, and marketing query params (`utm_*`, `ref`).
 */
export function normalizeBookmarkUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const params = [...parsed.searchParams.entries()]
      .filter(([k]) => !/^utm_|^ref$|^fbclid$|^gclid$/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : '';
    return `${host}${port}${pathname}${qs}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlMeta(html: string): { title: string | null; description: string | null } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : null;

  let rawDesc: string | null = null;
  const metaTagRe = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaTagRe.exec(html))) {
    const tag = match[0];
    const name = (
      tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
    ).toLowerCase();
    if (name === 'description' || name === 'og:description' || name === 'twitter:description') {
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      if (content && content.trim()) {
        rawDesc = decodeHtmlEntities(content);
        if (name === 'description') break;
      }
    }
  }

  return {
    title: rawTitle ? rawTitle.slice(0, 80) : null,
    description: rawDesc ? rawDesc.slice(0, 300) : null,
  };
}

async function probePublicPageMeta(targetUrl: string): Promise<{
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
}> {
  let current = targetUrl;
  const deadline = Date.now() + 3500;
  for (let hop = 0; hop <= 3; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { status: null, finalUrl: null, title: null, description: null };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { status: null, finalUrl: null, title: null, description: null };
    }
    if (!isAllowedIconHost(parsed.hostname)) {
      return { status: null, finalUrl: null, title: null, description: null };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(2500, remaining));
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 (compatible; PureNavInspector/1.0)',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return { status: res.status, finalUrl: current, title: null, description: null };
        const nextUrl = new URL(loc, current).toString();
        current = nextUrl;
        continue;
      }

      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            total += value.length;
            chunks.push(value);
            if (total >= 96 * 1024) {
              await reader.cancel().catch(() => undefined);
              break;
            }
          }
        }
      }
      const html = Buffer.concat(chunks).toString('utf8');
      const meta = extractHtmlMeta(html);
      return {
        status: res.status,
        finalUrl: current !== targetUrl ? current : null,
        title: meta.title,
        description: meta.description,
      };
    } catch {
      return { status: null, finalUrl: null, title: null, description: null };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: null, finalUrl: null, title: null, description: null };
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/items', async (req) => {
    requireAdmin(req);
    const query = req.query as { groupId?: string; q?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(query.pageSize ?? '50', 10) || 50));

    const where: string[] = [];
    const params: unknown[] = [];
    if (query.groupId) {
      where.push('group_id = ?');
      params.push(query.groupId);
    }
    if (query.q) {
      where.push(
        `(title LIKE ? OR url LIKE ? OR COALESCE(description, '') LIKE ? OR EXISTS (
          SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = items.id AND t.name LIKE ?
        ))`,
      );
      const like = `%${query.q}%`;
      params.push(like, like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM items ${clause}`).get(...params) as { n: number }).n;
    const rows = db
      .prepare(
        `SELECT * FROM items ${clause} ORDER BY pinned DESC, sort_order ASC, id ASC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as ItemRow[];

    const tags = tagsForItems(rows.map((row) => row.id));
    return { items: rows.map((row) => serializeItem(row, tags.get(row.id) ?? [])), total, page, pageSize };
  });

  // Inspect a URL before saving: detects in-library duplicates/same-domain items and fetches page metadata.
  app.post('/admin/items/inspect-url', async (req) => {
    assertSameOrigin(req);
    requireAdmin(req);
    const { url } = inspectUrlSchema.parse(req.body);

    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const normalizedTarget = normalizeBookmarkUrl(url);

    const allItems = db
      .prepare('SELECT id, group_id, title, url, description FROM items')
      .all() as { id: string; group_id: string; title: string; url: string; description: string | null }[];
    const groupNames = new Map(
      (db.prepare('SELECT id, name, parent_id FROM groups').all() as { id: string; name: string; parent_id: string | null }[])
        .map((g) => [g.id, g]),
    );
    const getGroupPath = (groupId: string): string => {
      const parts: string[] = [];
      let cur = groupNames.get(groupId);
      let guard = 0;
      while (cur && guard < 10) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? groupNames.get(cur.parent_id) : undefined;
        guard += 1;
      }
      return parts.join(' / ') || '未分组';
    };

    let exactDuplicate: { id: string; title: string; url: string; groupId: string; groupPath: string } | null = null;
    let sameHostItem: { id: string; title: string; url: string; groupId: string; groupPath: string } | null = null;

    for (const row of allItems) {
      if (normalizeBookmarkUrl(row.url) === normalizedTarget) {
        exactDuplicate = {
          id: row.id,
          title: row.title,
          url: row.url,
          groupId: row.group_id,
          groupPath: getGroupPath(row.group_id),
        };
        break;
      }
      try {
        const rowHost = new URL(row.url).hostname.toLowerCase().replace(/^www\./, '');
        if (rowHost === host && !sameHostItem) {
          sameHostItem = {
            id: row.id,
            title: row.title,
            url: row.url,
            groupId: row.group_id,
            groupPath: getGroupPath(row.group_id),
          };
        }
      } catch {
        // ignore invalid stored url
      }
    }

    const probed = await probePublicPageMeta(url);
    const fallbackTitle = host
      .split('.')[0]
      ?.replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) || host;

    return {
      url,
      finalUrl: probed.finalUrl,
      httpStatus: probed.status,
      title: probed.title ?? exactDuplicate?.title ?? fallbackTitle,
      description: probed.description ?? '',
      duplicate: exactDuplicate ?? sameHostItem,
      duplicateKind: exactDuplicate ? 'exact' : sameHostItem ? 'domain' : null,
    };
  });

  // Bookmark Doctor: returns duplicate URL groups, redirect/broken status items, and single-item isolated subfolders.
  app.get('/admin/items/doctor', async (req) => {
    requireAdmin(req);
    const rows = db.prepare('SELECT * FROM items ORDER BY sort_order ASC').all() as ItemRow[];
    const groups = db
      .prepare('SELECT id, name, parent_id FROM groups ORDER BY sort_order ASC')
      .all() as { id: string; name: string; parent_id: string | null }[];

    const groupById = new Map(groups.map((g) => [g.id, g]));
    const getGroupPath = (groupId: string): string => {
      const parts: string[] = [];
      let cur = groupById.get(groupId);
      let guard = 0;
      while (cur && guard < 10) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? groupById.get(cur.parent_id) : undefined;
        guard += 1;
      }
      return parts.join(' / ') || '未分组';
    };

    const byNormalized = new Map<string, ItemRow[]>();
    for (const row of rows) {
      const key = normalizeBookmarkUrl(row.url);
      const list = byNormalized.get(key) ?? [];
      list.push(row);
      byNormalized.set(key, list);
    }

    const duplicates = [...byNormalized.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([normalizedUrl, list]) => ({
        normalizedUrl,
        items: list.map((item) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          groupId: item.group_id,
          groupPath: getGroupPath(item.group_id),
          visitCount: item.visit_count ?? 0,
        })),
      }));

    const redirects = rows
      .filter((r) => r.final_url && normalizeBookmarkUrl(r.final_url) !== normalizeBookmarkUrl(r.url))
      .map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        finalUrl: r.final_url!,
        httpStatus: r.http_status ?? 301,
        groupPath: getGroupPath(r.group_id),
      }));

    const broken = rows
      .filter((r) => r.http_status !== null && (r.http_status >= 400 || r.http_status === 0))
      .map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        httpStatus: r.http_status!,
        groupPath: getGroupPath(r.group_id),
      }));

    return {
      totalItems: rows.length,
      healthyCount: Math.max(0, rows.length - duplicates.length - redirects.length - broken.length),
      duplicates,
      redirects,
      broken,
    };
  });

  // Re-probes every stored URL and persists http_status / final_url / last_checked_at.
  app.post('/admin/items/doctor/scan', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const rows = db
      .prepare('SELECT id, url FROM items ORDER BY last_checked_at ASC NULLS FIRST, id ASC LIMIT 150')
      .all() as { id: string; url: string }[];

    const update = db.prepare(
      'UPDATE items SET http_status = ?, final_url = ?, last_checked_at = ? WHERE id = ?',
    );
    const checkedAt = nowIso();
    let cursor = 0;
    let okCount = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= rows.length) return;
        const row = rows[index]!;
        const probe = await probePublicPageMeta(row.url);
        const status = probe.status ?? 0;
        if (status >= 200 && status < 400) okCount += 1;
        update.run(status, probe.finalUrl, checkedAt, row.id);
      }
    };

    await Promise.all(Array.from({ length: Math.min(6, rows.length) }, worker));
    bumpVersion();
    audit(user.id, 'item.doctor_scan', 'item', null, { checked: rows.length }, req.ip);
    return { checked: rows.length, ok: okCount };
  });

  app.post('/admin/items', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = itemCreateSchema.parse(req.body);

    const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(body.groupId);
    if (!group) throw new ApiError(422, 'VALIDATION_FAILED', '分组不存在');

    const id = ulid();
    const now = nowIso();
    const icon = applyIcon(body.icon);

    db.transaction(() => {
      db.prepare(
        `INSERT INTO items (id, group_id, title, url, lan_url, description, icon_type, icon_ref, icon_asset_id,
                            open_in_new_tab, pinned, is_inbox, sort_order, visibility, enabled, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        body.groupId,
        body.title,
        body.url,
        body.lanUrl ?? null,
        body.description ?? null,
        icon.iconType,
        icon.iconRef,
        icon.iconAssetId,
        body.openInNewTab === false ? 0 : 1,
        body.pinned ? 1 : 0,
        body.isInbox ? 1 : 0,
        nextOrder(body.groupId),
        body.visibility ?? 'public',
        body.enabled === false ? 0 : 1,
        user.id,
        now,
        now,
      );
      if (body.tags) setItemTags(id, body.tags);
    })();

    bumpVersion();
    audit(user.id, 'item.create', 'item', id, body, req.ip);
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow;
    return reply.status(201).send(serializeItem(row, body.tags ?? []));
  });

  app.patch('/admin/items/:id', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = itemUpdateSchema.parse(req.body);

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '导航项不存在');

    const sourceGroup = existing.group_id;
    const targetGroup = body.groupId ?? sourceGroup;
    if (body.groupId && body.groupId !== sourceGroup) {
      const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(body.groupId);
      if (!group) throw new ApiError(422, 'VALIDATION_FAILED', '目标分组不存在');
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (body.title !== undefined) assign('title', body.title);
    if (body.url !== undefined) assign('url', body.url);
    if (body.lanUrl !== undefined) assign('lan_url', body.lanUrl ?? null);
    if (body.description !== undefined) assign('description', body.description ?? null);
    if (body.openInNewTab !== undefined) assign('open_in_new_tab', body.openInNewTab ? 1 : 0);
    if (body.pinned !== undefined) assign('pinned', body.pinned ? 1 : 0);
    if (body.isInbox !== undefined) assign('is_inbox', body.isInbox ? 1 : 0);
    if (body.httpStatus !== undefined) assign('http_status', body.httpStatus ?? null);
    if (body.finalUrl !== undefined) assign('final_url', body.finalUrl ?? null);
    if (body.visibility !== undefined) assign('visibility', body.visibility);
    if (body.enabled !== undefined) assign('enabled', body.enabled ? 1 : 0);
    if (body.icon !== undefined) {
      const icon = applyIcon(body.icon);
      assign('icon_type', icon.iconType);
      assign('icon_ref', icon.iconRef);
      assign('icon_asset_id', icon.iconAssetId);
    }
    if (body.groupId !== undefined) assign('group_id', body.groupId);
    assign('updated_at', nowIso());

    db.transaction(() => {
      // Cross-group move: append to the end of the target group, then reorder in place.
      if (body.groupId !== undefined && body.groupId !== sourceGroup) {
        assign('sort_order', nextOrder(body.groupId));
      }
      db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);

      if (body.tags !== undefined) setItemTags(id, body.tags);

      if (body.position !== undefined || (body.groupId !== undefined && body.groupId !== sourceGroup)) {
        const siblings = db
          .prepare('SELECT id FROM items WHERE group_id = ? ORDER BY pinned DESC, sort_order ASC, id ASC')
          .all(targetGroup)
          .map((r) => (r as { id: string }).id)
          .filter((itemId) => itemId !== id);
        const index = body.position === undefined ? siblings.length : Math.max(0, Math.min(body.position, siblings.length));
        siblings.splice(index, 0, id);
        db.prepare('UPDATE items SET sort_order = ? WHERE id = ?').run((index + 1) * 1024, id);
        rewriteItemOrderPartial(targetGroup, siblings);
      }
    })();

    bumpVersion();
    audit(user.id, 'item.update', 'item', id, body, req.ip);
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow;
    return serializeItem(row, tagsForItems([id]).get(id) ?? []);
  });

  app.delete('/admin/items/:id', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const { id } = req.params as { id: string };

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '导航项不存在');

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)').run();
    bumpVersion();
    audit(user.id, 'item.delete', 'item', id, { before: existing }, req.ip);
    return reply.status(204).send();
  });

  app.post('/admin/items/batch', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = batchSchema.parse(req.body);

    if (body.op === 'move' && !body.groupId) {
      throw new ApiError(422, 'VALIDATION_FAILED', 'move 操作需要提供 groupId');
    }

    const placeholders = body.ids.map(() => '?').join(',');
    const now = nowIso();
    let affected = 0;

    db.transaction(() => {
      if (body.op === 'delete') {
        const result = db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...body.ids);
        affected = result.changes;
        db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)').run();
      } else if (body.op === 'move') {
        const result = db
          .prepare(`UPDATE items SET group_id = ?, is_inbox = 0, sort_order = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(body.groupId, nextOrder(body.groupId), now, ...body.ids);
        affected = result.changes;
        const moved = db
          .prepare(`SELECT id FROM items WHERE group_id = ? ORDER BY sort_order ASC, id ASC`)
          .all(body.groupId)
          .map((r) => (r as { id: string }).id);
        rewriteItemOrderPartial(body.groupId!, moved);
      } else if (body.op === 'inbox' || body.op === 'uninbox') {
        const result = db
          .prepare(`UPDATE items SET is_inbox = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(body.op === 'inbox' ? 1 : 0, now, ...body.ids);
        affected = result.changes;
      } else {
        const result = db
          .prepare(`UPDATE items SET enabled = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(body.op === 'enable' ? 1 : 0, now, ...body.ids);
        affected = result.changes;
      }
    })();

    bumpVersion();
    audit(user.id, `item.batch_${body.op}`, 'item', null, body, req.ip);
    return { affected };
  });

  app.put('/admin/items/order', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = orderSchema.parse(req.body);
    rewriteItemOrder(body.groupId, body.ordered_ids);
    bumpVersion();
    audit(user.id, 'item.reorder', 'group', body.groupId, body.ordered_ids, req.ip);
    return { ok: true };
  });
}

/** Reorders without asserting set equality; used right after an insert/move already changed the set. */
function rewriteItemOrderPartial(groupId: string, orderedIds: string[]): void {
  const update = db.prepare('UPDATE items SET sort_order = ? WHERE id = ?');
  orderedIds.forEach((id, index) => update.run((index + 1) * 1024, id));
}
