import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地联调时允许把接口指向别的后端（例如 8080 被别的服务占用时另起一个实例）
const apiTarget = process.env.PURE_API_TARGET ?? 'http://127.0.0.1:8080';

const pkg = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version?: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? 'dev'),
  },
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
