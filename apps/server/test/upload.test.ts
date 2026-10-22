import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestApp,
  teardown,
  setupAdmin,
  authed,
  anonymous,
  createGroup,
  createItem,
  multipartBody,
  PNG_1X1,
  TEST_HOST,
} from './helpers.js';

const ctx = await createTestApp();
after(async () => {
  await teardown(ctx);
});

const cookie = await setupAdmin(ctx);
const BOUNDARY = '----purenavtest';

async function upload(
  headers: Record<string, string>,
  filename: string,
  contentType: string,
  bytes: Buffer,
) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/icons/upload',
    headers: { host: TEST_HOST, ...headers, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: multipartBody(BOUNDARY, filename, contentType, bytes),
  });
}

test('upload: accepts a valid PNG and serves it back', async () => {
  const response = await upload(authed(cookie, ctx), 'icon.png', 'image/png', PNG_1X1);
  assert.equal(response.statusCode, 201, response.body);

  const body = response.json<{ assetId: string; url: string }>();
  assert.ok(body.assetId);
  assert.match(body.url, /^\/uploads\/.+\.png$/);

  const fetched = await ctx.app.inject({ method: 'GET', url: body.url });
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.headers['content-type'], 'image/png');
  assert.equal(fetched.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(fetched.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(fetched.rawPayload, PNG_1X1);
});

test('upload: rejects SVG outright', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');
  const response = await upload(authed(cookie, ctx), 'evil.svg', 'image/svg+xml', svg);
  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: { message: string } }>().error.message, /png\/jpeg\/webp/);
});

test('upload: rejects a file whose bytes disagree with its declared type', async () => {
  const response = await upload(authed(cookie, ctx), 'fake.png', 'image/png', Buffer.from('not an image'));
  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: { message: string } }>().error.message, /内容与声明的类型不符/);
});

test('upload: rejects files over the size limit', async () => {
  const oversized = Buffer.concat([PNG_1X1, Buffer.alloc(600 * 1024)]);
  const response = await upload(authed(cookie, ctx), 'big.png', 'image/png', oversized);
  assert.ok(response.statusCode >= 400, `expected a rejection, got ${response.statusCode}`);
});

test('upload: requires an admin session', async () => {
  const response = await upload(anonymous(ctx), 'icon.png', 'image/png', PNG_1X1);
  assert.equal(response.statusCode, 401);
});

test('icons: asset icons resolve to a servable URL', async () => {
  const uploaded = await upload(authed(cookie, ctx), 'icon.png', 'image/png', PNG_1X1);
  const { assetId, url } = uploaded.json<{ assetId: string; url: string }>();

  const groupName = `IconGroup-${Date.now()}`;
  const group = await createGroup(ctx, cookie, groupName);
  await createItem(ctx, cookie, group, { title: 'WithIcon', icon: { type: 'asset', assetId } });

  const publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
  const groups = publicConfig.json<{ groups: { name: string; items: { icon: { type: string; ref: string | null } }[] }[] }>()
    .groups;
  const published = groups.find((entry) => entry.name === groupName);
  const icon = published!.items[0]!.icon;

  assert.equal(icon.type, 'asset');
  // The client must receive a real path, not a bare asset id.
  assert.equal(icon.ref, url);
});

test('icons: missing asset is not served', async () => {
  const response = await ctx.app.inject({ method: 'GET', url: '/uploads/does-not-exist.png' });
  assert.equal(response.statusCode, 404);
});

test('icons: path traversal in the asset key is contained', async () => {
  const response = await ctx.app.inject({ method: 'GET', url: '/uploads/..%2F..%2Fpackage.json' });
  // Must be a clean 404, not a 500 and never the file itself.
  assert.equal(response.statusCode, 404, `expected 404, got ${response.statusCode}: ${response.body.slice(0, 120)}`);
});
