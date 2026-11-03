/**
 * Liquid Glass 运行时
 * ---------------------------------------------------------------------------
 * 浏览器没有原生 “液态玻璃”，玻璃边缘的弯折只能自己算：
 *
 *   1. 用圆角矩形的距离场生成一张位移贴图（R/G 通道编码 x/y 位移，128 = 不动）
 *   2. 塞进 SVG 的 feImage + feDisplacementMap，得到一个“透镜”滤镜
 *   3. 通过 backdrop-filter: url(#id) 作用在元素背后的内容上
 *
 * 贴图必须与元素的像素尺寸一一对应，所以每个元素一份滤镜，尺寸变化时重建。
 * 标记方式：给元素加 data-lg（普通玻璃）或 data-lg="lens"（带折射）。
 */

const NS = 'http://www.w3.org/2000/svg';

type LensEntry = {
  key: string;
  filter: Element | null;
  disp: Element | null;
  amp: number;
  id?: string;
};

type Options = {
  band: number;
  amp: number;
  blur: number;
  saturate: number;
  brightness: number;
};

const DEFAULTS: Options = { band: 20, amp: 12, blur: 18, saturate: 1.9, brightness: 1.06 };

const entries = new WeakMap<HTMLElement, LensEntry>();
const applied = new Set<HTMLElement>();

let uid = 0;
let defsEl: SVGSVGElement | null = null;
let lensSupported: boolean | null = null;

function canLens(): boolean {
  if (lensSupported === null) {
    lensSupported =
      typeof CSS !== 'undefined' &&
      (CSS.supports('backdrop-filter', 'url(#x)') ||
        CSS.supports('-webkit-backdrop-filter', 'url(#x)'));
  }
  return lensSupported;
}

function ensureDefs(): SVGSVGElement {
  if (defsEl && defsEl.isConnected) return defsEl;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', 'ln-glass-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(svg);
  defsEl = svg;
  return svg;
}

/** 圆角矩形距离场：内部为负，外部为正 */
function roundedRectSDF(x: number, y: number, w: number, h: number, r: number): number {
  const px = Math.abs(x - w / 2) - (w / 2 - r);
  const py = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r;
}

/** 生成位移贴图：只在边缘 band 内把采样点朝内推 */
function displacementMap(w: number, h: number, radius: number, band: number): { url: string; w: number; h: number } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { url: '', w: 0, h: 0 };

  const cw = canvas.width;
  const ch = canvas.height;
  const image = ctx.createImageData(cw, ch);
  const data = image.data;

  const field = new Float32Array(cw * ch);
  const at = (x: number, y: number): number => field[y * cw + x] ?? 0;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      field[y * cw + x] = roundedRectSDF(x + 0.5, y + 0.5, cw, ch, Math.min(radius, ch / 2));
    }
  }

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const depth = -at(x, y);
      let dx = 0;
      let dy = 0;

      if (depth >= 0 && depth < band) {
        let nx = at(Math.min(x + 1, cw - 1), y) - at(Math.max(x - 1, 0), y);
        let ny = at(x, Math.min(y + 1, ch - 1)) - at(x, Math.max(y - 1, 0));
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        const t = 1 - depth / band;
        const k = t * t;
        // 朝内取样：边缘压缩内侧内容，且永远不会采到元素外的空白
        dx = -nx * k;
        dy = -ny * k;
      }

      data[i] = 128 + 127 * dx;
      data[i + 1] = 128 + 127 * dy;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL(), w: cw, h: ch };
}

