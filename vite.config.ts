import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@babylonjs/')) return 'babylon';
        },
      },
    },
  },
});
