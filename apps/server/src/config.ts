import path from 'node:path';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const dataDir = path.resolve(process.env.PURE_DATA_DIR ?? './data');

/**
 * LAN probing needs `connect-src` to cover private http origins, which the default
 * CSP blocks. It is opt-in because allowing arbitrary http connections widens the
 * page's capability. Comma-separated, e.g. "http://192.168.1.0 http://10.0.0.0".
 */
const lanProbeOrigins = (process.env.PURE_LAN_PROBE_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

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
  lanProbeOrigins,
} as const;
