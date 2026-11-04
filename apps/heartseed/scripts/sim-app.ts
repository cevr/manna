/**
 * Heartseed as `@manna/sim` drives it: the `verify-heartseed` simulator (an
 * iPhone 17), the `app.heartseed` bundle and its `heartseed://` links, ports
 * 8280-8289, Today showing its reference as the sign the passage has bundled
 * and drawn, iOS alone, the native project One's prebuild writes under
 * `ios/`, and the build folder `down --clean` deletes.
 */
import { defineApp } from '@manna/sim/app';

export const app = defineApp({
  displayName: 'Heartseed',
  simulator: 'verify-heartseed',
  deviceType: 'iPhone 17',
  bundleId: 'app.heartseed',
  urlScheme: 'heartseed',
  driverSession: 'verify-heartseed',
  ports: { min: 8280, max: 8289, default: 8280 },
  readyTarget: 'label=Isaiah 41:10',
  platforms: ['ios'],
  ios: {
    workspace: 'ios/Heartseed.xcworkspace',
    scheme: 'Heartseed',
    app: 'Heartseed.app',
    infoPlist: 'ios/Heartseed/Info.plist',
    logProcess: 'Heartseed',
  },
  openPrompt: 'label="Open in “Heartseed”?"',
  cleanPaths: ['ios/build'],
});
