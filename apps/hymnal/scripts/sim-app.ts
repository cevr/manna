/**
 * The hymnal as `@manna/sim` drives it: the `verify-hymnal` simulator, the
 * `im.cvr.hymnal` bundle and its `hymnal://` links, ports 8270-8279, the
 * Hymns list as the sign it has drawn, iOS and the web, the native project
 * under `ios/`, and the build output `down --clean` deletes.
 */
import { defineApp } from '@manna/sim/app';

export const app = defineApp({
  displayName: 'the hymnal',
  simulator: 'verify-hymnal',
  deviceType: 'iPhone 18 Pro',
  bundleId: 'im.cvr.hymnal',
  urlScheme: 'hymnal',
  driverSession: 'verify-hymnal',
  ports: { min: 8270, max: 8279, default: 8270 },
  readyTarget: 'label=Hymns',
  platforms: ['ios', 'web'],
  ios: {
    workspace: 'ios/Hymnal.xcworkspace',
    scheme: 'Hymnal',
    app: 'Hymnal.app',
    infoPlist: 'ios/Hymnal/Info.plist',
    logProcess: 'Hymnal',
  },
  openPrompt: 'label="Open in “Hymnal”?"',
  cleanPaths: ['ios/build', 'ios/Pods', 'dist'],
});
