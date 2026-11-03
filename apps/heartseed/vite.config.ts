import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { passage } from './vite/plugin.ts';

export default defineConfig({
  plugins: [
    passage(),
    one({
      web: { defaultRenderMode: 'spa' },
      native: {
        bundlerOptions: { plugins: [passage()] },
        app: {
          name: 'Heartseed',
          ios: { bundleId: 'app.heartseed', deploymentTarget: '17.0' },
          android: { applicationId: 'app.heartseed' },
        },
      },
    }),
  ],
});
