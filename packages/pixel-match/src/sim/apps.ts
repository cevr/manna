/**
 * The One apps as `@manna/sim` drives them for the references: each on a
 * simulator of its own (`verify-heartseed-one`, `verify-hymnal-one`, an
 * iPhone 17 as the Exact ports' are), never the owner's `verify-heartseed`
 * or `verify-hymnal`. Pictures are this work's purpose, so neither is
 * quiet. The bundle, scheme, native project and store are the apps' own
 * (`apps/<app>/scripts/sim-app.ts`), the ports the spec's.
 */
import { defineApp } from '@manna/sim/app';

export const heartseedOne = defineApp({
  displayName: 'Heartseed (One reference)',
  simulator: 'verify-heartseed-one',
  deviceType: 'iPhone 17',
  bundleId: 'app.heartseed',
  urlScheme: 'heartseed',
  driverSession: 'verify-heartseed-one',
  ports: { min: 8290, max: 8294, default: 8290 },
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
  store: { file: 'Library/one-kv-heartseed.sqlite', table: 'one_kv' },
});

export const hymnalOne = defineApp({
  displayName: 'the hymnal (One reference)',
  simulator: 'verify-hymnal-one',
  deviceType: 'iPhone 17',
  bundleId: 'im.cvr.hymnal',
  urlScheme: 'hymnal',
  driverSession: 'verify-hymnal-one',
  ports: { min: 8260, max: 8264, default: 8260 },
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
  cleanPaths: ['ios/build'],
  store: { file: 'Library/one-kv-hymnal.sqlite', table: 'one_kv' },
});
