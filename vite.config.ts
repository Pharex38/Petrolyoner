import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // host: true → aynı ağdaki telefondan da açılır, gerçek cihazda test için.
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Three.js'i tek 500+ kB dosyada bırakma. Rolldown, modül sınırlarından
        // yaklaşık 320 kB'lık önbelleklenebilir renderer/core parçaları üretir.
        codeSplitting: {
          minSize: 24_000,
          maxSize: 320_000,
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]/,
              priority: 10,
              maxSize: 320_000,
            },
          ],
        },
      },
    },
  },
});
