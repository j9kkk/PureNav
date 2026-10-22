import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { ulid } from '../lib/ids.js';
import { ApiError, assertSameOrigin, requireAdmin } from '../lib/http.js';
import { audit, bumpVersion } from '../lib/settings.js';

const ORDER_STEP = 1024;

const groupCreateSchema = z.object({
  name: z.string().trim().min(1, '分组名不能为空').max(40),
  description: z.string().trim().max(200).nullish(),
  icon: z.string().trim().max(200).nullish(),
  collapsed: z.boolean().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  enabled: z.boolean().optional(),
});

const groupUpdateSchema = groupCreateSchema.partial().extend({
  position: z.number().int().min(0).optional(),
});

const orderSchema = z.object({
  ordered_ids: z.array(z.string().min(1)).min(1),
});

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  collapsed: number;
  visibility: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function serializeGroup(row: GroupRow, itemCount?: number) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    collapsed: row.collapsed === 1,
    visibility: row.visibility,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(itemCount === undefined ? {} : { itemCount }),
  };
}

function nextOrder(groupId?: string): number {
  const row = groupId
    ? (db.prepare('SELECT MAX(sort_order) AS m FROM items WHERE group_id = ?').get(groupId) as { m: number | null })
    : (db.prepare('SELECT MAX(sort_order) AS m FROM groups').get() as { m: number | null });
  return (row.m ?? 0) + ORDER_STEP;
}

/** Rewrites a scope's order in one transaction; the client sends the whole list, never a single index. */
function rewriteGroupOrder(orderedIds: string[]): void {
  const known = db.prepare('SELECT id FROM groups').all().map((r) => (r as { id: string }).id);
  assertSameSet(orderedIds, known, '分组');

  const update = db.prepare('UPDATE groups SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = nowIso();
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => update.run((index + 1) * ORDER_STEP, now, id));
  });
  tx(orderedIds);
}

export function rewriteItemOrder(groupId: string, orderedIds: string[]): void {
  const known = db.prepare('SELECT id FROM items WHERE group_id = ?').all(groupId).map((r) => (r as { id: string }).id);
  assertSameSet(orderedIds, known, '导航项');

  const update = db.prepare('UPDATE items SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = nowIso();
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => update.run((index + 1) * ORDER_STEP, now, id));
  });
  tx(orderedIds);
}

function assertSameSet(received: string[], known: string[], label: string): void {
  if (received.length !== known.length) {
    throw new ApiError(422, 'VALIDATION_FAILED', `${label}排序列表与现有数据不一致`);
  }
  const knownSet = new Set(known);
  for (const id of received) {
    if (!knownSet.has(id)) {
      throw new ApiError(422, 'VALIDATION_FAILED', `${label}排序列表包含未知 id: ${id}`);
    }
  }
  if (new Set(received).size !== received.length) {
    throw new ApiError(422, 'VALIDATION_FAILED', `${label}排序列表存在重复 id`);
  }
}

export { nextOrder, ORDER_STEP };

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/groups', async (req) => {
    requireAdmin(req);
    const rows = db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM items i WHERE i.group_id = g.id) AS item_count
         FROM groups g ORDER BY g.sort_order ASC, g.id ASC`,
      )
      .all() as (GroupRow & { item_count: number })[];

    return { items: rows.map((row) => serializeGroup(row, row.item_count)) };
  });

  app.post('/admin/groups', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = groupCreateSchema.parse(req.body);
    const id = ulid();
    const now = nowIso();

    db.prepare(
      `INSERT INTO groups (id, name, description, icon, sort_order, collapsed, visibility, enabled, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.name,
      body.description ?? null,
      body.icon ?? null,
      nextOrder(),
      body.collapsed ? 1 : 0,
      body.visibility ?? 'public',
      body.enabled === false ? 0 : 1,
      user.id,
      now,
      now,
    );

    bumpVersion();
    audit(user.id, 'group.create', 'group', id, body, req.ip);
    const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow;
    return reply.status(201).send(serializeGroup(row, 0));
  });

  app.patch('/admin/groups/:id', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = groupUpdateSchema.parse(req.body);

    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '分组不存在');

    const sets: string[] = [];
    const values: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (body.name !== undefined) assign('name', body.name);
    if (body.description !== undefined) assign('description', body.description ?? null);
    if (body.icon !== undefined) assign('icon', body.icon ?? null);
    if (body.collapsed !== undefined) assign('collapsed', body.collapsed ? 1 : 0);
    if (body.visibility !== undefined) assign('visibility', body.visibility);
    if (body.enabled !== undefined) assign('enabled', body.enabled ? 1 : 0);
    assign('updated_at', nowIso());

    db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);

    if (body.position !== undefined) {
      const siblings = db
        .prepare('SELECT id FROM groups ORDER BY sort_order ASC, id ASC')
        .all()
        .map((r) => (r as { id: string }).id)
        .filter((gid) => gid !== id);
      const index = Math.max(0, Math.min(body.position, siblings.length));
      siblings.splice(index, 0, id);
      rewriteGroupOrder(siblings);
    }

    bumpVersion();
    audit(user.id, 'group.update', 'group', id, body, req.ip);
    const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow;
    return serializeGroup(row);
  });

  app.delete('/admin/groups/:id', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const { id } = req.params as { id: string };
    const cascade = (req.query as { cascade?: string }).cascade === 'true';

    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '分组不存在');

    const count = (db.prepare('SELECT COUNT(*) AS n FROM items WHERE group_id = ?').get(id) as { n: number }).n;
    if (count > 0 && !cascade) {
      throw new ApiError(409, 'CONFLICT', `分组下仍有 ${count} 个导航项，需传入 cascade=true 才能级联删除`, { itemCount: count });
    }

    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    bumpVersion();
    audit(user.id, 'group.delete', 'group', id, { before: existing, cascade }, req.ip);
    return reply.status(204).send();
  });

  app.put('/admin/groups/order', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = orderSchema.parse(req.body);
    rewriteGroupOrder(body.ordered_ids);
    bumpVersion();
    audit(user.id, 'group.reorder', 'group', null, body.ordered_ids, req.ip);
    return { ok: true };
  });
}
