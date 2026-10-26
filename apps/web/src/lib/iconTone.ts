/**
 * 图标呈现形态探测。
 *
 * 目标：把「实心方块图标」按 App Store 的方式满铺裁切，把「透明矢量 Logo」
 * 保持居中留白，避免方块硬角嵌在圆角底座里。
 *
 * 判定依赖四角 Alpha 采样，因此图片必须可被 Canvas 读取。跨域图片会污染
 * Canvas 并抛 SecurityError，所以自动模式下图标统一经由同源代理
 * `/api/v1/icons/favicon` 下发；探测失败时退回居中形态，不做错误猜测。
 */

export type IconVariant = 'full' | 'inset';

const variantCache = new Map<string, IconVariant>();

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getSharedContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = 16;
    sharedCanvas.height = 16;
  }
  if (!sharedCtx) {
    sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
  }
  return sharedCtx;
}

/** 低于此边长的位图放大到 40px 会明显发虚，不做满铺处理（Retina 下需要 80 物理像素）。 */
const MIN_FULL_BLEED_SIZE = 64;

/**
 * @param img 已完成加载的图片元素
 * @param fillRatio 四角不透明像素的判定阈值，默认 1 表示四角都要实心
 */
export function detectIconVariant(img: HTMLImageElement, fillRatio = 1): IconVariant {
  const src = img.currentSrc || img.src;
  if (!src) return 'inset';

  const cached = variantCache.get(src);
  if (cached) return cached;

  const remember = (variant: IconVariant): IconVariant => {
    variantCache.set(src, variant);
    return variant;
  };

  // 矢量图标天然透明，满铺会得到一个只有形状的色块，保持居中。
  if (src.includes('.svg') || src.startsWith('data:image/svg+xml')) return remember('inset');

  const { naturalWidth, naturalHeight } = img;
  // 低分辨率位图放大到满铺尺寸必然发虚——这正是之前图标变糊的直接原因。
  if (naturalWidth > 0 && naturalWidth < MIN_FULL_BLEED_SIZE) return remember('inset');

  // 非正方形（横向 banner、宽字标）不裁切。
  if (naturalWidth > 0 && naturalHeight > 0) {
    const ratio = naturalWidth / naturalHeight;
    if (ratio < 0.9 || ratio > 1.1) return remember('inset');
  }

  const ctx = getSharedContext();
  if (!ctx) return 'inset';

  try {
    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(img, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);

    const alphaAt = (x: number, y: number) => data[(y * 16 + x) * 4 + 3] ?? 0;
    const samples = [alphaAt(0, 0), alphaAt(15, 0), alphaAt(0, 15), alphaAt(15, 15)];

    // 用 Alpha 饱和度判断：四角都不透明说明图标本身自带铺满的底色。
    const solidCorners = samples.filter((alpha) => alpha >= 240).length;
    const variant: IconVariant = solidCorners >= Math.ceil(samples.length * fillRatio) ? 'full' : 'inset';
    return remember(variant);
  } catch {
    // 跨域污染（未走代理）或解码未完成：保持居中，绝不猜测。
    return 'inset';
  }
}
