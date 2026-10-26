import { useEffect, useRef, useState } from 'react';
import { detectIconVariant, type IconVariant } from './iconTone';

/**
 * 图标加载状态。
 *
 * 图片若命中浏览器缓存，`load` 事件可能在 React 挂上监听之前就结束了，
 * 这时 onLoad 永远不会触发，图标会一直停在字母占位（刷新时最常见的观感就是
 * 「图标时好时坏」）。所以挂载后主动查一次 `complete`，把漏掉的那次补上。
 */
export function useIconImage(src: string | null) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [variant, setVariant] = useState<IconVariant>('inset');

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
    setVariant('inset');
  }, [src]);

  useEffect(() => {
    const img = ref.current;
    if (!img || !src) return;
    // 缓存命中：load 已经发生过，不会再有事件。
    if (img.complete) {
      if (img.naturalWidth > 0) {
        setLoaded(true);
        setBroken(false);
        setVariant(detectIconVariant(img));
      } else {
        setBroken(true);
      }
    }
  }, [src]);

  const onLoad = () => {
    const img = ref.current;
    if (!img) return;
    setLoaded(true);
    setBroken(false);
    setVariant(detectIconVariant(img));
  };

  return { ref, loaded, broken, variant, onLoad, setBroken };
}
