import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestApp,
  teardown,
  setupAdmin,
  TEST_HOST,
} from './helpers.js';
test('icon proxy: rejects private and malformed hosts', async () => {
  const ctx = await createTestApp();
  try {
    const cookie = await setupAdmin(ctx);
    for (const host of ['127.0.0.1', '192.168.1.10', 'localhost', 'foo.local', 'not a host', '']) {
      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/icons/favicon?host=${encodeURIComponent(host)}`,
        headers: { host: TEST_HOST, cookie },
      });
      assert.ok(
        response.statusCode === 400 || response.statusCode === 404,
        `expected rejection for "${host}", got ${response.statusCode}`,
      );
    }
  } finally {
    await teardown(ctx);
  }
});

test('icon proxy: returns a sniffed image from upstream and caches it', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  let calls = 0;

  // 上游不可达时不臆造网络请求结果，用 stub 明确替代。
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;

  try {
    const first = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=example.com',
      headers: { host: TEST_HOST },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers['content-type'], 'image/png');
    assert.equal(first.headers['x-content-type-options'], 'nosniff');
    assert.equal(first.rawPayload.length, png.length);

    const second = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=example.com',
      headers: { host: TEST_HOST },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(calls, 1, 'second request must be served from cache');
  } finally {
    globalThis.fetch = realFetch;
    await teardown(ctx);
  }
});

test('icon proxy: never forwards an HTML error page as an image', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as typeof fetch;

  try {
    // 进程内缓存跨测试共享，换成另一个主机名才能走到上游分支。
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=html-only.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(response.statusCode, 404);
    assert.match(response.body, /ICON_UNAVAILABLE/);
  } finally {
    globalThis.fetch = realFetch;
    await teardown(ctx);
  }
});
