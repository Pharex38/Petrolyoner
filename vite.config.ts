import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // host: true → aynı ağdaki telefondan da açılır, gerçek cihazda test için.
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});
