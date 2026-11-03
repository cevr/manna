import {
  Config,
  Effect,
  FileSystem,
  Match,
  Option,
  Order,
  Path,
  Schema,
  type Scope,
  Semaphore,
} from 'effect';
import { gpuLauncher, throughGpuLauncher } from './chrome-gpu.ts';
import { PROFILE_ROOT, profileFolder } from './chrome-profile.ts';
import { BrowserFailed, BrowserMissing } from './errors.ts';

const chromeArgs = (argv: ReadonlyArray<string>): ReadonlyArray<string> => [
  '--mute-audio',
  '--disable-audio-output',
  ...argv,
];

const LAUNCHER = 'film-gpu-launcher';

interface ViewOptions {
  readonly width: number;
  readonly height: number;
  readonly console?: (type: string, ...args: ReadonlyArray<unknown>) => void;
}

interface Spawned {
  readonly flags: string;
  readonly path: Option.Option<string>;
  readonly profile: string;
}

let spawned: Option.Option<Spawned> = Option.none();

const opening = Semaphore.makeUnsafe(1);

const SPAWN_FAILED = 'ERR_DLOPEN_FAILED';

const PATH_BROWSERS = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
  'brave-browser',
  'microsoft-edge',
  'chrome',
];

const MAC_BROWSERS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Chromium.app/Contents/MacOS/Chromium',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const macShell = (arch: string): ReadonlyArray<string> =>
  Match.value(arch).pipe(
    Match.when(
      (cpu) => cpu === 'arm64' || cpu === 'x64',
      (cpu) => [`chrome-headless-shell-mac-${cpu}/chrome-headless-shell`],
    ),
    Match.orElse(() => []),
  );

const PLAYWRIGHT_CACHES = [['Library', 'Caches', 'ms-playwright']];

const PLAYWRIGHT_BINARIES = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
];

