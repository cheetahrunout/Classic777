import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { proxy: { '/api': 'http://127.0.0.1:8080', '/lobby': 'http://127.0.0.1:8080' } },
});
