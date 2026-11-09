import { useEffect, useRef, useState } from 'react';

/**
 * 弹层退出过渡的通用 hook：受控值从非空变为 null 时，
 * 先持有最后一次非空值 rendering 一个 exit 周期（closing=true，CSS 侧用
 * data-exit 播退出动画），计时结束后才真正卸载。
 * 打开（null → 非空）立即透传，无延迟。
 */
export function useDelayedUnmount<T>(value: T | null, durationMs: number): { held: T | null; closing: boolean } {
  const [, setTick] = useState(0);
  const prevRef = useRef<T | null>(value);
  if (value !== null) {
    prevRef.current = value;
  }

  const isOpen = value !== null;

  useEffect(() => {
    if (isOpen) return;
    if (prevRef.current === null) return;
    const timer = window.setTimeout(() => {
      prevRef.current = null;
      setTick((n) => n + 1);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, durationMs]);

  if (value !== null) {
    return { held: value, closing: false };
  }
  return { held: prevRef.current, closing: prevRef.current !== null };
}
