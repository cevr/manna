import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { app } from './vite/app';
import { hymnal } from './vite/hymnal';
import { sdkRuntime } from './vite/sdkruntime';

export default defineConfig({
  // The web dev client loads Reanimated from its source, which imports a CommonJS script for its
  // default export; prebundled, the script has one, so the layout's route loads (D3).
  optimizeDeps: { include: ['react-native-reanimated/scripts/validate-worklets-version'] },
  plugins: [
    hymnal(),
    one({
      web: { defaultRenderMode: 'ssg' },
      build: { server: { unified: true } },
      native: {
        // The native bundle is its own rolldown build: it takes the words too.
        bundlerOptions: { plugins: [hymnal(), sdkRuntime()] },
        app,
      },
    }),
  ],
});
