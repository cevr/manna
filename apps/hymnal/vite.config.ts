import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { app } from './vite/app';
import { hymnal } from './vite/hymnal';

export default defineConfig({
  // Gesture Handler probes Reanimated's TSX source entry. Keep that graph and its nested CommonJS
  // helpers in the web optimizer; the explicit include also invalidates existing optimizer caches.
  optimizeDeps: {
    extensions: ['.tsx'],
    include: [
      'react-native-reanimated/scripts/validate-worklets-version',
      'react-native-reanimated/src/createAnimatedComponent/AnimatedComponent',
    ],
  },
  plugins: [
    hymnal(),
    one({
      web: { defaultRenderMode: 'ssg' },
      build: { server: { unified: true } },
      native: {
        // The native bundle is its own rolldown build: it takes the words too.
        bundlerOptions: { plugins: [hymnal()] },
        app,
      },
    }),
  ],
});
