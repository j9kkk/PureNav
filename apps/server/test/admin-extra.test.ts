import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, teardown, setupAdmin, authed, anonymous, createGroup, createItem } from './helpers.js';

const ctx = await createTestApp();
after(async () => {
  await teardown(ctx);
});

const cookie = await setupAdmin(ctx);

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

test('batch: enable and disable a set of items', async () => {
  const group = await createGroup(ctx, cookie, unique('BatchToggle'));
  const one = (await createItem(ctx, cookie, group, { title: 'One' })).id;
  const two = (await createItem(ctx, cookie, group, { title: 'Two' })).id;

  const disable = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: authed(cookie, ctx),
    payload: { op: 'disable', ids: [one, two] },
  });
  assert.equal(disable.statusCode, 200, disable.body);
  assert.equal(disable.json<{ affected: number }>().affected, 2);

  const listed = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${group}`,
    headers: authed(cookie, ctx),
  });
  assert.ok(listed.json<{ items: { enabled: boolean }[] }>().items.every((item) => item.enabled === false));

  const enable = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: authed(cookie, ctx),
    payload: { op: 'enable', ids: [one, two] },
  });
  assert.equal(enable.statusCode, 200);
});

test('batch: move puts items in the target group', async () => {
  const source = await createGroup(ctx, cookie, unique('Src'));
  const target = await createGroup(ctx, cookie, unique('Dst'));
  const one = (await createItem(ctx, cookie, source, { title: 'M1' })).id;
  const two = (await createItem(ctx, cookie, source, { title: 'M2' })).id;

  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: authed(cookie, ctx),
    payload: { op: 'move', ids: [one, two], groupId: target },
  });
  assert.equal(response.statusCode, 200, response.body);

  const targetItems = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${target}`,
    headers: authed(cookie, ctx),
  });
  assert.equal(targetItems.json<{ items: unknown[] }>().items.length, 2);

  const sourceItems = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${source}`,
    headers: authed(cookie, ctx),
  });
  assert.equal(sourceItems.json<{ items: unknown[] }>().items.length, 0);
});

test('batch: move without a target group is rejected', async () => {
  const group = await createGroup(ctx, cookie, unique('NoTarget'));
  const id = (await createItem(ctx, cookie, group, { title: 'X' })).id;

  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: authed(cookie, ctx),
    payload: { op: 'move', ids: [id] },
  });
  assert.equal(response.statusCode, 422);
});

test('batch: delete removes items and prunes unused tags', async () => {
  const group = await createGroup(ctx, cookie, unique('BatchDelete'));
  const id = (await createItem(ctx, cookie, group, { title: 'Doomed', tags: ['orphan-tag'] })).id;

  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: authed(cookie, ctx),
    payload: { op: 'delete', ids: [id] },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json<{ affected: number }>().affected, 1);

  const listed = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/admin/items?groupId=${group}`,
    headers: authed(cookie, ctx),
  });
  assert.equal(listed.json<{ items: unknown[] }>().items.length, 0);

  // A tag with no remaining links should not linger in the public payload.
  const publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  const tagNames = publicConfig.json<{ tags: { name: string }[] }>().tags.map((tag) => tag.name);
  assert.ok(!tagNames.includes('orphan-tag'), 'unused tag should be pruned');
});

test('batch: requires a session', async () => {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: anonymous(ctx),
    payload: { op: 'disable', ids: ['x'] },
  });
  assert.equal(response.statusCode, 401);
});

test('batch: rejects an empty id list', async () => {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items/batch',
    headers: authed(cookie, ctx),
    payload: { op: 'disable', ids: [] },
  });
  assert.equal(response.statusCode, 422);
});

test('icons/search: requires a session', async () => {
  const response = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/icons/search?q=github',
    headers: anonymous(ctx),
  });
  assert.equal(response.statusCode, 401);
});

test('icons/search: short queries return an empty list without hitting the network', async () => {
  const response = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/icons/search?q=a',
    headers: authed(cookie, ctx),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json<{ items: unknown[] }>().items, []);
});

test('icons/search: an unreachable upstream degrades to an empty list', async () => {
  // The suite runs offline or with a blocked network; either way this must not 500.
  const response = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/icons/search?q=github',
    headers: authed(cookie, ctx),
  });
  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.json<{ items: unknown[] }>().items));
});

test('password: change requires the current password', async () => {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/password',
    headers: authed(cookie, ctx),
    payload: { currentPassword: 'wrong', newPassword: 'brandnewpassword' },
  });
  assert.equal(response.statusCode, 401);
});

// Runs last on purpose: it changes the admin password, so any test after it that
// relies on the original credentials would break.
test('password: change revokes other sessions but keeps the current one', async () => {
  // Create a second session to prove it gets revoked.
  const second = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: anonymous(ctx),
    payload: { username: 'admin', password: 'supersecret123' },
  });
  const setCookie = second.headers['set-cookie'];
  const secondCookie = (Array.isArray(setCookie) ? setCookie[0]! : String(setCookie)).split(';')[0]!;

  const changed = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/password',
    headers: authed(cookie, ctx),
    payload: { currentPassword: 'supersecret123', newPassword: 'supersecret456' },
  });
  assert.equal(changed.statusCode, 204, changed.body);

  // The other session is gone.
  const revoked = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/groups',
    headers: authed(secondCookie, ctx),
  });
  assert.equal(revoked.statusCode, 401);

  // The session that performed the change still works.
  const stillValid = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/groups',
    headers: authed(cookie, ctx),
  });
  assert.equal(stillValid.statusCode, 200);

  // The new password logs in and the old one does not.
  const oldLogin = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: anonymous(ctx),
    payload: { username: 'admin', password: 'supersecret123' },
  });
  assert.equal(oldLogin.statusCode, 401);

  const newLogin = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: anonymous(ctx),
    payload: { username: 'admin', password: 'supersecret456' },
  });
  assert.equal(newLogin.statusCode, 200);
});
