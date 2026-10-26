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
  // The wheat, drawn by `bun run icon`, centred 200 points wide on the app's
  // own ground, so the launch screen gives way to the first screen with no
  // change of colour; the dark launch screen reverses it.
  splash: {
    source: './public/splash.png',
    backgroundColor: theme.light.ground,
    width: 200,
    dark: { source: './public/splash-dark.png', backgroundColor: theme.dark.ground },
  },
  ios: { bundleId: 'im.cvr.hymnal', deploymentTarget: '17.0' },
  // A recording plays on with the screen locked, under the lock
  // screen's and Control Center's controls (iOS `UIBackgroundModes`
  // audio; Android's media-playback service).
  audio: { background: true },
  android: {
    applicationId: 'im.cvr.hymnal',
    adaptiveIcon: {
      foreground: './assets/icon/android-foreground.png',
      backgroundColor: PALETTE.wheat,
      monochrome: './assets/icon/android-monochrome.png',
    },
  },
} satisfies NativeAppManifest;
