import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { app } from './vite/app';
import { hymnal } from './vite/hymnal';

export default defineConfig({
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
        bundlerOptions: { plugins: [hymnal()] },
        app,
      },
    }),
  ],
});
