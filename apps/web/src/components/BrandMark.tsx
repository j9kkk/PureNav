/**
 * PureNav 标识
 * ---------------------------------------------------------------------------
 * 一条路线收成字母 P：竖笔是这条路，顶端向左上挑出一道 45° 短须当起笔方向；
 * 碗口从竖笔顶端向右绕出去，在回到竖笔前停住（开口 1.1 单位）——路还没走完。
 *
 * 纯几何 SVG：无位图、不依赖字体，描边走 currentColor，
 * 所以放在深/浅色、任何强调色底上都成立。
 *
 * 尺寸：32 格单格里墨迹 17.9×19.7 单位，落进 30px 图标块按 24px 渲染，
 * 占块宽 45%（墨迹居中：包围盒中心落在 16/16，不是路径起点）。
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8.35 12.05L12.95 7.45M12.95 7.45V24.65M12.95 7.45h4.6c4 0 6.2 2.4 6.2 6.2s-2.2 6.2-6.2 6.2"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** favicon 版本：自带底色方块，供 index.html / og 图直接引用 */
export const BRAND_MARK_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0071e3"/><path d="M8.35 12.05L12.95 7.45M12.95 7.45V24.65M12.95 7.45h4.6c4 0 6.2 2.4 6.2 6.2s-2.2 6.2-6.2 6.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

