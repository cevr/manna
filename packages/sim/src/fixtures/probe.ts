/**
 * An app no one ships, for the package's own tests: every value differs
 * from every other (the simulator from the driver session, the bundle from
 * the scheme) and from any real app's, so a step that reads the wrong field,
 * or a value of its own, names something the test does not expect.
 */
import { defineApp } from '../app.ts';

export const probeApp = defineApp({
  displayName: 'the probe',
  simulator: 'probe-sim',
  deviceType: 'iPhone Probe',
  bundleId: 'app.probe.drive',
  urlScheme: 'probe',
  driverSession: 'probe-session',
  ports: { min: 9100, max: 9109, default: 9104 },
  readyTarget: 'label=Probe Ready',
  platforms: ['ios', 'web'],
  ios: {
    workspace: 'native/Probe.xcworkspace',
    scheme: 'ProbeScheme',
    app: 'Probe Drive.app',
    infoPlist: 'native/ProbeInfo/Info.plist',
    logProcess: 'ProbeProcess',
  },
  openPrompt: 'label="Open in “Probe”?"',
  cleanPaths: ['native/build', 'web-out'],
});
