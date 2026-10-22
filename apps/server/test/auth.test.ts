import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, teardown, setupAdmin, anonymous, authed, extractCookie, createGroup, createItem } from './helpers.js';

// config.ts and db/index.ts are module singletons: the database is opened at import
// and cannot be reopened. So one app is shared for the whole file, and state is
// derived per test rather than reset. Each file runs in its own process.
const ctx = await createTestApp();
after(async () => {
  await teardown(ctx);
});

// The first test to run creates the admin; every test reads the cookie from here.
let adminCookie = '';
async function admin(): Promise<string> {
  if (!adminCookie) adminCookie = await setupAdmin(ctx);
  return adminCookie;
}

test('auth: admin routes reject anonymous requests', async () => {
  await admin();
  const guarded: Array<[string, string]> = [
    ['GET', '/api/v1/admin/groups'],
    ['GET', '/api/v1/admin/items'],
    ['POST', '/api/v1/admin/groups'],
    ['PUT', '/api/v1/admin/groups/order'],
    ['GET', '/api/v1/admin/settings'],
    ['GET', '/api/v1/admin/export'],
    ['GET', '/api/v1/admin/audit-logs'],
    ['GET', '/api/v1/system/info'],
  ];

  for (const [method, url] of guarded) {
    const response = await ctx.app.inject({
      method: method as 'GET',
      url,
      headers: anonymous(ctx),
      payload: method === 'GET' ? undefined : {},
    });
    assert.equal(response.statusCode, 401, `${method} ${url} should be 401, got ${response.statusCode}`);
  }
});

test('auth: setup only works once', async () => {
  await admin();
  const again = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/setup',
    headers: anonymous(ctx),
    payload: { username: 'second', password: 'anotherpassword' },
  });
  assert.equal(again.statusCode, 409);
});

test('auth: wrong password does not create a session', async () => {
  await admin();
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: anonymous(ctx),
    payload: { username: 'admin', password: 'wrong-password' },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['set-cookie'], undefined);
});

test('auth: login succeeds and the session is usable', async () => {
  await admin();
  const login = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: anonymous(ctx),
    payload: { username: 'admin', password: 'supersecret123' },
  });
  assert.equal(login.statusCode, 200);

  const cookie = extractCookie(login);
  const state = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/state', headers: authed(cookie, ctx) });
  assert.equal(state.json<{ authenticated: boolean }>().authenticated, true);
});

test('csrf: cross-origin writes are rejected', async () => {
  const cookie = await admin();
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/groups',
    headers: { cookie, origin: 'https://evil.example', host: 'localhost:3000' },
    payload: { name: 'sneaky' },
  });
  assert.equal(response.statusCode, 403);
});

test('session: logout invalidates the cookie', async () => {
  await admin();
  // A dedicated session, so logging out does not disturb the shared admin cookie.
  const login = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: anonymous(ctx),
    payload: { username: 'admin', password: 'supersecret123' },
  });
  const cookie = extractCookie(login);

  const logout = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: authed(cookie, ctx) });
  assert.equal(logout.statusCode, 204);

  const after = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/groups', headers: authed(cookie, ctx) });
  assert.equal(after.statusCode, 401);
});

test('lan: lan_url never appears in the anonymous payload', async () => {
  const cookie = await admin();
  const groupId = await createGroup(ctx, cookie, 'Tools');
  await createItem(ctx, cookie, groupId, {
    title: 'Grafana',
    url: 'https://grafana.example.com',
    lanUrl: 'http://192.168.1.10:3000',
  });

  const anon = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  assert.equal(anon.statusCode, 200);
  assert.ok(!anon.body.includes('192.168'), 'anonymous payload leaked the LAN address');
  assert.ok(!anon.body.includes('lanUrl'), 'anonymous payload contains a lanUrl field');

  const denied = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config/admin' });
  assert.equal(denied.statusCode, 401);

  const allowed = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/public/config/admin',
    headers: authed(cookie, ctx),
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['cache-control'], 'no-store');

  const body = allowed.json<{ items: Record<string, { lanUrl: string | null }> }>();
  assert.deepEqual(
    Object.values(body.items).map((entry) => entry.lanUrl),
    ['http://192.168.1.10:3000'],
  );
});

test('lan: private and disabled items stay out of the public payload', async () => {
  const cookie = await admin();
  const groupId = await createGroup(ctx, cookie, 'Mixed');
  await createItem(ctx, cookie, groupId, { title: 'Visible' });
  await createItem(ctx, cookie, groupId, { title: 'Hidden', visibility: 'private' });
  await createItem(ctx, cookie, groupId, { title: 'Off', enabled: false });

  const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  const groups = response.json<{ groups: { name: string; items: { title: string }[] }[] }>().groups;
  const mixed = groups.find((group) => group.name === 'Mixed');
  assert.deepEqual(mixed!.items.map((item) => item.title), ['Visible']);
});

test('security: responses carry the expected hardening headers', async () => {
  const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');

  const csp = String(response.headers['content-security-policy']);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.ok(!/connect-src[^;]*\bhttp:\s/.test(csp), `connect-src should not allow plain http by default: ${csp}`);
});
