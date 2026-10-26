/**
 * 图标自适应呈现检测工具
 *
 * 针对不同来源的 Favicon 进行四角 Alpha 采样：
 * - 'full' (满铺 App 风格): 实心正方形底色 (4个角 Alpha 均接近 255)，放大至 100% 由外框超椭圆裁切 + 内描边
 * - 'inset' (居中内嵌风格): 透明矢量/剪影 Logo，保留内边距呼吸感与同心圆角
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

/**
 * 探测图像是否为实心正方形底色
 */
export function detectIconVariant(img: HTMLImageElement): IconVariant {
  const src = img.currentSrc || img.src;
  if (!src) return 'inset';

  // 优先读缓存
  const cached = variantCache.get(src);
  if (cached) return cached;

  // 矢量 SVG 通常为透明背景 Logo，默认为 inset
  if (src.includes('.svg') || src.startsWith('data:image/svg+xml')) {
    variantCache.set(src, 'inset');
    return 'inset';
  }

  // 宽高比严重偏离正方形（如横向 banner）强制 inset
  if (img.naturalWidth && img.naturalHeight) {
    const ratio = img.naturalWidth / img.naturalHeight;
    if (ratio < 0.85 || ratio > 1.15) {
      variantCache.set(src, 'inset');
      return 'inset';
    }
  }

  const ctx = getSharedContext();
  if (!ctx) return 'inset';

  try {
    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(img, 0, 0, 16, 16);

    const imgData = ctx.getImageData(0, 0, 16, 16).data;

    // 检查四个角的 Alpha 通道
    // 坐标分别为 (0,0), (15,0), (0,15), (15,15)
    const corners = [
      3,                      // (0,0) 的 Alpha
      15 * 4 + 3,             // (15,0) 的 Alpha
      (15 * 16) * 4 + 3,      // (0,15) 的 Alpha
      (15 * 16 + 15) * 4 + 3, // (15,15) 的 Alpha
    ];

    // 四角完全不透明（Alpha 阈值 > 240）判定为带底色的正方形
    const allCornersSolid = corners.every((alphaIndex) => (imgData[alphaIndex] ?? 0) >= 240);

    const result: IconVariant = allCornersSolid ? 'full' : 'inset';
    variantCache.set(src, result);
    return result;
  } catch {
    // 跨域受限 (Tainted canvas) 或图像尚未解码完成，安全降级为 inset 同心圆角模式
    variantCache.set(src, 'inset');
    return 'inset';
  }
}
