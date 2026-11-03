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

// 直接建：内部自带「首帧后再量一次」，不能依赖 rAF —— 后台标签的 rAF 是停的
initLiquidGlass();