function setGlass(el: HTMLElement, options: Options, lens: boolean): void {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (w < 12 || h < 12) return;

  const style = getComputedStyle(el);
  const rawRadius = parseFloat(style.borderTopLeftRadius) || h / 2;
  const radius = Math.min(rawRadius, h / 2);
  const key = `${w}x${h}r${Math.round(radius)}${lens ? 'L' : ''}${options.blur}${options.amp}`;

  const blurPart = `blur(${options.blur}px) saturate(${options.saturate}) brightness(${options.brightness})`;
  const prev = entries.get(el);

  // 尺寸没变也要重新写一遍：无障碍「降低透明度」关掉后样式被清空过，不能因为缓存跳过
  if (prev && prev.key === key) {
    el.style.backdropFilter = prev.id ? `url(#${prev.id}) ${blurPart}` : blurPart;
    el.style.setProperty('-webkit-backdrop-filter', `blur(${options.blur}px) saturate(${options.saturate})`);
    return;
  }
  if (prev?.filter) prev.filter.remove();

  if (!lens || !canLens()) {
    el.style.backdropFilter = blurPart;
    el.style.setProperty('-webkit-backdrop-filter', `blur(${options.blur}px) saturate(${options.saturate})`);
    entries.set(el, { key, filter: null, disp: null, amp: options.amp });
    return;
  }

  const map = displacementMap(w, h, radius, options.band);
  if (!map.url) {
    el.style.backdropFilter = blurPart;
    entries.set(el, { key, filter: null, disp: null, amp: options.amp });
    return;
  }

  const id = `ln-glass-${++uid}`;
  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', '1');
  filter.setAttribute('height', '1');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const feImage = document.createElementNS(NS, 'feImage');
  feImage.setAttribute('href', map.url);
  feImage.setAttribute('x', '0');
  feImage.setAttribute('y', '0');
  feImage.setAttribute('width', String(map.w));
  feImage.setAttribute('height', String(map.h));
  feImage.setAttribute('preserveAspectRatio', 'none');
  feImage.setAttribute('result', 'map');

  const disp = document.createElementNS(NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'map');
  disp.setAttribute('scale', String(options.amp * 2));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');

  filter.append(feImage, disp);
  ensureDefs().appendChild(filter);

  el.style.backdropFilter = `url(#${id}) ${blurPart}`;
  el.style.setProperty('-webkit-backdrop-filter', `blur(${options.blur}px) saturate(${options.saturate})`);

  entries.set(el, { key, filter, disp, amp: options.amp, id });
}

function readOptions(el: HTMLElement): Options {
  const num = (name: string, fallback: number) => {
    const raw = el.dataset[name];
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    band: num('lgBand', DEFAULTS.band),
    amp: num('lgAmp', DEFAULTS.amp),
    blur: num('lgBlur', DEFAULTS.blur),
    saturate: DEFAULTS.saturate,
    brightness: DEFAULTS.brightness,
  };
}

/** 遍历页面上所有玻璃元素，按当前尺寸重建/复用滤镜 */
export function refreshLiquidGlass(): void {
  if (typeof document === 'undefined') return;
  const transparentReduced = matchMedia('(prefers-reduced-transparency: reduce)').matches;

  const seen = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-lg]').forEach((el) => {
    seen.add(el);
    applied.add(el);
    if (transparentReduced) {
      el.style.backdropFilter = '';
      el.style.setProperty('-webkit-backdrop-filter', '');
      return;
    }
    setGlass(el, readOptions(el), el.dataset.lg === 'lens');
  });

  // 卸载已从 DOM 移除的元素，避免滤镜节点泄漏
  applied.forEach((el) => {
    if (!seen.has(el) && !el.isConnected) {
      entries.get(el)?.filter?.remove();
      entries.delete(el);
      applied.delete(el);
    }
  });

  syncElevation();
}

/** 内容滚到玻璃下方时加深材质（顶栏读得清） */
function syncElevation(): void {
  const elevated = window.scrollY > 6;
  document.querySelectorAll<HTMLElement>('.top-scrim').forEach((el) => {
    el.classList.toggle('is-on', elevated);
  });
  document.querySelectorAll<HTMLElement>('[data-lg-elevate]').forEach((el) => {
    el.classList.toggle('is-elevated', elevated);
    // 顶栏下面那条「卷边」渐隐，避免内容硬切在玻璃底边
    el.closest('.topbar-shell')?.classList.toggle('has-scrolled', elevated);
  });
}

