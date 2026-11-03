import { useEffect, useRef } from 'react';

/**
 * 环境层（内容层的地面）
 * ---------------------------------------------------------------------------
 * 玻璃之所以像玻璃，取决于它背后有没有东西可透、可折：
 *   · 光圈（bokeh）：大而柔的低频色块，负责“透光”和深度
 *   · 粒子：小而锐的高频点，负责让边缘折射真的看得出来
 *
 * 实现上一个 canvas 全包：0.5 倍分辨率、30fps 封顶、静态时只画一帧。
 * 早期版本用多个 vmax 尺寸的 DOM 渐变层，叠在 1.7k 张卡片之后会把渲染进程
 * 堵死（rAF 完全不触发），所以不再用 DOM 图层。
 *
 * @param animate 是否持续运动。内容量大时必须关掉。
 */

type Bokeh = { x: number; y: number; r: number; rgb: string; alpha: number };
type Particle = { x: number; y: number; r: number; vx: number; vy: number; a: number };

const BOKEH: Bokeh[] = [
  { x: 0.12, y: 0.02, r: 0.46, rgb: '14, 132, 255', alpha: 0.34 },
  { x: 0.82, y: 0.06, r: 0.38, rgb: '123, 97, 255', alpha: 0.26 },
  { x: 0.62, y: 0.62, r: 0.5, rgb: '46, 167, 255', alpha: 0.16 },
  { x: 0.18, y: 0.84, r: 0.4, rgb: '143, 107, 255', alpha: 0.13 },
];

const PARTICLE_COUNT = 56;
const RENDER_SCALE = 0.5;
const FPS_CAP = 30;

export function AmbientField({ animate = true }: { animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const seed = () => {
      width = Math.max(2, Math.round(innerWidth * RENDER_SCALE));
      height = Math.max(2, Math.round(innerHeight * RENDER_SCALE));
      canvas.width = width;
      canvas.height = height;
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: (0.7 + Math.random() * 1.4) * RENDER_SCALE * 2,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.02 - Math.random() * 0.05,
        a: 0.1 + Math.random() * 0.22,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // 光圈：随 t 极慢漂移，制造低频透光
      for (let i = 0; i < BOKEH.length; i++) {
        const b = BOKEH[i]!;
        const cx = (b.x + Math.sin(t / 9000 + i * 1.7) * 0.02) * width;
        const cy = (b.y + Math.cos(t / 11000 + i * 2.1) * 0.02) * height;
        const radius = b.r * Math.max(width, height);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(${b.rgb}, ${b.alpha})`);
        g.addColorStop(0.55, `rgba(${b.rgb}, ${b.alpha * 0.35})`);
        g.addColorStop(1, `rgba(${b.rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      // 粒子：高频细节，给边缘折射当“内容”
      for (const p of particles) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -6) {
          p.y = height + 6;
          p.x = Math.random() * width;
        }
        if (p.x < -6) p.x = width + 6;
        if (p.x > width + 6) p.x = -6;
      }
    };

    let frame = 0;
    let last = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS_CAP) return;
      last = now;
      step();
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (reducedMotion.matches || !animate) {
        draw(performance.now()); // 降级 / 大库：只画一帧
        return;
      }
      last = 0;
      frame = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else start();
    };

    seed();
    start();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        seed();
        start();
      }, 160);
    };

    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', start);
    };
  }, [animate]);

  return (
    <>
      <div className="ambient-aurora" aria-hidden="true" />
      <canvas ref={canvasRef} className="ambient-particles" aria-hidden="true" />
    </>
  );
}
