import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db } from './db/index.js';
import { ApiError, resolveRequestUser, sendError } from './lib/http.js';
import { publicRoutes } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { groupRoutes } from './routes/groups.js';
import { itemRoutes } from './routes/items.js';
import { settingsRoutes, assetUploadRoutes, assetReadRoutes } from './routes/settings.js';
import { iconProxyRoutes } from './routes/icons.js';

export interface BuildAppOptions {
  /** Overrides the SPA directory; `null` skips static serving entirely. */
  webDist?: string | null;
  logger?: boolean;
}

/** Builds the app without listening, so tests can drive it via inject(). */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const { webDist = config.webDistDir, logger = true } = options;

  const app = Fastify({
    logger: logger ? { level: config.logLevel } : false,
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 512 * 1024, files: 1 } });
  await app.register(rateLimit, { global: false });

  /** Security headers applied to every response, including the SPA shell. */
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // http: is only allowed for connect-src, and only for explicitly configured LAN origins.
    const connectSrc = ["'self'", 'https:', ...config.lanProbeOrigins].join(' ');
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: https: http:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        `connect-src ${connectSrc}`,
        "font-src 'self' data:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    return payload;
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      req.log.info({ err: error }, 'validation failed');
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: error.issues[0]?.message ?? '参数校验失败',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            rule: issue.code,
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof ApiError) {
      return sendError(reply, error);
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: '请求过于频繁' } });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.status(statusCode).send({
        error: { code: 'BAD_REQUEST', message: (error as Error).message || '请求无效' },
      });
    }
    req.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: '服务器内部错误' } });
  });

  app.get('/health', async () => ({
    status: 'ok',
    version: process.env.PURE_VERSION ?? 'dev',
    uptime: Math.round(process.uptime()),
  }));

  await app.register(
    async (api) => {
      api.get('/system/info', async (req, reply) => {
        const user = resolveRequestUser(req);
        if (!user || user.role !== 'admin') {
          return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: '请先登录' } });
        }
        const counts = {
          groups: (db.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number }).n,
          items: (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n,
          assets: (db.prepare('SELECT COUNT(*) AS n FROM assets').get() as { n: number }).n,
        };
        return {
          version: process.env.PURE_VERSION ?? 'dev',
          database: 'sqlite',
          counts,
          dataDir: config.dataDir,
        };
      });

      await api.register(publicRoutes);
      await api.register(authRoutes);
      await api.register(groupRoutes);
      await api.register(itemRoutes);
      await api.register(settingsRoutes);
      await api.register(assetUploadRoutes);
      await api.register(iconProxyRoutes);
    },
    { prefix: '/api/v1' },
  );

  await app.register(assetReadRoutes);

  const hasWebDist = webDist !== null && fs.existsSync(path.join(webDist, 'index.html'));
  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      // wildcard must stay on: with `false`, no file route is registered at all and
      // every asset request falls through to the SPA handler, which would serve HTML
      // with a JS content type. Hashed assets then break on any reload.
      maxAge: '1y',
      immutable: true,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
      }
      // SPA fallback: any non-API GET returns the shell so client routing works.
      reply.header('Cache-Control', 'no-cache');
      return reply.type('text/html').send(fs.createReadStream(path.join(webDist, 'index.html')));
    });

    // The shell is not content-hashed, so it must always revalidate; a pinned index.html
    // would keep serving a stale bundle reference after every deploy.
    app.addHook('onSend', async (req, reply, payload) => {
      const isShell = reply.getHeader('content-type')?.toString().startsWith('text/html');
      if (isShell) reply.header('Cache-Control', 'no-cache');
      return payload;
    });
  } else {
    app.log.warn('web dist not found, serving API only');
  }

  return app;
}