/* ── 卡片：悬停才挂真折射 ──────────────────────────────────────────
   卡片是大面积铺满的，逐卡开 url() 滤镜会拖垮滚动（1.7k 张会直接掉帧）。
   所以静止时只用 CSS 轻量玻璃面，指针进入 / 键盘聚焦时再挂真折射；
   滤镜按「卡片尺寸」缓存复用，同尺寸的卡片共用一份位移贴图。 */

const cardLenses = new Map<string, string>();
let hoveredCard: HTMLElement | null = null;

const CARD_LENS: Options = { band: 14, amp: 8, blur: 14, saturate: 1.8, brightness: 1.04 };
const CARD_LENS_CACHE_MAX = 16;

function cardLensId(w: number, h: number, radius: number): string | null {
  const key = `${w}x${h}r${Math.round(radius)}`;
  const cached = cardLenses.get(key);
  if (cached) return cached;
  if (cardLenses.size >= CARD_LENS_CACHE_MAX) return null;

  const map = displacementMap(w, h, radius, CARD_LENS.band);
  if (!map.url) return null;

  const id = `ln-card-${++uid}`;
  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', '1');
  filter.setAttribute('height', '1');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const feImage = document.createElementNS(NS, 'feImage');
  feImage.setAttribute('href', map.url);
  feImage.setAttribute('x', '0');
  feImage.setAttribute('y', '0');
  feImage.setAttribute('width', String(map.w));
  feImage.setAttribute('height', String(map.h));
  feImage.setAttribute('preserveAspectRatio', 'none');
  feImage.setAttribute('result', 'map');

  const disp = document.createElementNS(NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'map');
  disp.setAttribute('scale', String(CARD_LENS.amp * 2));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');

  filter.append(feImage, disp);
  ensureDefs().appendChild(filter);
  cardLenses.set(key, id);
  return id;
}

function attachCardLens(card: HTMLElement): void {
  if (!canLens()) return;
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  if (w < 40 || h < 32) return;
  const radius = Math.min(parseFloat(getComputedStyle(card).borderTopLeftRadius) || 12, h / 2);
  const id = cardLensId(w, h, radius);
  if (!id) return;
  card.style.backdropFilter = `url(#${id}) blur(${CARD_LENS.blur}px) saturate(${CARD_LENS.saturate}) brightness(${CARD_LENS.brightness})`;
  card.style.setProperty('-webkit-backdrop-filter', `blur(${CARD_LENS.blur}px) saturate(${CARD_LENS.saturate})`);
}

function detachCardLens(card: HTMLElement): void {
  card.style.backdropFilter = '';
  card.style.setProperty('-webkit-backdrop-filter', '');
}

function setHoveredCard(next: HTMLElement | null): void {
  if (next === hoveredCard) return;
  if (hoveredCard) detachCardLens(hoveredCard);
  hoveredCard = next;
  if (next) attachCardLens(next);
}

function bindCardLens(): void {
  const cardOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? (target.closest('.card') as HTMLElement | null) : null;

  document.addEventListener('pointerover', (event) => setHoveredCard(cardOf(event.target)), { passive: true });
  document.addEventListener('pointerdown', (event) => setHoveredCard(cardOf(event.target)), { passive: true });
  document.addEventListener('focusin', (event) => setHoveredCard(cardOf(event.target)));
  document.addEventListener('pointerleave', () => setHoveredCard(null), { passive: true });
  window.addEventListener('blur', () => setHoveredCard(null));
}

let resizeTimer = 0;

/** 全局只装一次：尺寸变化 / 滚动 / 无障碍设置变化时同步 */
export function initLiquidGlass(): void {
  if (typeof window === 'undefined') return;

  refreshLiquidGlass();
  bindCardLens();

  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(refreshLiquidGlass, 120);
    },
    { passive: true },
  );

  window.addEventListener('scroll', syncElevation, { passive: true });

  matchMedia('(prefers-reduced-transparency: reduce)').addEventListener('change', refreshLiquidGlass);
}
