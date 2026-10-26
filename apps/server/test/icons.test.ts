import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestApp,
  teardown,
  setupAdmin,
  TEST_HOST,
} from './helpers.js';

/**
 * 缓存是模块级单例，必须和 app 用同一份实例。helpers 会在设置 PURE_DATA_DIR 后
 * 动态加载 app，所以这里也动态加载，静态 import 会提前打开默认数据库。
 */
async function clearIconCache(): Promise<void> {
  const { clearIconCache: clear } = await import('../src/routes/icons.js');
  clear();
}

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

test('icon proxy: serves the icon declared in the page HTML and caches it', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  let calls = 0;
  let iconRequests = 0;

  // 上游不可达时不臆造网络请求结果，用 stub 明确替代。
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls += 1;
    const url = String(input);
    if (url.endsWith('/favicon.ico')) return new Response('nope', { status: 404 });
    if (url === 'https://example.com/' || url === 'http://example.com/') {
      return new Response(
        '<html><head><link rel="icon" type="image/png" sizes="192x192" href="/img/logo.png"></head></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    }
    if (url === 'https://example.com/img/logo.png') {
      iconRequests += 1;
      return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return new Response('', { status: 404 });
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
    assert.equal(iconRequests, 1, 'the declared icon must win over the plain /favicon.ico');

    const callsAfterFirst = calls;
    const second = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=example.com',
      headers: { host: TEST_HOST },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(calls, callsAfterFirst, 'second request must be served from cache');
  } finally {
    globalThis.fetch = realFetch;
    await clearIconCache();
    await teardown(ctx);
  }
});

test('icon proxy: falls back to the plain /favicon.ico when no icon is declared', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  const ico = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/favicon.ico')) {
      return new Response(ico, { status: 200, headers: { 'content-type': 'image/x-icon' } });
    }
    // 首页没有 icon 声明。
    return new Response('<html><head><title>plain</title></head></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  }) as typeof fetch;

  try {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=plain.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/x-icon');
  } finally {
    globalThis.fetch = realFetch;
    await clearIconCache();
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
    await clearIconCache();
    await teardown(ctx);
  }
});

test('icon proxy: a redirect towards a private host is not followed', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  let internalHits = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    // 直连 favicon 被 302 到内网地址：这是把代理当内网跳板的典型尝试。
    if (url.endsWith('/favicon.ico')) {
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/admin' } });
    }
    if (url.includes('127.0.0.1')) {
      internalHits += 1;
      return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  try {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=redirector.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(internalHits, 0, 'redirect to a private host must never be fetched');
  } finally {
    globalThis.fetch = realFetch;
    await clearIconCache();
    await teardown(ctx);
  }
});

test('icon proxy: a host behind basic auth is not retried or sent to icon CDNs', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  const hits: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    hits.push(url);
    // 整站 Basic Auth：任何路径都是 401，包括第三方图标库也拿不到内容。
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="restricted"' },
    });
  }) as typeof fetch;

  try {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=gated.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(response.statusCode, 404);
    assert.match(response.body, /ICON_UNAVAILABLE/);

    // https 上首页与 /favicon.ico 并发各探一次即确认需要认证，之后立即收手：
    // 不再换 http 重试，也不去问第三方图标库。
    assert.equal(hits.length, 2, `expected to stop after the https probes, got ${hits.join(', ')}`);
    assert.ok(!hits.some((url) => url.startsWith('http://')), 'must not retry the same host over http');
    assert.ok(!hits.some((url) => url.includes('google.com')), 'must not fall back to a third-party icon CDN');
    assert.ok(!hits.some((url) => url.includes('duckduckgo.com')), 'must not fall back to a third-party icon CDN');
  } finally {
    globalThis.fetch = realFetch;
    await clearIconCache();
    await teardown(ctx);
  }
});

test('icon proxy: a 404 on /favicon.ico still tries the icon declared in HTML', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/favicon.ico')) return new Response('', { status: 404 });
    if (url === 'https://partial404.example/') {
      return new Response('<html><head><link rel="icon" href="/brand.png" sizes="180x180"></head></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (url === 'https://partial404.example/brand.png') {
      return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  try {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=partial404.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/png');
  } finally {
    globalThis.fetch = realFetch;
    await clearIconCache();
    await teardown(ctx);
  }
});

test('icon proxy: a miss is cached so repeated refreshes stay fast', async () => {
  const ctx = await createTestApp();
  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return new Response('', { status: 404 });
  }) as typeof fetch;

  try {
    const first = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=missing.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(first.statusCode, 404);

    const callsAfterFirst = calls;
    const second = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/icons/favicon?host=missing.example',
      headers: { host: TEST_HOST },
    });
    assert.equal(second.statusCode, 404);
    assert.equal(calls, callsAfterFirst, 'a failed lookup must be remembered, not retried per reload');
    assert.equal(second.headers['cache-control'], 'no-store');
  } finally {
    globalThis.fetch = realFetch;
    await clearIconCache();
    await teardown(ctx);
  }
});
