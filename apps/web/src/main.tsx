import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './glass.css';
import { App } from './App';
import { initLiquidGlass } from './lib/liquidGlass';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 材质要在首屏渲染之后再量尺寸建滤镜
requestAnimationFrame(() => initLiquidGlass());
