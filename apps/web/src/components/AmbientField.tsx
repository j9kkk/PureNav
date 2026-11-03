import { useEffect, useMemo, useRef } from 'react';

/**
 * 环境层（内容层的地面）
 * ---------------------------------------------------------------------------
 * 玻璃之所以像玻璃，取决于它背后有没有东西可透、可折：
 *   · 光圈（bokeh）：大而柔的低频色块，负责“透光”和深度
 *   · 粒子：小而锐的高频点，负责让边缘折射真的看得出来
 *
 * 分工是为了性能：光圈是重活（4 个全屏径向渐变），只在种子/尺寸变化时画一帧，
 * 之后完全不动，零 rAF；粒子改由 DOM 小圆点 + CSS 合成动画承担，
 * 只走合成线程，1.7k 张卡片下也不会触发重绘，所以可以一直动。
 *
 * @param count 粒子数量。
 */

type Bokeh = { x: number; y: number; r: number; rgb: string; alpha: number };

const BOKEH: Bokeh[] = [
  { x: 0.12, y: 0.02, r: 0.46, rgb: '14, 132, 255', alpha: 0.34 },
  { x: 0.82, y: 0.06, r: 0.38, rgb: '123, 97, 255', alpha: 0.26 },
  { x: 0.62, y: 0.62, r: 0.5, rgb: '46, 167, 255', alpha: 0.16 },
  { x: 0.18, y: 0.84, r: 0.4, rgb: '143, 107, 255', alpha: 0.13 },
];

const RENDER_SCALE = 0.5;

type Dot = {
  key: number;
  left: string;
  top: string;
  size: number;
  blur: number;
  opacity: number;
  dur: number;
  delay: number;
  drift: number;
};

function makeDots(count: number): Dot[] {
  return Array.from({ length: count }, (_, i) => {
    const size = 1.4 + Math.random() * 2.6;
    return {
      key: i,
      left: `${(Math.random() * 100).toFixed(2)}%`,
      top: `${(Math.random() * 100).toFixed(2)}%`,
      size,
      blur: size > 2.6 ? 1.2 : 0,
      opacity: 0.28 + Math.random() * 0.42,
      dur: 22 + Math.random() * 26,
      delay: -Math.random() * 48,
      drift: (Math.random() - 0.5) * 90,
    };
  });
}

export function AmbientField({ count = 48 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dots = useMemo(() => makeDots(count), [count]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = Math.max(2, Math.round(innerWidth * RENDER_SCALE));
      const height = Math.max(2, Math.round(innerHeight * RENDER_SCALE));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < BOKEH.length; i++) {
        const b = BOKEH[i]!;
        const cx = b.x * width;
        const cy = b.y * height;
        const radius = b.r * Math.max(width, height);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(${b.rgb}, ${b.alpha})`);
        g.addColorStop(0.55, `rgba(${b.rgb}, ${b.alpha * 0.35})`);
        g.addColorStop(1, `rgba(${b.rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
    };

    draw();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(draw, 160);
    };

    addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(resizeTimer);
      removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <div className="ambient-aurora" aria-hidden="true" />
      <canvas ref={canvasRef} className="ambient-bokeh" aria-hidden="true" />
      <div className="ambient-dots" aria-hidden="true">
        {dots.map((d) => (
          <i
            key={d.key}
            style={{
              left: d.left,
              top: d.top,
              width: d.size,
              height: d.size,
              opacity: d.opacity,
              filter: d.blur ? `blur(${d.blur}px)` : undefined,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
              ['--dot-drift' as string]: `${d.drift}px`,
            }}
          />
        ))}
      </div>
    </>
  );
}
