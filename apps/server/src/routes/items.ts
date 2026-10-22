import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { ulid } from '../lib/ids.js';
import { ApiError, assertSameOrigin, requireAdmin } from '../lib/http.js';
import { audit, bumpVersion } from '../lib/settings.js';
import { nextOrder, rewriteItemOrder } from './groups.js';
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
  visibility: z.enum(['public', 'private']).optional(),
  enabled: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});

const itemUpdateSchema = itemCreateSchema.partial().extend({
  groupId: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
});

const orderSchema = z.object({
  groupId: z.string().min(1),
  ordered_ids: z.array(z.string().min(1)).min(1),
});

const batchSchema = z.object({
  op: z.enum(['enable', 'disable', 'delete', 'move']),
  ids: z.array(z.string().min(1)).min(1).max(500),
  groupId: z.string().min(1).optional(),
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
      where.push('(title LIKE ? OR url LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like);
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
                            open_in_new_tab, pinned, sort_order, visibility, enabled, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          .prepare(`UPDATE items SET group_id = ?, sort_order = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(body.groupId, nextOrder(body.groupId), now, ...body.ids);
        affected = result.changes;
        const moved = db
          .prepare(`SELECT id FROM items WHERE group_id = ? ORDER BY sort_order ASC, id ASC`)
          .all(body.groupId)
          .map((r) => (r as { id: string }).id);
        rewriteItemOrderPartial(body.groupId!, moved);
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
