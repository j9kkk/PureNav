import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, teardown, setupAdmin, authed, createGroup, createItem } from './helpers.js';

// One shared app per file (the database is a module singleton); each test uses its
// own group so assertions never depend on execution order.
const ctx = await createTestApp();
after(async () => {
  await teardown(ctx);
});

const cookie = await setupAdmin(ctx);

let sequence = 0;
function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

test('sort: group reorder persists and is idempotent', async () => {
  const a = await createGroup(ctx, cookie, uniqueName('A'));
  const b = await createGroup(ctx, cookie, uniqueName('B'));
  const c = await createGroup(ctx, cookie, uniqueName('C'));

  const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const others = list
    .json<{ items: { id: string }[] }>()
    .items.map((group) => group.id)
    .filter((id) => ![a, b, c].includes(id));

  // 树快照：others 保持原样，三个测试分组按 c, a, b 顺序放在根层级。
  const buildPayload = () => ({
    nodes: [
      ...others.map((id) => ({ id, parentId: null })),
      { id: c, parentId: null },
      { id: a, parentId: null },
      { id: b, parentId: null },
    ],
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/groups/order',
      headers: authed(cookie, ctx),
      payload: buildPayload(),
    });
    assert.equal(response.statusCode, 200, `attempt ${attempt}: ${response.body}`);
  }

  const all = list.json<{ items: { id: string; name: string; sortOrder: number; parentId: string | null }[] }>().items;
  const fresh = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const refreshed = fresh.json<{ items: { id: string; sortOrder: number }[] }>().items;
  // Other tests may have created groups; assert only on relative order of these three.
  const mine = [c, a, b].map((id) => refreshed.find((group) => group.id === id)!);
  const positions = refreshed.map((group) => group.id);
  assert.ok(
    positions.indexOf(mine[0]!.id) < positions.indexOf(mine[1]!.id) &&
      positions.indexOf(mine[1]!.id) < positions.indexOf(mine[2]!.id),
    'requested order was not applied',
  );

  // Rewriting the same order must be stable, not accumulate drift.
  const [first, second, third] = mine.map((group) => group.sortOrder);
  assert.ok(first! < second! && second! < third!, `sort orders not monotonic: ${first}, ${second}, ${third}`);
  void all;
});

test('sort: group reorder supports nesting and rejects cycles', async () => {
  const parent = await createGroup(ctx, cookie, uniqueName('TreeParent'));
  const child = await createGroup(ctx, cookie, uniqueName('TreeChild'));
  const grandchild = await createGroup(ctx, cookie, uniqueName('TreeGrandchild'));

  const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const others = list
    .json<{ items: { id: string }[] }>()
    .items.map((group) => group.id)
    .filter((id) => ![parent, child, grandchild].includes(id));

  // 父 → 子 → 孙 依次嵌套
  const nest = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/groups/order',
    headers: authed(cookie, ctx),
    payload: {
      nodes: [
        ...others.map((id) => ({ id, parentId: null })),
        { id: parent, parentId: null },
        { id: child, parentId: parent },
        { id: grandchild, parentId: child },
      ],
    },
  });
  assert.equal(nest.statusCode, 200, nest.body);

  const detail = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const byId = new Map(detail.json<{ items: { id: string; parentId: string | null }[] }>().items.map((g) => [g.id, g]));
  assert.equal(byId.get(child)!.parentId, parent);
  assert.equal(byId.get(grandchild)!.parentId, child);

  // 环：把 parent 挂到 grandchild 下必须被拒绝
  const cycle = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/groups/order',
    headers: authed(cookie, ctx),
    payload: {
      nodes: [
        ...others.map((id) => ({ id, parentId: null })),
        { id: parent, parentId: grandchild },
        { id: child, parentId: parent },
        { id: grandchild, parentId: child },
      ],
    },
  });
  assert.equal(cycle.statusCode, 422);
  assert.equal(cycle.json<{ error: { code: string } }>().error.code, 'VALIDATION_FAILED');
});

