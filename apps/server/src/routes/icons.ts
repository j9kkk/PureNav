import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../lib/http.js';

/**
 * 同源图标代理。
 *
 * 浏览器无法对跨域图片做像素级检测（Canvas 会被污染抛 SecurityError），
 * 所以「实心方块 vs 透明矢量」的自适应判定在直连第三方 CDN 时永远失效。
 * 由服务端取回图标再以同源方式下发，前端即可正常采样。
 *
 * 取图顺序以「站点自己声明的图标」为主：`<link rel="icon">`、manifest、
 * `/favicon.ico` 通常又快又准，且不依赖第三方 CDN 的可达性。第三方图标库
 * 只作为兜底，并在失败后短路一段时间，避免整站图标因为一条不可用的上游
 * 而集体退化，也避免每次刷新都重走一遍超时。
 */

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const FETCH_TIMEOUT_MS = 4000;
/**
 * 单个图标的总预算。整页可能有上百张卡片在等，一个不可达的站点不能把别的卡片拖住；
 * 超预算就放弃，交给前端首字母兜底，下次刷新再试（失败结果本身也会缓存）。
 */
const TOTAL_BUDGET_MS = 8000;
const MAX_BYTES = 512 * 1024;
const HTML_MAX_BYTES = 256 * 1024;
const MANIFEST_MAX_BYTES = 128 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 抓不到时也要记一笔：否则每次刷新都重跑完整链路，页面图标会一直空着等待。 */
const NEGATIVE_TTL_MS = 2 * 60 * 1000;
/** 某个第三方图标库失败后短路一段时间，避免每个图标都等满超时。 */
const UPSTREAM_BREAKER_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 4000;
/** 一屏可能上百张卡片同时取图，限制的是「同时对外发起的请求数」，不是请求总数。 */
const MAX_CONCURRENT_FETCHES = 8;

interface CachedIcon {
  body: Buffer | null;
  contentType: string;
  expiresAt: number;
}

const iconCache = new Map<string, CachedIcon>();
const upstreamDownUntil = new Map<string, number>();
/** 同一个主机的并发请求合并成一次出站抓取，后台预览和前台同时打开时不会抓两遍。 */
const inFlight = new Map<string, Promise<{ body: Buffer; contentType: string } | null>>();

/** 简单的并发闸门：防止整页刷新时一次打出去上百个出站请求。 */
let activeFetches = 0;
const fetchWaiters: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return;
  }
  await new Promise<void>((resolve) => fetchWaiters.push(resolve));
  activeFetches += 1;
}

function releaseSlot(): void {
  activeFetches = Math.max(0, activeFetches - 1);
  const next = fetchWaiters.shift();
  if (next) next();
}

/** 上游按顺序尝试：Google 通常提供 128px，DuckDuckGo 作为兜底。 */
const UPSTREAM_BUILDERS: { name: string; build: (host: string) => string }[] = [
  { name: 'google', build: (host) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` },
  { name: 'duckduckgo', build: (host) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico` },
];

const BROWSER_UA =
  'Mozilla/5.0 (compatible; PureNavIconFetcher/1.0; +https://github.com/) AppleWebKit/537.36 Chrome/120 Safari/537.36';

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
  // SVG 可能带 XML 声明、BOM 或是注释打头，所以先剥掉前导空白再看标签。
  const head = buffer.subarray(0, 256).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
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

/** 逐块读取并设上限，避免恶意的超长响应把内存吃满。 */
async function readBounded(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * 带跳转校验的请求：`redirect: 'follow'` 会让上游把请求转到任意地址，
 * 等于绕开公网域名限制，所以每一跳都要重新过一遍白名单。
 */
async function requestWithHostGuard(
  url: string,
  accept: string,
  limit: number,
  deadline: number,
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!isAllowedIconHost(parsed.hostname)) return null;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(FETCH_TIMEOUT_MS, remaining));
    let response: Response;
    try {
      response = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept, 'user-agent': BROWSER_UA },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    return response.ok ? response : null;
  }
  return null;
}

async function fetchImage(url: string, deadline: number): Promise<{ body: Buffer; contentType: string } | null> {
  await acquireSlot();
  try {
    const response = await requestWithHostGuard(url, 'image/*,*/*;q=0.8', MAX_BYTES, deadline);
    if (!response) return null;
    const buffer = await readBounded(response, MAX_BYTES).catch(() => null);
    if (!buffer || buffer.length === 0) return null;
    const contentType = sniffImageType(buffer);
    if (!contentType) return null;
    return { body: buffer, contentType };
  } finally {
    releaseSlot();
  }
}

