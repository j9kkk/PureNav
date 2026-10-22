import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db, closeDb } from './db/index.js';
import { ApiError, resolveRequestUser, sendError } from './lib/http.js';
import { publicRoutes } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { groupRoutes } from './routes/groups.js';
import { itemRoutes } from './routes/items.js';
import { settingsRoutes, assetRoutes } from './routes/settings.js';

const app = Fastify({
  logger: { level: config.logLevel },
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
  reply.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self' https:",
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
        details: error.issues.map((issue) => ({ field: issue.path.join('.'), rule: issue.code, message: issue.message })),
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
  },
  { prefix: '/api/v1' },
);

await app.register(assetRoutes);

// Serve the built SPA when present; API routes above take precedence.
const hasWebDist = fs.existsSync(path.join(config.webDistDir, 'index.html'));
if (hasWebDist) {
  await app.register(fastifyStatic, {
    root: config.webDistDir,
    wildcard: false,
    setHeaders(res, filePath) {
      if (/\/assets\/.+-[A-Za-z0-9_]{8,}\.(js|css|woff2?)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
    }
    // SPA fallback: any non-API GET returns the shell so client routing works.
    return reply.type('text/html').send(fs.createReadStream(path.join(config.webDistDir, 'index.html')));
  });
} else {
  app.log.warn('web dist not found, serving API only');
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  closeDb();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
