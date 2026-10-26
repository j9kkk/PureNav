import type { FastifyInstance } from 'fastify';
import { ApiError } from '../lib/http.js';

/**
 * 同源图标代理。
 *
 * 浏览器无法对跨域图片做像素级检测（Canvas 会被污染抛 SecurityError），
 * 所以「实心方块 vs 透明矢量」的自适应判定在直连第三方 CDN 时永远失效。
 * 由服务端取回图标再以同源方式下发，前端即可正常采样。
 * 同时服务端可优先请求高分辨率源（128px），避免低清 favicon 被放大发虚。
 */

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 400;

interface CachedIcon {
  body: Buffer;
  contentType: string;
  expiresAt: number;
}

const iconCache = new Map<string, CachedIcon>();

/** 上游按顺序尝试：Google 通常提供 128px，DuckDuckGo 作为兜底。 */
const UPSTREAM_BUILDERS: ((host: string) => string)[] = [
  (host) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
  (host) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
];

/**
 * 只接受公网域名：拒绝 IP 字面量与内网/回环后缀，
 * 避免这个端点被当作内网探测跳板。
 */
export function isAllowedIconHost(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase();
  if (!host || host.length > 253) return false;
  if (!HOSTNAME_RE.test(host)) return false;
  if (/(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/.test(host)) return false;
  return true;
}

/** 依据文件头判断真实图片类型；上游返回 HTML 错误页时不能透传。 */
function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x00000100) return 'image/x-icon';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '<svg') return 'image/svg+xml';
  return null;
}

function readCache(key: string): CachedIcon | null {
  const hit = iconCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    iconCache.delete(key);
    return null;
  }
  return hit;
}

function writeCache(key: string, entry: CachedIcon): void {
  if (iconCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = iconCache.keys().next();
    if (!oldest.done) iconCache.delete(oldest.value);
  }
  iconCache.set(key, entry);
}

async function fetchUpstream(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'image/*' },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
    const contentType = sniffImageType(buffer);
    if (!contentType) return null;
    return { body: buffer, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function iconProxyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/icons/favicon',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { host } = req.query as { host?: string };
      const target = (host ?? '').trim().toLowerCase();
      if (!isAllowedIconHost(target)) {
        throw new ApiError(400, 'INVALID_HOST', '图标主机名不合法');
      }

      const cached = readCache(target);
      if (cached) {
        reply.header('Content-Type', cached.contentType);
        reply.header('Cache-Control', 'public, max-age=604800');
        reply.header('X-Content-Type-Options', 'nosniff');
        return reply.send(cached.body);
      }

      for (const build of UPSTREAM_BUILDERS) {
        const result = await fetchUpstream(build(target));
        if (!result) continue;
        writeCache(target, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
        reply.header('Content-Type', result.contentType);
        reply.header('Cache-Control', 'public, max-age=604800');
        reply.header('X-Content-Type-Options', 'nosniff');
        return reply.send(result.body);
      }

      // 上游全部失败时让前端继续走自己的降级链（直连 CDN → 首字母）。
      throw new ApiError(404, 'ICON_UNAVAILABLE', '图标暂不可用');
    },
  );
}

/** 测试用：清空进程内缓存。 */
export function clearIconCache(): void {
  iconCache.clear();
}
