import { PALETTE } from '@manna/brand';
import type { NativeAppManifest } from 'one/native';

import { theme } from '../src/theme';

export const app = {
  name: 'Hymnal',
  icon: {
    source: './assets/icon/ios-light.png',
    backgroundColor: PALETTE.wheat,
    dark: { source: './assets/icon/ios-dark.png', backgroundColor: PALETTE.night },
    tinted: { source: './assets/icon/ios-tinted.png', backgroundColor: '#000000' },
  },
  splash: {
    source: './public/splash.png',
    backgroundColor: theme.light.ground,
    width: 200,
    dark: { source: './public/splash-dark.png', backgroundColor: theme.dark.ground },
  },
  ios: { bundleId: 'im.cvr.hymnal', deploymentTarget: '17.0' },
  audio: {
    background: true,
    microphone: 'Hymnal listens to your guitar to tune it. Nothing is recorded or kept.',
  },
  android: {
    applicationId: 'im.cvr.hymnal',
    adaptiveIcon: {
      foreground: './assets/icon/android-foreground.png',
      backgroundColor: PALETTE.wheat,
      monochrome: './assets/icon/android-monochrome.png',
    },
  },
} satisfies NativeAppManifest;
