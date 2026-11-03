import { useEffect, useRef, useState } from 'react';

/**
 * 弹层退出过渡的通用 hook：受控值从非空变为 null 时，
 * 先持有最后一次非空值 rendering 一个 exit 周期（closing=true，CSS 侧用
 * data-exit 播退出动画），计时结束后才真正卸载。
 * 打开（null → 非空）立即透传，无延迟。
 */
export function useDelayedUnmount<T>(value: T | null, durationMs: number): { held: T | null; closing: boolean } {
  const [state, setState] = useState<{ held: T | null; closing: boolean }>({ held: value, closing: false });
  const prevRef = useRef(value);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (value !== null) {
      window.clearTimeout(timerRef.current);
      prevRef.current = value;
      setState({ held: value, closing: false });
      return;
    }
    const prev = prevRef.current;
    if (prev === null) {
      setState({ held: null, closing: false });
      return;
    }
    setState({ held: prev, closing: true });
    timerRef.current = window.setTimeout(() => {
      prevRef.current = null;
      setState({ held: null, closing: false });
    }, durationMs);
    return () => window.clearTimeout(timerRef.current);
  }, [value, durationMs]);

  return state;
}
