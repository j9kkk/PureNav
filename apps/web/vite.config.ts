import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地联调时允许把接口指向别的后端（例如 8080 被别的服务占用时另起一个实例）
const apiTarget = process.env.PURE_API_TARGET ?? 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: Number(process.env.PURE_WEB_PORT ?? 5173),
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/health': apiTarget,
    },
  },
});
