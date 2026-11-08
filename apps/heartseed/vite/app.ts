/**
 * The native app's manifest, which One's prebuild reads (`vite.config.ts`
 * passes it as `native.app`). It lives here so a unit test reads it without
 * loading `one/vite`. `speech` makes prebuild write the two prompts iOS
 * shows before Heartseed first listens: speech recognition and the
 * microphone.
 *
 * The icons and the launch screens' artwork are drawn by `bun run icon`
 * (`scripts/icon.ts`) from `assets/icon/heartseed.svg`, and every colour
 * here is read from `src/theme.ts`: the icon on its own ground, and the
 * launch screen the mark in the app's ink on the app's ground, light and
 * dark. The appearance is left to the system. A native build reads new
 * icons only after `bun run prebuild:native`.
 */
import type { NativeAppManifest } from 'one/native';

import { icon, theme } from '../src/theme';

export const app = {
  name: 'Heartseed',
  icon: {
    source: './assets/icon/ios-light.png',
    backgroundColor: icon.light.ground,
    dark: { source: './assets/icon/ios-dark.png', backgroundColor: icon.dark.ground },
    tinted: { source: './assets/icon/ios-tinted.png', backgroundColor: icon.tinted.ground },
  },
  splash: {
    source: './assets/icon/splash.png',
    backgroundColor: theme.light.ground,
    width: 224,
    dark: { source: './assets/icon/splash-dark.png', backgroundColor: theme.dark.ground },
  },
  ios: { bundleId: 'app.heartseed', deploymentTarget: '18.0' },
  android: {
    applicationId: 'app.heartseed',
    adaptiveIcon: {
      foreground: './assets/icon/android-foreground.png',
      backgroundColor: icon.light.ground,
      monochrome: './assets/icon/android-monochrome.png',
    },
  },
  speech: {
    recognition:
      'Heartseed listens while you say a verse, so each word lights as you say it. It listens on your iPhone and sends nothing away.',
    microphone:
      'Heartseed listens while you say a verse, so each word lights as you say it. Nothing is recorded or sent.',
  },
} satisfies NativeAppManifest;
