import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

export interface TestContext {
  app: FastifyInstance;
  dataDir: string;
  /** Injects a same-origin header so POST/PATCH pass the CSRF check. */
  origin: string;
}

/**
 * Builds an isolated app with a throwaway data directory.
 *
 * config.ts and db/index.ts read the environment at module load, so PURE_DATA_DIR
 * must be set before they are imported. That is why everything here is dynamic:
 * a static import would already have opened the default database.
 */
export async function createTestApp(): Promise<TestContext> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purenav-test-'));
  process.env.PURE_DATA_DIR = dataDir;
  process.env.LOG_LEVEL = 'silent';

  const { buildApp } = await import('../src/app.js');
  const app = await buildApp({ webDist: null, logger: false });

  // inject() defaults to `Host: localhost:80`, and URL parsing strips the default
  // port, so the origin comparison would fail on a port mismatch that never occurs
  // in a real deployment. Tests use an explicit non-default port on both sides.
  return { app, dataDir, origin: 'http://localhost:3000' };
}

export async function teardown(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  const { closeDb } = await import('../src/db/index.js');
  closeDb();
  fs.rmSync(ctx.dataDir, { recursive: true, force: true });
}

const PASSWORD = 'supersecret123';

/** inject() defaults to Host: localhost:80; an explicit host keeps origin checks honest. */
export const TEST_HOST = 'localhost:3000';
const HOST = TEST_HOST;

/** Creates the admin account and returns the session cookie. */
export async function setupAdmin(ctx: TestContext): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/setup',
    headers: { origin: ctx.origin, host: HOST },
    payload: { username: 'admin', password: PASSWORD },
  });
  if (response.statusCode !== 201) {
    throw new Error(`setup failed: ${response.statusCode} ${response.body}`);
  }
  return extractCookie(response);
}

/** Expresses intent: a request made without any session cookie. */
export function anonymous(ctx: TestContext): { origin: string; host: string } {
  return { origin: ctx.origin, host: HOST };
}

export function authed(cookie: string, ctx: TestContext): { cookie: string; origin: string; host: string } {
  return { cookie, origin: ctx.origin, host: HOST };
}

export function extractCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('no session cookie returned');
  return value.split(';')[0]!;
}

export async function createGroup(ctx: TestContext, cookie: string, name: string): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/groups',
    headers: authed(cookie, ctx),
    payload: { name },
  });
  if (response.statusCode !== 201) throw new Error(`group create failed: ${response.body}`);
  return response.json<{ id: string }>().id;
}

export async function createItem(
  ctx: TestContext,
  cookie: string,
  groupId: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/items',
    headers: authed(cookie, ctx),
    payload: { groupId, title: 'Example', url: 'https://example.com', ...body },
  });
  if (response.statusCode !== 201) throw new Error(`item create failed: ${response.body}`);
  return response.json<{ id: string }>();
}

/** Minimal valid 1x1 PNG, used to exercise the magic-byte path. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function multipartBody(
  boundary: string,
  filename: string,
  contentType: string,
  bytes: Buffer,
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}
