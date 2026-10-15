import { defineConfig } from 'vite';
import {assetChunksPlugin} from './scripts/asset-chunks.mjs';
import {startupGraphGuard} from './scripts/startup-graph.mjs';
export default defineConfig({
  plugins: [assetChunksPlugin(),startupGraphGuard()],
  build: {
    rollupOptions: {
      output: {
        // Do not pull Vite's shared preload helper into the engine vendor chunk.
        // The entry must execute before downloading any three-dimensional engine.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          // Keep this shared helper stable so shell/UI edits do not invalidate
          // the entire engine through an import back into the HTML entry.
          if (id.includes('vite/preload-helper')) return 'loader-runtime';
          if (id.includes('/@babylonjs/')) return 'babylon';
        },
      },
    },
  },
});
