import type { IconRef } from '../types';

/**
 * 图标地址解析，后台预览与前台卡片共用一份。
 *
 * 回退链：显式来源（asset/url/iconify）→ 同源代理 → 直连站点自身 favicon
 * → 文字首字母。第二步由服务端抓取，能拿到声明的高清图标并让 Canvas 采样；
 * 代理整体不可用时，第三、四步保证页面不会整片空掉。
 */

export function primaryIconSrc(icon: IconRef, siteUrl: string, color?: string): string | null {
  if (icon.type === 'asset' && icon.ref) return icon.ref;
  if (icon.type === 'url' && icon.ref) return icon.ref;
  if (icon.type === 'iconify' && icon.ref) {
    const base = `https://api.iconify.design/${icon.ref.replace(':', '/')}.svg`;
    return color ? `${base}?color=${encodeURIComponent(color)}` : base;
  }
  if (icon.type === 'auto') {
    const site = parseSite(siteUrl);
    if (!site) return null;
    // 走同源代理：既能取到站点声明的高清图标，也让 Canvas 能采样四角透明度。
    // 带上协议，服务端就不用先盲猜 https 再超时退回。
    return `/api/v1/icons/favicon?host=${encodeURIComponent(site.host)}&scheme=${site.scheme}`;
  }
  return null;
}

/** 代理不可用时的直连兜底：站点自己的 /favicon.ico 不依赖任何第三方 CDN。 */
export function fallbackIconSrc(icon: IconRef, siteUrl: string): string | null {
  if (icon.type !== 'auto') return null;
  const site = parseSite(siteUrl);
  return site ? `${site.scheme}://${site.host}/favicon.ico` : null;
}

function parseSite(siteUrl: string): { host: string; scheme: 'http' | 'https' } | null {
  try {
    const url = new URL(siteUrl);
    return { host: url.hostname, scheme: url.protocol === 'http:' ? 'http' : 'https' };
  } catch {
    return null;
  }
}

export function iconInitial(title: string): string {
  return title.trim().slice(0, 1).toUpperCase() || '·';
}
