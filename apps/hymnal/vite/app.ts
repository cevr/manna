/**
 * The native app's manifest, which One's prebuild reads (`vite.config.ts`
 * passes it as `native.app`). It lives here so a unit test reads it without
 * loading `one/vite`. The icons are drawn by `bun run icon`
 * (`scripts/icon.ts`) from `assets/icon/wheat.svg`, in Heartseed's colours
 * (`src/icon-colours.ts`): its gold blade on its garden ink, and on its night
 * ground in dark. The launch screen stands on Heartseed's page grounds.
 */
import type { NativeAppManifest } from 'one/native';

import { icon, launch } from '../src/icon-colours';

export const app = {
  name: 'Hymnal',
  icon: {
    source: './assets/icon/ios-light.png',
    backgroundColor: icon.light.ground,
    dark: { source: './assets/icon/ios-dark.png', backgroundColor: icon.dark.ground },
    tinted: { source: './assets/icon/ios-tinted.png', backgroundColor: icon.tinted.ground },
  },
  splash: {
    source: './public/splash.png',
    backgroundColor: launch.light.ground,
    width: 200,
    dark: { source: './public/splash-dark.png', backgroundColor: launch.dark.ground },
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
      backgroundColor: icon.light.ground,
      monochrome: './assets/icon/android-monochrome.png',
    },
  },
} satisfies NativeAppManifest;
