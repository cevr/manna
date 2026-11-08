/**
 * The native app's manifest, which One's prebuild reads (`vite.config.ts`
 * passes it as `native.app`). It lives here so a unit test reads it without
 * loading `one/vite`. `speech` makes prebuild write the two prompts iOS
 * shows before Heartseed first listens: speech recognition and the
 * microphone.
 */
import type { NativeAppManifest } from 'one/native';

export const app = {
  name: 'Heartseed',
  ios: { bundleId: 'app.heartseed', deploymentTarget: '18.0' },
  android: { applicationId: 'app.heartseed' },
  speech: {
    recognition:
      'Heartseed listens while you say a verse, so each word lights as you say it. It listens on your iPhone and sends nothing away.',
    microphone:
      'Heartseed listens while you say a verse, so each word lights as you say it. Nothing is recorded or sent.',
  },
} satisfies NativeAppManifest;
