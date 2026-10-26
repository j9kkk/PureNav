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
  parentId: z.string().min(1).nullish(),
  collapsed: z.boolean().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  enabled: z.boolean().optional(),
});

const groupUpdateSchema = groupCreateSchema.partial().extend({
  position: z.number().int().min(0).optional(),
});

const orderSchema = z.object({
  /** DFS 前序遍历的整棵分组树快照；同一父节点下按出现顺序排序。 */
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        parentId: z.string().nullable(),
      }),
    )
    .min(1),
});

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  collapsed: number;
  visibility: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function serializeGroup(row: GroupRow, itemCount?: number, totalCount?: number) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order,
    collapsed: row.collapsed === 1,
    visibility: row.visibility,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(itemCount === undefined ? {} : { itemCount }),
    ...(totalCount === undefined ? {} : { totalCount }),
  };
}

function nextOrder(groupId?: string): number {
  const row = groupId
    ? (db.prepare('SELECT MAX(sort_order) AS m FROM items WHERE group_id = ?').get(groupId) as { m: number | null })
    : (db.prepare('SELECT MAX(sort_order) AS m FROM groups').get() as { m: number | null });
  return (row.m ?? 0) + ORDER_STEP;
}

/** 某个父分组下（null = 根层级）的下一个排序值。 */
function nextChildOrder(parentId: string | null): number {
  const row = db
    .prepare('SELECT MAX(sort_order) AS m FROM groups WHERE parent_id IS ?')
    .get(parentId) as { m: number | null };
  return (row.m ?? 0) + ORDER_STEP;
}

