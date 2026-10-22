import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, teardown, setupAdmin, authed, createGroup, createItem, anonymous } from './helpers.js';

const ctx = await createTestApp();
after(async () => {
  await teardown(ctx);
});

const cookie = await setupAdmin(ctx);

interface ExportPayload {
  format: string;
  groups: { id: string; name: string }[];
  items: { id: string; group_id: string; title: string; sort_order: number }[];
  tags: { id: string; name: string }[];
  itemTags: { item_id: string; tag_id: string }[];
}

test('export: requires a session', async () => {
  const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/export', headers: anonymous(ctx) });
  assert.equal(response.statusCode, 401);
});

test('export: returns a complete, parseable payload', async () => {
  const group = await createGroup(ctx, cookie, 'ExportSource');
  await createItem(ctx, cookie, group, { title: 'Tagged', tags: ['alpha', 'beta'] });

  const response = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/export?format=json',
    headers: authed(cookie, ctx),
  });
  assert.equal(response.statusCode, 200);

  const payload = response.json<ExportPayload>();
  assert.equal(payload.format, 'purenav/v1');
  assert.ok(payload.groups.some((entry) => entry.name === 'ExportSource'));
  assert.ok(payload.tags.some((tag) => tag.name === 'alpha'));
  assert.ok(payload.itemTags.length > 0, 'export must include tag links');
});

test('export: bookmarks HTML escapes the title and URL', async () => {
  const group = await createGroup(ctx, cookie, 'Escapes');
  await createItem(ctx, cookie, group, {
    title: '<script>alert(1)</script>',
    url: 'https://example.com/a?b=1&c=2',
  });

  const response = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/export?format=bookmarks.html',
    headers: authed(cookie, ctx),
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type']), /text\/html/);
  assert.ok(!response.body.includes('<script>alert(1)</script>'), 'title must be escaped');
  assert.ok(response.body.includes('&amp;'), 'query separator must be escaped');
});

test('import: round-trips tags that the export carried', async () => {
  const group = await createGroup(ctx, cookie, 'RoundTrip');
  await createItem(ctx, cookie, group, { title: 'TagKeep', tags: ['keepme'] });

  const exported = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/admin/export?format=json',
    headers: authed(cookie, ctx),
  });
  const payload = exported.json<ExportPayload>();

  const marker = `Imported-${Date.now()}`;
  const rewritten: ExportPayload = {
    ...payload,
    groups: payload.groups.map((entry) => (entry.name === 'RoundTrip' ? { ...entry, name: marker } : entry)),
  };

  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/import?mode=merge',
    headers: authed(cookie, ctx),
    payload: rewritten,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.ok(response.json<{ created: number }>().created > 0);

  // The imported items must keep their tags; losing them was the original bug.
  const publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  const groups = publicConfig.json<{ groups: { name: string; items: { title: string; tags: string[] }[] }[] }>().groups;
  const imported = groups.find((entry) => entry.name === marker);
  assert.ok(imported, 'imported group should be published');
  const tagged = imported!.items.find((item) => item.title === 'TagKeep');
  assert.deepEqual(tagged?.tags, ['keepme']);
});

test('import: rejects an unknown format', async () => {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/import?mode=merge',
    headers: authed(cookie, ctx),
    payload: { format: 'something-else', groups: [], items: [] },
  });
  assert.equal(response.statusCode, 422);
});

test('import: replace clears existing data first', async () => {
  const before = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const beforeCount = before.json<{ items: unknown[] }>().items.length;
  assert.ok(beforeCount > 1, 'precondition: several groups exist');

  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/import?mode=replace',
    headers: authed(cookie, ctx),
    payload: {
      format: 'purenav/v1',
      groups: [{ id: 'g1', name: 'OnlyOne' }],
      items: [{ id: 'i1', group_id: 'g1', title: 'Solo', url: 'https://example.com', sort_order: 1024 }],
      tags: [],
      itemTags: [],
    },
  });
  assert.equal(response.statusCode, 200, response.body);

  const after = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  const names = after.json<{ items: { name: string }[] }>().items.map((group) => group.name);
  assert.deepEqual(names, ['OnlyOne']);
});
