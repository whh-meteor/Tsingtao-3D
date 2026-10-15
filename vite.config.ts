import { defineConfig } from 'vite';
import {assetChunksPlugin} from './scripts/asset-chunks.mjs';
export default defineConfig({
  plugins: [assetChunksPlugin()],
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