/** 收集一个分组的全部子孙 id（含自身）。 */
function descendantIds(rootId: string): string[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM groups WHERE id = ?
         UNION ALL
         SELECT g.id FROM groups g JOIN tree t ON g.parent_id = t.id
       )
       SELECT id FROM tree`,
    )
    .all(rootId) as { id: string }[];
  return rows.map((row) => row.id);
}

/** 校验 parentId 存在且不构成环（parent 不能是自己的子孙）。 */
function assertValidParent(groupId: string, parentId: string | null): void {
  if (!parentId) return;
  if (parentId === groupId) throw new ApiError(422, 'VALIDATION_FAILED', '不能将分组设为自身的子分组');
  const parent = db.prepare('SELECT id FROM groups WHERE id = ?').get(parentId);
  if (!parent) throw new ApiError(422, 'VALIDATION_FAILED', '上级分组不存在');
  if (descendantIds(groupId).includes(parentId)) {
    throw new ApiError(422, 'VALIDATION_FAILED', '不能将分组移动到它自己的子分组下');
  }
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
    throw new ApiError(422, 'VALIDATION_FAILED', `${label}排序列表包含重复 id`);
  }
}

/** 应用整棵树快照：校验集合一致、无环，然后重写 parent_id 与兄弟间 sort_order。 */
function rewriteGroupTree(nodes: { id: string; parentId: string | null }[]): void {
  const known = db.prepare('SELECT id FROM groups').all().map((r) => (r as { id: string }).id);
  assertSameSet(
    nodes.map((node) => node.id),
    known,
    '分组',
  );

  const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  // 环检测：从每个节点向上走，若回到已见节点即非法；顺带校验 parentId 都存在。
  for (const node of nodes) {
    if (node.parentId === null) continue;
    if (!parentById.has(node.parentId)) {
      throw new ApiError(422, 'VALIDATION_FAILED', `上级分组不存在: ${node.parentId}`);
    }
    let cursor: string | null = node.parentId;
    const seen = new Set<string>([node.id]);
    while (cursor) {
      if (seen.has(cursor)) throw new ApiError(422, 'VALIDATION_FAILED', '分组层级出现循环');
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const now = nowIso();
  const update = db.prepare('UPDATE groups SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?');
  const siblingCounter = new Map<string, number>(); // parentKey -> 已分配个数
  const tx = db.transaction(() => {
    for (const node of nodes) {
      const key = node.parentId ?? '__root__';
      const index = siblingCounter.get(key) ?? 0;
      siblingCounter.set(key, index + 1);
      update.run(node.parentId, (index + 1) * ORDER_STEP, now, node.id);
    }
  });
  tx();
}

export function rewriteItemOrder(groupId: string, orderedIds: string[]): void {
  const known = db
    .prepare('SELECT id FROM items WHERE group_id = ?')
    .all(groupId)
    .map((r) => (r as { id: string }).id);
  assertSameSet(orderedIds, known, '导航项');

  const update = db.prepare('UPDATE items SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = nowIso();
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => update.run((index + 1) * ORDER_STEP, now, id));
  });
  tx(orderedIds);
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

    // 聚合计数：含全部子孙分组的站点数，供树形 UI 的文件夹徽标展示。
    const directById = new Map(rows.map((row) => [row.id, row.item_count]));
    const totalById = new Map<string, number>();
    const totalOf = (id: string): number => {
      const cached = totalById.get(id);
      if (cached !== undefined) return cached;
      let sum = directById.get(id) ?? 0;
      for (const row of rows) {
        if (row.parent_id === id) sum += totalOf(row.id);
      }
      totalById.set(id, sum);
      return sum;
    };

    return { items: rows.map((row) => serializeGroup(row, row.item_count, totalOf(row.id))) };
  });

  app.post('/admin/groups', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = groupCreateSchema.parse(req.body);
    const id = ulid();
    const now = nowIso();

    if (body.parentId) {
      assertValidParent(id, body.parentId);
    }

    db.prepare(
      `INSERT INTO groups (id, name, description, icon, parent_id, sort_order, collapsed, visibility, enabled, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.name,
      body.description ?? null,
      body.icon ?? null,
      body.parentId ?? null,
      body.parentId ? nextChildOrder(body.parentId) : nextOrder(),
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
    return reply.status(201).send(serializeGroup(row, 0, 0));
  });

  app.patch('/admin/groups/:id', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = groupUpdateSchema.parse(req.body);

    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '分组不存在');

    if (body.parentId !== undefined) {
      assertValidParent(id, body.parentId || null);
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (body.name !== undefined) assign('name', body.name);
    if (body.description !== undefined) assign('description', body.description ?? null);
    if (body.icon !== undefined) assign('icon', body.icon ?? null);
    if (body.parentId !== undefined) {
      assign('parent_id', body.parentId || null);
      if ((body.parentId || null) !== existing.parent_id) {
        assign('sort_order', body.parentId ? nextChildOrder(body.parentId) : nextOrder());
      }
    }
    if (body.collapsed !== undefined) assign('collapsed', body.collapsed ? 1 : 0);
    if (body.visibility !== undefined) assign('visibility', body.visibility);
    if (body.enabled !== undefined) assign('enabled', body.enabled ? 1 : 0);
    assign('updated_at', nowIso());

    db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);

    if (body.position !== undefined) {
      const current = db.prepare('SELECT parent_id FROM groups WHERE id = ?').get(id) as {
        parent_id: string | null;
      };
      const siblings = db
        .prepare('SELECT id FROM groups WHERE parent_id IS ? ORDER BY sort_order ASC, id ASC')
        .all(current.parent_id)
        .map((r) => (r as { id: string }).id)
        .filter((gid) => gid !== id);
      const index = Math.max(0, Math.min(body.position, siblings.length));
      siblings.splice(index, 0, id);
      const update = db.prepare('UPDATE groups SET sort_order = ?, updated_at = ? WHERE id = ?');
      const now = nowIso();
      db.transaction((ids: string[]) => {
        ids.forEach((gid, idx) => update.run((idx + 1) * ORDER_STEP, now, gid));
      })(siblings);
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

    // 计数与删除都覆盖整棵子树：删除一个文件夹会连带其子文件夹。
    const scopeIds = descendantIds(id);
    const placeholders = scopeIds.map(() => '?').join(', ');
    const count = (
      db.prepare(`SELECT COUNT(*) AS n FROM items WHERE group_id IN (${placeholders})`).get(...scopeIds) as {
        n: number;
      }
    ).n;
    if (count > 0 && !cascade) {
      throw new ApiError(409, 'CONFLICT', `分组及其子分组下共有 ${count} 个导航项，需传入 cascade=true 才能级联删除`, {
        itemCount: count,
      });
    }

    db.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).run(...scopeIds);
    bumpVersion();
    audit(user.id, 'group.delete', 'group', id, { before: existing, cascade, scopeSize: scopeIds.length }, req.ip);
    return reply.status(204).send();
  });

  app.put('/admin/groups/order', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = orderSchema.parse(req.body);
    rewriteGroupTree(body.nodes);
    bumpVersion();
    audit(user.id, 'group.reorder', 'group', null, body.nodes, req.ip);
    return { ok: true };
  });
}