async function fetchText(url: string, limit: number, deadline: number): Promise<string | null> {
  await acquireSlot();
  try {
    const response = await requestWithHostGuard(url, 'text/html,application/manifest+json,application/json;q=0.9,*/*;q=0.8', limit, deadline);
    if (!response) return null;
    const buffer = await readBounded(response, limit).catch(() => null);
    if (!buffer || buffer.length === 0) return null;
    return buffer.toString('utf8');
  } finally {
    releaseSlot();
  }
}

interface Candidate {
  url: string;
  score: number;
}

function resolveUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 声明尺寸越大越清晰，但 512px 的图标对 40px 的卡片是浪费，
 * 所以给 manifest 里的超大图设上限；SVG 天然可缩放，固定给一个中间分。
 */
function scoreIcon(sizes: string | undefined, rel: string, href: string, cap = Number.POSITIVE_INFINITY): number {
  const declared = (sizes ?? '')
    .split(/[\s,]+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  let score = declared.length > 0 ? Math.max(...declared) : /apple-touch-icon/.test(rel) ? 180 : 64;
  if (/\.svg($|[?#])/i.test(href)) score = Math.min(score, 96);
  return Math.min(score, cap);
}

function parseHtmlIcons(html: string, pageUrl: string): { icons: Candidate[]; manifest: string | null } {
  const icons: Candidate[] = [];
  const seen = new Set<string>();
  let manifest: string | null = null;

  const tagRe = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const tag = match[0];
    const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1] ?? '').toLowerCase().trim();
    if (!rel) continue;

    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;

    if (/\bmanifest\b/.test(rel) && !manifest) {
      manifest = resolveUrl(href, pageUrl);
      continue;
    }

    // mask-icon 是 Safari 固定标签页用的单色蒙版，铺到彩色底座上只剩黑块。
    if (/\bmask-icon\b/.test(rel)) continue;
    const isIcon = /(^|\s)(icon|shortcut|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel);
    if (!isIcon) continue;

    const url = resolveUrl(href, pageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    icons.push({ url, score: scoreIcon(tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i)?.[1], rel, url) });
  }

  icons.sort((a, b) => b.score - a.score);
  return { icons, manifest };
}

function parseManifestIcons(json: string, manifestUrl: string): Candidate[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const list = (data as { icons?: unknown }).icons;
  if (!Array.isArray(list)) return [];

  const out: Candidate[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { src?: unknown; sizes?: unknown };
    if (typeof record.src !== 'string') continue;
    // 超大位图下载和转发都浪费带宽，40px 的槽位用不到。
    const url = resolveUrl(record.src, manifestUrl);
    if (!url) continue;
    out.push({ url, score: scoreIcon(typeof record.sizes === 'string' ? record.sizes : undefined, 'icon', url, 256) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * 直连站点自身声明的图标：先并发探首页与 /favicon.ico，声明的图标优先。
 *
 * `preferredScheme` 来自站点条目自己的地址，省掉「猜协议」的往返：
 * 纯 http 的自建服务不必先等一次 https 超时。
 */
async function resolveDirect(
  host: string,
  preferredScheme: 'http' | 'https',
  deadline: number,
): Promise<{ body: Buffer; contentType: string } | null> {
  const origins =
    preferredScheme === 'http'
      ? [`http://${host}/`, `https://${host}/`]
      : [`https://${host}/`, `http://${host}/`];

  for (const origin of origins) {
    const [homepage, plainIcon] = await Promise.all([
      fetchText(origin, HTML_MAX_BYTES, deadline).catch(() => null),
      fetchImage(`${origin}favicon.ico`, deadline).catch(() => null),
    ]);
    // 两个都拿不到说明这个协议根本不通，可以换另一个试；
    // 只要有一个有响应（哪怕是 403），换协议也不会有不同结果。
    const reachable = homepage !== null || plainIcon !== null;

    if (homepage) {
      const { icons, manifest } = parseHtmlIcons(homepage, origin);
      const candidates = [...icons];

      if (manifest && Date.now() < deadline) {
        const manifestText = await fetchText(manifest, MANIFEST_MAX_BYTES, deadline).catch(() => null);
        if (manifestText) candidates.push(...parseManifestIcons(manifestText, manifest));
      }

      for (const candidate of candidates.slice(0, 4)) {
        if (Date.now() > deadline) break;
        const result = await fetchImage(candidate.url, deadline).catch(() => null);
        if (result) return result;
      }
    }

    // 声明里没有可用图标时，退回约定俗成的 /favicon.ico（上面已并发取过）。
    if (plainIcon) return plainIcon;
    if (reachable || Date.now() > deadline) break;
  }

  return null;
}

/**
 * 第三方图标库兜底：并发试，别串行叠加两个超时。
 * 失败后短路一段时间——网络环境整体不可达时，等一次就够了，
 * 不能让之后每个图标都再等一遍。
 */
async function resolveFromUpstreams(host: string, deadline: number): Promise<{ body: Buffer; contentType: string } | null> {
  const live = UPSTREAM_BUILDERS.filter((upstream) => Date.now() >= (upstreamDownUntil.get(upstream.name) ?? 0));
  if (live.length === 0 || Date.now() > deadline) return null;

  const attempts = live.map(async (upstream) => {
    const result = await fetchImage(upstream.build(host), deadline);
    if (!result) upstreamDownUntil.set(upstream.name, Date.now() + UPSTREAM_BREAKER_MS);
    return result;
  });

  // 任一上游先成功即可，其余请求让它自己跑完并记录状态，不必等。
  return Promise.any(attempts.map((attempt) => attempt.then((r) => {
    if (!r) throw new Error('miss');
    return r;
  }))).catch(() => null);
}

function sendIcon(reply: FastifyReply, entry: { body: Buffer; contentType: string }) {
  reply.header('Content-Type', entry.contentType);
  reply.header('Cache-Control', 'public, max-age=604800');
  reply.header('X-Content-Type-Options', 'nosniff');
  return reply.send(entry.body);
}

export async function iconProxyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/icons/favicon',
    {
      // 一屏正常的页面刷新就会发出上百个图标请求（1733 个站点的实例更多），
      // 把缓存命中也算进限流会让正常浏览自己把自己限掉——这正是「改了图标后
      // 整页图标一起失效」的直接原因：超限后所有图标一起被 429 打回。
      // 所以限流只针对真正回源的请求，缓存命中不计数。
      config: {
        rateLimit: {
          max: 600,
          timeWindow: '1 minute',
          allowList: (req: FastifyRequest) => {
            const host = (req.query as { host?: string } | undefined)?.host;
            const key = (host ?? '').trim().toLowerCase();
            return key.length > 0 && readCache(key) !== null;
          },
        },
      },
    },
    async (req, reply) => {
      const { host, scheme } = req.query as { host?: string; scheme?: string };
      const target = (host ?? '').trim().toLowerCase();
      if (!isAllowedIconHost(target)) {
        throw new ApiError(400, 'INVALID_HOST', '图标主机名不合法');
      }
      // 站点自己的地址已经告诉我们用哪个协议，省掉一次盲猜。
      const preferredScheme = scheme === 'http' ? 'http' : 'https';

      const cached = readCache(target);
      if (cached) {
        if (!cached.body) {
          // 失败结果也要下发，但让浏览器别把它钉在缓存里。
          reply.header('Cache-Control', 'no-store');
          throw new ApiError(404, 'ICON_UNAVAILABLE', '图标暂不可用');
        }
        return sendIcon(reply, { body: cached.body, contentType: cached.contentType });
      }

      const deadline = Date.now() + TOTAL_BUDGET_MS;
      let pending = inFlight.get(target);
      if (!pending) {
        const started = (async () =>
          (await resolveDirect(target, preferredScheme, deadline)) ??
          (await resolveFromUpstreams(target, deadline)))();
        inFlight.set(target, started);
        // 无论成败都要释放，否则这个主机后续永远拿到一个已结束的 Promise。
        void started.finally(() => {
          if (inFlight.get(target) === started) inFlight.delete(target);
        });
        pending = started;
      }
      const result = await pending;

      if (!result) {
        writeCache(target, { body: null, contentType: '', expiresAt: Date.now() + NEGATIVE_TTL_MS });
        // 前端据此继续走自己的降级链：直连站点 → 首字母。
        throw new ApiError(404, 'ICON_UNAVAILABLE', '图标暂不可用');
      }

      writeCache(target, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
      return sendIcon(reply, result);
    },
  );
}

/** 测试用：清空进程内缓存。 */
export function clearIconCache(): void {
  iconCache.clear();
  upstreamDownUntil.clear();
}
