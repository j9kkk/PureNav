import path from 'node:path';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const dataDir = path.resolve(process.env.PURE_DATA_DIR ?? './data');

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: envInt('PORT', 8080),
  dataDir,
  dbPath: path.join(dataDir, 'purenav.db'),
  assetsDir: path.join(dataDir, 'assets'),
  webDistDir: path.resolve(process.env.PURE_WEB_DIST ?? './web-dist'),
  sessionTtlDays: envInt('PURE_SESSION_TTL_DAYS', 7),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  trustProxy: process.env.PURE_TRUST_PROXY === '1',
} as const;
