import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { app } from './vite/app.ts';
import { passage } from './vite/plugin.ts';

export default defineConfig({
  plugins: [
    passage(),
    one({
      web: { defaultRenderMode: 'spa' },
      native: {
        bundlerOptions: { plugins: [passage()] },
        app,
      },
    }),
  ],
});