const newestIn = (cache: string, prefix: string, binaries: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const byRevision = Order.mapInput(Order.Number, (name: string) =>
      Number(name.slice(prefix.length)),
    );
    const revisions = (yield* fs.readDirectory(cache))
      .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
      .toSorted(Order.flip(byRevision));
    return yield* Effect.findFirst(
      revisions.flatMap((revision) => binaries.map((binary) => path.join(cache, revision, binary))),
      (file) => fs.exists(file),
    );
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

const firstFound = (
  effects: ReadonlyArray<
    Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path>
  >,
) =>
  Effect.reduce(
    effects,
    () => Option.none<string>(),
    (found, next) =>
      Option.match(found, { onSome: () => Effect.succeed(found), onNone: () => next }),
  );

const playwrightChromium = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  return yield* firstFound(
    PLAYWRIGHT_CACHES.map((cache) =>
      newestIn(path.join(home, ...cache), 'chromium-', PLAYWRIGHT_BINARIES),
    ),
  );
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

const existing = (files: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.findFirst(files, (file) => fs.exists(file));
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

const bunSearch = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  const search = yield* Config.String('PATH').pipe(Config.withDefault(''));
  const folders = ['/Applications', path.join(home, 'Applications')];
  return yield* firstFound([
    Effect.sync(() =>
      Option.firstSomeOf(
        PATH_BROWSERS.map((name) => Option.fromNullishOr(Bun.which(name, { PATH: search }))),
      ),
    ),
    existing(
      MAC_BROWSERS.flatMap((browser) => folders.map((folder) => path.join(folder, browser))),
    ),
    newestIn(
      path.join(home, 'Library', 'Caches', 'ms-playwright'),
      'chromium_headless_shell-',
      macShell(process.arch),
    ),
  ]);
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

const spawnView = (
  path: Option.Option<string>,
  argv: ReadonlyArray<string>,
  profile: string,
  options: ViewOptions,
) =>
  Effect.try({
    try: () =>
      Option.some(
        new Bun.WebView({
          ...options,
          dataStore: { directory: profile },
          backend: {
            type: 'chrome',
            url: false,
            ...Option.match(path, { onNone: () => ({}), onSome: (p) => ({ path: p }) }),
            argv: [...argv],
          },
        }),
      ),
    catch: (cause) => ({
      missing: Reflect.get(Object(cause), 'code') === SPAWN_FAILED,
      failed: BrowserFailed.make({ reason: String(cause) }),
    }),
  }).pipe(
    Effect.catch((spawn) => {
      if (spawn.missing) return Effect.succeedNone;
      return Effect.fail(spawn.failed);
    }),
  );

interface FirstView {
  readonly view: Bun.WebView;
  readonly path: Option.Option<string>;
}

const gpuView = (
  named: Option.Option<string>,
  argv: ReadonlyArray<string>,
  profile: string,
  options: ViewOptions,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const chrome = yield* Option.match(named, {
      onSome: (file) => existing([file]),
      onNone: () => firstFound([bunSearch, playwrightChromium]),
    });
    const file = yield* Effect.fromOption(chrome, () =>
      BrowserMissing.make({ executable: Option.getOrElse(named, () => 'Chrome or Chromium') }),
    );
    const launcher = path.join(profile, LAUNCHER);
    const written = `${launcher}.${process.pid}`;
    yield* fs.writeFileString(written, gpuLauncher(file), { mode: 0o755 }).pipe(
      Effect.andThen(fs.rename(written, launcher)),
      Effect.mapError((cause) => BrowserFailed.make({ reason: String(cause) })),
    );
    const view = yield* spawnView(Option.some(launcher), argv, profile, options);
    return yield* Effect.fromOption(view, () =>
      BrowserFailed.make({
        reason: `the GPU launcher ${launcher} (for ${file}) could not be spawned: is its folder on a noexec mount?`,
      }),
    ).pipe(Effect.map((opened): FirstView => ({ view: opened, path: Option.some(launcher) })));
  });

const chosenView = (
  named: Option.Option<string>,
  argv: ReadonlyArray<string>,
  profile: string,
  options: ViewOptions,
) =>
  Effect.gen(function* () {
    const opened = (view: Bun.WebView, path: Option.Option<string>): FirstView => ({ view, path });
    if (throughGpuLauncher(process.platform, argv))
      return yield* gpuView(named, argv, profile, options);
    if (Option.isSome(named))
      return yield* Effect.flatMap(spawnView(named, argv, profile, options), (view) =>
        Effect.fromOption(
          Option.map(view, (v) => opened(v, named)),
          () => BrowserMissing.make({ executable: named.value }),
        ),
      );
    const found = yield* spawnView(Option.none(), argv, profile, options);
    if (Option.isSome(found)) return opened(found.value, Option.none());
    const cached = yield* playwrightChromium;
    const view = yield* Option.match(cached, {
      onNone: () => Effect.succeed(Option.none<Bun.WebView>()),
      onSome: (file) => spawnView(Option.some(file), argv, profile, options),
    });
    return yield* Effect.fromOption(
      Option.map(view, (v) => opened(v, cached)),
      () =>
        BrowserMissing.make({
          executable: Option.getOrElse(cached, () => 'Chrome or Chromium'),
        }),
    );
  });

const firstView = (argv: ReadonlyArray<string>, options: ViewOptions) =>
  Effect.gen(function* () {
    const root = yield* Config.String('FILM_CHROME_PROFILES').pipe(
      Config.withDefault(PROFILE_ROOT),
      Effect.orDie,
    );
    const profile = yield* profileFolder(root);
    const named = yield* Config.option(Config.String('BUN_CHROME_PATH')).pipe(Effect.orDie);
    const first = yield* chosenView(named, argv, profile, options);
    return { ...first, profile };
  });

export const openView = (
  requested: ReadonlyArray<string>,
  options: ViewOptions,
): Effect.Effect<
  Bun.WebView,
  BrowserMissing | BrowserFailed,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> => {
  const argv = chromeArgs(requested);
  const flags = argv.join(' ');
  return Effect.acquireRelease(
    opening.withPermits(1)(
      Effect.suspend(() =>
        Option.match(spawned, {
          onNone: () =>
            Effect.map(firstView(argv, options), (first) => {
              spawned = Option.some({ flags, path: first.path, profile: first.profile });
              return first.view;
            }),
          onSome: (running) => {
            if (running.flags !== flags)
              return Effect.fail(
                BrowserFailed.make({
                  reason: `this process's Chrome runs with "${running.flags}", not "${flags}": Bun spawns one Chrome per process`,
                }),
              );
            return Effect.flatMap(spawnView(running.path, argv, running.profile, options), (view) =>
              Effect.fromOption(view, () =>
                BrowserMissing.make({
                  executable: Option.getOrElse(running.path, () => 'Chrome or Chromium'),
                }),
              ),
            );
          },
        }),
      ),
    ),
    (view) => Effect.sync(() => view.close()),
  );
};

const Thrown = Schema.Struct({
  exceptionDetails: Schema.Struct({
    text: Schema.String,
    exception: Schema.optionalKey(
      Schema.Struct({ description: Schema.optionalKey(Schema.String) }),
    ),
  }),
});

export const thrownBy = (event: Event): Option.Option<string> =>
  Option.map(Schema.decodeUnknownOption(Thrown)(Reflect.get(event, 'data')), (thrown) =>
    Option.getOrElse(
      Option.flatMap(Option.fromUndefinedOr(thrown.exceptionDetails.exception), (e) =>
        Option.fromUndefinedOr(e.description),
      ),
      () => thrown.exceptionDetails.text,
    ),
  );
