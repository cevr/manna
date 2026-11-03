/**
 * The app a drive drives, as data: its simulator, bundle, URL scheme,
 * driver session, port range, readiness target, platforms, native build
 * and the build output `down --clean` deletes. Every app-specific value the
 * driver uses comes from one `App`; the driver holds none of its own.
 */
import { Schema } from 'effect';

import { Platform } from './result.ts';

const Text = Schema.NonEmptyString;

const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }));

/** A path under the app's folder: relative, no `..` segment, never the folder itself. */
const isInside = (path: string) => {
  if (path.startsWith('/')) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '..') && segments.some((s) => s !== '.' && s);
};

const AppPath = Text.check(
  Schema.makeFilter((path) => isInside(path) || `${path} is not a path inside the app`),
);

/** A file name with no folder: the built `.app` bundle's. */
const BundleName = Text.check(
  Schema.makeFilter(
    (name) => (/^[^/]+\.app$/.test(name) && name !== '.app') || `${name} is no .app bundle name`,
  ),
);

/** The app's dev server ports: `boot --port` takes any of `min`-`max`, and `default` unasked. */
const Ports = Schema.Struct({ min: Port, max: Port, default: Port }).check(
  Schema.makeFilter(
    (ports) =>
      (ports.min <= ports.default && ports.default <= ports.max) ||
      `ports need min <= default <= max, not ${ports.min}, ${ports.default}, ${ports.max}`,
  ),
);

/** The native project, every path relative to the app's folder. */
const Ios = Schema.Struct({
  /** The `.xcworkspace` the build opens; its folder is the native folder, whose `build/` holds the build. */
  workspace: AppPath.check(
    Schema.makeFilter((path) => path.endsWith('.xcworkspace') || `${path} is no .xcworkspace`),
  ),
  /** The Xcode scheme the build builds. */
  scheme: Text,
  /** The built bundle's file name, as `Hymnal.app`. */
  app: BundleName,
  /** The source Info.plist `install` registers the URL scheme in. */
  infoPlist: AppPath,
  /** The process name the app's unified log is read for. */
  logProcess: Text,
});

export const App = Schema.Struct({
  /** How help names the app, as a noun phrase: `the hymnal`. */
  displayName: Text,
  /** The simulator the drive creates, boots and shuts down; never another. */
  simulator: Text,
  /** The device type a new simulator takes. */
  deviceType: Text,
  bundleId: Schema.String.check(
    Schema.isPattern(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, {
      message: 'a bundle id is dot-separated letters, digits and hyphens',
    }),
  ),
  /** The URL scheme a deep link opens on iOS, registered by `install`. */
  urlScheme: Schema.String.check(
    Schema.isPattern(/^[A-Za-z][A-Za-z0-9+.-]*$/, {
      message: 'a URL scheme is a letter, then letters, digits, +, . or -',
    }),
  ),
  /** The drivers' session name, for agent-device and agent-browser alike. */
  driverSession: Text,
  ports: Ports,
  /** What `install` waits for, unasked, once the app has drawn. */
  readyTarget: Text,
  /** Where the app runs; iOS always. */
  platforms: Schema.NonEmptyArray(Platform).check(
    Schema.makeFilter(
      (platforms) =>
        (platforms.includes('ios') && new Set(platforms).size === platforms.length) ||
        `platforms ${platforms.join(', ')} must include ios, each once`,
    ),
  ),
  ios: Ios,
  /** The system's question, as an agent-device selector, before it hands a deep link to the app. */
  openPrompt: Text,
  /** What `down --clean` deletes under the app, for good. */
  cleanPaths: Schema.Array(AppPath),
});
export interface App extends Schema.Schema.Type<typeof App> {}

/** An app's data, checked: a value outside its domain throws where the app declares it. */
export const defineApp = Schema.decodeUnknownSync(App);

/** The app checked again where a drive starts, before any step: a bad one is a defect. */
export const checkApp = Schema.decodeUnknownEffect(App);