test('sort: reorder rejects a partial list instead of silently dropping rows', async () => {
  const before = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const total = before.json<{ items: { id: string }[] }>().items.length;
  const one = before.json<{ items: { id: string }[] }>().items[0]!.id;

  const response = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/groups/order',
    headers: authed(cookie, ctx),
    payload: { nodes: [{ id: one, parentId: null }] },
  });
  assert.equal(response.statusCode, 422, `expected 422 for 1 of ${total} ids, got ${response.statusCode}`);
  assert.equal(response.json<{ error: { code: string } }>().error.code, 'VALIDATION_FAILED');
});

test('sort: reorder rejects unknown and duplicate ids', async () => {
  const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const ids = list.json<{ items: { id: string }[] }>().items.map((group) => group.id);
  const first = ids[0]!;

  const unknown = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/groups/order',
    headers: authed(cookie, ctx),
    payload: { nodes: [...ids.slice(1), 'does-not-exist'].map((id) => ({ id, parentId: null })) },
  });
  assert.equal(unknown.statusCode, 422);

  const duplicate = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/groups/order',
    headers: authed(cookie, ctx),
    payload: {
      nodes: [first, ...ids.slice(1, -1), first].map((id) => ({ id, parentId: null })),
    },
  });
  assert.equal(duplicate.statusCode, 422);
});

test('sort: item reorder is scoped to its group', async () => {
  const group = await createGroup(ctx, cookie, uniqueName('Reorder'));
  const one = (await createItem(ctx, cookie, group, { title: 'One' })).id;
  const two = (await createItem(ctx, cookie, group, { title: 'Two' })).id;
  const three = (await createItem(ctx, cookie, group, { title: 'Three' })).id;

  const response = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/items/order',
    headers: authed(cookie, ctx),
    payload: { groupId: group, ordered_ids: [three, one, two] },
  });
  assert.equal(response.statusCode, 200, response.body);

  const items = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${group}`,
    headers: authed(cookie, ctx),
  });
  assert.deepEqual(
    items.json<{ items: { title: string }[] }>().items.map((item) => item.title),
    ['Three', 'One', 'Two'],
  );
});

test('sort: item reorder from another group is rejected', async () => {
  const groupA = await createGroup(ctx, cookie, uniqueName('A'));
  const groupB = await createGroup(ctx, cookie, uniqueName('B'));
  const a1 = (await createItem(ctx, cookie, groupA, { title: 'A1' })).id;
  const b1 = (await createItem(ctx, cookie, groupB, { title: 'B1' })).id;

  const response = await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/items/order',
    headers: authed(cookie, ctx),
    payload: { groupId: groupA, ordered_ids: [b1, a1] },
  });
  assert.equal(response.statusCode, 422);
});

test('sort: public config reflects the same order as admin', async () => {
  const name = uniqueName('Visible');
  const group = await createGroup(ctx, cookie, name);
  const one = (await createItem(ctx, cookie, group, { title: 'One' })).id;
  const two = (await createItem(ctx, cookie, group, { title: 'Two' })).id;

  await ctx.app.inject({
    method: 'PUT',
    url: '/api/v1/admin/items/order',
    headers: authed(cookie, ctx),
    payload: { groupId: group, ordered_ids: [two, one] },
  });

  const publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  const groups = publicConfig.json<{ groups: { name: string; items: { title: string }[] }[] }>().groups;
  const published = groups.find((entry) => entry.name === name);
  assert.deepEqual(published!.items.map((item) => item.title), ['Two', 'One']);
});

test('sort: cross-group move appends to the end of the target group', async () => {
  const groupA = await createGroup(ctx, cookie, uniqueName('Src'));
  const groupB = await createGroup(ctx, cookie, uniqueName('Dst'));
  const mover = (await createItem(ctx, cookie, groupA, { title: 'Mover' })).id;
  await createItem(ctx, cookie, groupB, { title: 'First' });

  const move = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/admin/items/${mover}`,
    headers: authed(cookie, ctx),
    payload: { groupId: groupB },
  });
  assert.equal(move.statusCode, 200, move.body);

  const target = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${groupB}`,
    headers: authed(cookie, ctx),
  });
  assert.deepEqual(
    target.json<{ items: { title: string }[] }>().items.map((item) => item.title),
    ['First', 'Mover'],
  );

  const source = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${groupA}`,
    headers: authed(cookie, ctx),
  });
  assert.equal(source.json<{ items: unknown[] }>().items.length, 0);
});
