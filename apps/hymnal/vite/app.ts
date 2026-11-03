/**
 * The native app's manifest, which One's prebuild reads (`vite.config.ts`
 * passes it as `native.app`). It lives here so a unit test reads it without
 * loading `one/vite`. The icons are drawn by `bun run icon`
 * (`scripts/icon.ts`) from `assets/icon/wheat.svg`, in the brand's Moonlit
 * wheat: the night's blade on the wheat, and the wheat's on the night in dark.
 */
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
