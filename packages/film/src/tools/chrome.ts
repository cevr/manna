import type { Browser as Puppeteer, CDPSession } from 'puppeteer-core';
import {
  Boolean as Bool,
  Config,
  Deferred,
  Effect,
  FileSystem,
  Match,
  Option,
  Order,
  Path,
  Predicate,
  Schema,
  type Scope,
  Semaphore,
} from 'effect';
import { drawsOnGpu } from './chrome-gpu.ts';
import { PROFILE_ROOT, holdChrome, profileFolder, releaseChrome } from './chrome-profile.ts';
import { BrowserFailed, BrowserMissing } from './errors.ts';

/**
 * The flags every Chrome runs headless and quiet with, as Bun 1.4.4 spawned
 * its Chrome (`ChromeProcess.rs`): no first-run or default-browser prompt,
 * no extensions or background networking, no throttling of a page that is
 * hidden (a headless page always is), no rate limit on protocol calls, and
 * no startup window (each view is a window of its own).
 */
const HEADLESS = ['--headless', '--no-first-run', '--no-default-browser-check'];
const QUIET = [
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-ipc-flooding-protection',
  '--no-startup-window',
];

/**
 * The two flags that keep a Chrome silent. `--mute-audio` mutes its pages;
 * `--disable-audio-output` plays what they would play to a fake device, so
 * Chrome never opens the host's output at all (muted alone, it still held
 * it, playing silence). A page's audio still runs: its `AudioContext` keeps
 * time on the fake device's clock as on a real one, decodes and processes,
 * and a microphone is heard. `--disable-component-update` keeps Chrome from
 * downloading its components (about 130 MB) into every new profile.
 */
const SILENT = ['--mute-audio', '--disable-audio-output', '--disable-component-update'];

/** The flags the launcher owns: a caller's own profile or debugging transport is dropped. */
const OWNED = ['--user-data-dir=', '--remote-debugging-'];

/**
 * Chrome's whole command line on `platform` for a caller's `requested`
 * flags, in `profile`: Bun 1.4.4's list in its order, `--disable-gpu` unless
 * the caller asks for the GPU on macOS (`drawsOnGpu`), the silent flags,
 * then the caller's own in their order (Chrome takes the last of a repeated
 * switch), less any profile or debugging flag of theirs.
 */
export const chromeFlags = (
  platform: string,
  requested: ReadonlyArray<string>,
  profile: string,
): ReadonlyArray<string> => [
  `--user-data-dir=${profile}`,
  '--remote-debugging-pipe',
  ...HEADLESS,
  ...Bool.match(drawsOnGpu(platform, requested), {
    onTrue: () => [],
    onFalse: () => ['--disable-gpu'],
  }),
  ...QUIET,
  ...SILENT,
  ...requested.filter((flag) => !OWNED.some((owned) => flag.startsWith(owned))),
];

/** A view's viewport, and where the page's `console.*` calls go (dropped when not given). */
export interface ViewOptions {
  readonly width: number;
  readonly height: number;
  readonly console?: (type: string, ...args: ReadonlyArray<unknown>) => void;
}

/**
 * A tab of this process's Chrome, in a window of its own, driven over its
 * own protocol session. Its events are the page's protocol events by
 * method name (`Runtime.exceptionThrown`, `Fetch.requestPaused`, …), each a
 * `MessageEvent` whose `data` is the event's params.
 */
export interface View extends EventTarget {
  /** Load `url`; resolves on the page's load event. */
  readonly navigate: (url: string) => Promise<void>;
  /** Run `script` as an expression (awaited) in the page; its value as JSON, or the error it threw. */
  readonly evaluate: <A = unknown>(script: string) => Promise<A>;
  /** Send `method` with `params` on the page's session: the protocol's answer. */
  readonly cdp: <A = unknown>(method: string, params?: Params) => Promise<A>;
  /** Load the page again; resolves on its load event. */
  readonly reload: () => Promise<void>;
  /** Size the page's viewport to `width` × `height` CSS pixels at one device pixel each. */
  readonly resize: (width: number, height: number) => Promise<void>;
  /** Close the tab; what was in flight on it fails. */
  readonly close: () => void;
}

/** A protocol call's params: a JSON object. */
type Params = Schema.JsonObject;

/** A protocol session as this file sends on it: any method by name. */
interface Wire {
  send(method: string, params?: Params): Promise<unknown>;
}

/** `session` as a `Wire`. */
const wireOf = (session: CDPSession): Wire => session;

/** How this process's Chrome is launched: the flags it was asked for, its executable and command line. */
interface Launch {
  readonly flags: string;
  readonly executable: string;
  readonly argv: ReadonlyArray<string>;
}

/** A Chrome that runs: puppeteer's browser and its browser-wide protocol session. */
interface Running {
  readonly browser: Puppeteer;
  readonly session: CDPSession;
  readonly root: Wire;
}

/** How this process's Chrome is launched, once its first view opened. */
let launched: Option.Option<Launch> = Option.none();

/** This process's Chrome while it runs. */
let running: Option.Option<Running> = Option.none();

/** One view opens at a time, so views asked for at once wait for the one that launches Chrome. */
const opening = Semaphore.makeUnsafe(1);

/** A handle of Chrome's process or pipes that can hold this process's event loop open, or let it go. */
interface Held {
  readonly ref: () => unknown;
  readonly unref: () => unknown;
}

/** Whether a value is a handle with `ref` and `unref`. */
const isHeld = (value: unknown): value is Held =>
  ['ref', 'unref'].every((name) => Predicate.isFunction(Reflect.get(Object(value), name)));

/** Chrome's process and its pipes, the handles that keep this process alive while they are referenced. */
let handles: ReadonlyArray<Held> = [];

/** How many calls into Chrome are waiting on an answer. */
let waiting = 0;

/**
 * Chrome holds this process open only while a call into it waits on an
 * answer, as Bun's own Chrome did: an idle Chrome (no call out) lets a
 * script that is done exit, and its exit handler ends Chrome.
 */
const holdOpen = (change: 1 | -1) =>
  Effect.sync(() => {
    waiting += change;
    const hold = waiting > 0;
    for (const handle of handles)
      Bool.match(hold, { onTrue: () => handle.ref(), onFalse: () => handle.unref() });
  });

/** `effect`, with this process held open while it runs. */
const held = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    holdOpen(1),
    () => effect,
    () => holdOpen(-1),
  );

/**
 * The names Bun 1.4.4 looks for on `$PATH`, in its order (its
 * `ChromeProcess.rs`, `find_chrome`).
 */
const PATH_BROWSERS = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
  'brave-browser',
  'microsoft-edge',
  'chrome',
];

/** The app bundles Bun 1.4.4 looks for on macOS, each in `/Applications`, then in `~/Applications`. */
const MAC_BROWSERS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Chromium.app/Contents/MacOS/Chromium',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/** The headless shell inside its Playwright revision for CPU `arch`, as Bun 1.4.4 names it on macOS (none for another CPU). */
const macShell = (arch: string): ReadonlyArray<string> =>
  Match.value(arch).pipe(
    Match.when(
      (cpu) => cpu === 'arm64' || cpu === 'x64',
      (cpu) => [`chrome-headless-shell-mac-${cpu}/chrome-headless-shell`],
    ),
    Match.orElse(() => []),
  );

/** Playwright's browser cache under the home folder, macOS's. */
const PLAYWRIGHT_CACHES = [['Library', 'Caches', 'ms-playwright']];

/** Chromium's executable inside one of Playwright's `chromium-<revision>` folders, on macOS. */
const PLAYWRIGHT_BINARIES = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
];

/** The newest `<prefix><revision>` folder's binary in Playwright's cache `cache`, the first of `binaries` there. */
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

/** The first of `effects` to find a file. */
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

/** The newest Chromium a Playwright install left in its cache, when there is one. */
const playwrightChromium = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  return yield* firstFound(
    PLAYWRIGHT_CACHES.map((cache) =>
      newestIn(path.join(home, ...cache), 'chromium-', PLAYWRIGHT_BINARIES),
    ),
  );
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/** The first of `files` that exists, when one does. */
const existing = (files: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.findFirst(files, (file) => fs.exists(file));
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/**
 * The Chrome Bun 1.4.4 finds on macOS, searched as it searches
 * (`ChromeProcess.rs`, `find_chrome`): the first of `PATH_BROWSERS` on
 * `$PATH`, else the first of `MAC_BROWSERS` in `/Applications` or
 * `~/Applications`, else the newest headless shell in Playwright's cache.
 */
const chromeSearch = Effect.gen(function* () {
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

/** The Chrome to launch: `BUN_CHROME_PATH` when set (it must exist), else the first `chromeSearch` or Playwright's cache finds. */
const executable = Effect.gen(function* () {
  const named = yield* Config.option(Config.String('BUN_CHROME_PATH')).pipe(Effect.orDie);
  const found = yield* Option.match(named, {
    onSome: (file) => existing([file]),
    onNone: () => firstFound([chromeSearch, playwrightChromium]),
  });
  return yield* Effect.fromOption(found, () =>
    BrowserMissing.make({ executable: Option.getOrElse(named, () => 'Chrome or Chromium') }),
  );
});

/** How this process's first view launches Chrome for `requested`: in a new profile folder of this process's. */
const firstLaunch = (requested: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const root = yield* Config.String('FILM_CHROME_PROFILES').pipe(
      Config.withDefault(PROFILE_ROOT),
      Effect.orDie,
    );
    const file = yield* executable;
    const profile = yield* profileFolder(root);
    return {
      flags: requested.join(' '),
      executable: file,
      argv: chromeFlags(process.platform, requested, profile),
    } satisfies Launch;
  });

/** A failed launch or protocol call, as the browser's failure. */
const failed = (cause: unknown) => BrowserFailed.make({ reason: String(cause) });

/**
 * Chrome launched as `launch` says, over a pipe: its whole command line
 * stated (no puppeteer default), no signal handler of puppeteer's (Effect's
 * runtime owns the process's signals), no protocol timeout (a render's call
 * may take minutes), and no target puppeteer attaches to (each view drives
 * its own session).
 */
const launchChrome = (launch: Launch) =>
  Effect.gen(function* () {
    const { launch: start } = yield* Effect.promise(() => import('puppeteer-core'));
    const browser = yield* Effect.tryPromise({
      try: () =>
        start({
          executablePath: launch.executable,
          pipe: true,
          ignoreDefaultArgs: true,
          args: [...launch.argv],
          waitForInitialPage: false,
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
          protocolTimeout: 0,
          targetFilter: () => false,
        }),
      catch: failed,
    });
    const child = Option.fromNullishOr(browser.process());
    const leader = Option.flatMap(child, (chrome) => Option.fromUndefinedOr(chrome.pid));
    Option.map(leader, holdChrome);
    handles = Option.match(child, {
      onNone: () => [],
      onSome: (chrome) =>
        [chrome, ...chrome.stdio].flatMap((handle): ReadonlyArray<Held> => {
          if (isHeld(handle)) return [handle];
          return [];
        }),
    });
    browser.once('disconnected', () => {
      Option.map(leader, releaseChrome);
      running = Option.filter(running, (now) => now.browser !== browser);
    });
    const session = yield* Effect.tryPromise({
      try: () => browser.target().createCDPSession(),
      catch: failed,
    });
    const chrome: Running = { browser, session, root: wireOf(session) };
    running = Option.some(chrome);
    return chrome;
  });

/** This process's Chrome as `launch` says: the one that runs, else launched again. */
const chromeOf = (launch: Launch) =>
  Option.match(
    Option.filter(running, (chrome) => chrome.browser.connected),
    {
      onSome: Effect.succeed,
      onNone: () => launchChrome(launch),
    },
  );

/** A call on `wire`, its failure the browser's. */
const sendOn = (wire: Wire, method: string, params?: Params) =>
  Effect.tryPromise({ try: () => wire.send(method, params), catch: failed });

/** `Target.createTarget`'s and `Target.attachToTarget`'s answers, as far as a view reads them. */
const Created = Schema.Struct({ targetId: Schema.String });
const Attached = Schema.Struct({ sessionId: Schema.String });

/** `Target.detachedFromTarget`'s params: the session that ended. */
const Detached = Schema.Struct({ sessionId: Schema.String });

/** `Page.navigate`'s answer: an `errorText` when the load failed before it began. */
const Navigated = Schema.Struct({ errorText: Schema.optionalKey(Schema.String) });

/** A protocol call's answer, as its caller reads it: the protocol's object for the method it named. */
const Answer = Schema.Any;

/** `Runtime.evaluate`'s answer, as far as a view reads it. */
const Evaluated = Schema.Struct({
  result: Schema.Struct({ value: Schema.optionalKey(Schema.Any) }),
  exceptionDetails: Schema.optionalKey(
    Schema.Struct({
      text: Schema.optionalKey(Schema.String),
      exception: Schema.optionalKey(
        Schema.Struct({
          description: Schema.optionalKey(Schema.String),
          value: Schema.optionalKey(Schema.Unknown),
        }),
      ),
    }),
  ),
});

/** A console call's argument as the protocol hands it over. */
const Remote = Schema.Struct({
  type: Schema.String,
  value: Schema.optionalKey(Schema.Json),
  description: Schema.optionalKey(Schema.String),
});

/** `Runtime.consoleAPICalled`'s params, as far as a view reads them. */
const Logged = Schema.Struct({ type: Schema.String, args: Schema.Array(Schema.Json) });

/**
 * A console argument as the page's caller sees it: a string, number, boolean
 * or undefined as itself, a bigint or symbol as its description, any other
 * value (an object, a function) as the protocol's object for it.
 */
const consoleArg = (arg: Schema.Json): unknown =>
  Option.match(Schema.decodeUnknownOption(Remote)(arg), {
    onNone: () => arg,
    onSome: (remote) =>
      Match.value(remote.type).pipe(
        Match.when('string', () => remote.value),
        Match.when('number', () => remote.value),
        Match.when('boolean', () => remote.value),
        Match.when('undefined', () => remote.value),
        Match.when('bigint', () => remote.description),
        Match.when('symbol', () => remote.description),
        Match.orElse(() => arg),
      ),
  });

/** The error a script threw, as its message: the thrown error's first line past its name, else the protocol's text. */
const thrownMessage = (details: NonNullable<(typeof Evaluated.Type)['exceptionDetails']>) => {
  const stack = Option.getOrElse(
    Option.orElse(
      Option.flatMap(Option.fromUndefinedOr(details.exception), (e) =>
        Option.orElse(Option.fromUndefinedOr(e.description), () =>
          Option.map(Option.fromUndefinedOr(e.value), String),
        ),
      ),
      () => Option.fromUndefinedOr(details.text),
    ),
    () => 'JavaScript exception',
  );
  const first = stack.split('\n')[0] ?? stack;
  const colon = first.indexOf(': ');
  return Bool.match(colon < 0, { onTrue: () => first, onFalse: () => first.slice(colon + 2) });
};

/** A tab of `chrome` sized as `options` say, its session up with `Page` and `Runtime` enabled. */
const viewIn = (chrome: Running, options: ViewOptions) =>
  Effect.gen(function* () {
    const { targetId } = yield* sendOn(chrome.root, 'Target.createTarget', {
      url: 'about:blank',
      newWindow: true,
      width: options.width,
      height: options.height,
    }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Created)), Effect.mapError(failed));
    const { sessionId } = yield* sendOn(chrome.root, 'Target.attachToTarget', {
      targetId,
      flatten: true,
    }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Attached)), Effect.mapError(failed));
    const session = yield* Effect.fromOption(
      Option.flatMap(Option.fromUndefinedOr(chrome.session.connection()), (connection) =>
        Option.fromNullishOr(connection.session(sessionId)),
      ),
      () => failed(`no session ${sessionId} for target ${targetId}`),
    );
    yield* sendOn(wireOf(session), 'Page.enable');
    yield* sendOn(wireOf(session), 'Runtime.enable');
    return tabOf(chrome, targetId, session, options);
  });

/** The view over `session`, the tab `targetId` of `chrome`. */
const tabOf = (
  chrome: Running,
  targetId: string,
  session: CDPSession,
  options: ViewOptions,
): View => {
  const events = new EventTarget();
  const closed = Deferred.makeUnsafe<never, BrowserFailed>();
  const detached: Parameters<CDPSession['off']>[1] = (data) =>
    Option.map(
      Option.filter(
        Schema.decodeUnknownOption(Detached)(data),
        (gone) => gone.sessionId === session.id(),
      ),
      () => close('the tab closed'),
    );
  const died = () => close("this process's Chrome closed");
  const close = (reason: string) => {
    chrome.session.off('Target.detachedFromTarget', detached);
    chrome.browser.off('disconnected', died);
    Deferred.doneUnsafe(closed, Effect.fail(BrowserFailed.make({ reason })));
  };
  chrome.session.on('Target.detachedFromTarget', detached);
  chrome.browser.once('disconnected', died);
  const heard = new Set<string>();
  const hear = (type: string) => {
    if (heard.has(type)) return;
    heard.add(type);
    session.on(type, (data) => events.dispatchEvent(new MessageEvent(type, { data })));
  };
  Option.map(Option.fromUndefinedOr(options.console), (log) =>
    session.on('Runtime.consoleAPICalled', (data) =>
      Option.map(Schema.decodeUnknownOption(Logged)(data), (called) =>
        log(called.type, ...called.args.map(consoleArg)),
      ),
    ),
  );
  const run = <A>(effect: Effect.Effect<A, BrowserFailed>) =>
    Effect.runPromise(held(Effect.raceFirst(effect, Deferred.await(closed))));
  const send = (method: string, params?: Params) => sendOn(wireOf(session), method, params);
  const load = (start: Effect.Effect<unknown, BrowserFailed>) =>
    Effect.gen(function* () {
      const loaded = yield* Deferred.make<void>();
      const fired = () => Deferred.doneUnsafe(loaded, Effect.void);
      session.once('Page.loadEventFired', fired);
      const answer = yield* start.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Navigated)),
        Effect.mapError(failed),
        Effect.tapError(() => Effect.sync(() => session.off('Page.loadEventFired', fired))),
      );
      const refused = Option.fromUndefinedOr(answer.errorText);
      if (Option.isSome(refused)) {
        session.off('Page.loadEventFired', fired);
        return yield* failed(refused.value);
      }
      yield* Deferred.await(loaded);
    });
  const evaluate = (script: string) =>
    send('Runtime.evaluate', {
      expression: `(async()=>{return await (${script})})()`,
      returnByValue: true,
      awaitPromise: true,
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Evaluated)),
      Effect.mapError(failed),
      Effect.flatMap((answer) =>
        Option.match(Option.fromUndefinedOr(answer.exceptionDetails), {
          onNone: () => Effect.succeed(answer.result.value),
          onSome: (details) => Effect.fail(failed(thrownMessage(details))),
        }),
      ),
    );
  return {
    addEventListener: (...listen: Parameters<EventTarget['addEventListener']>) => {
      hear(listen[0]);
      events.addEventListener(...listen);
    },
    removeEventListener: (...unlisten: Parameters<EventTarget['removeEventListener']>) =>
      events.removeEventListener(...unlisten),
    dispatchEvent: (event: Event) => events.dispatchEvent(event),
    navigate: (url: string) => run(load(send('Page.navigate', { url }))),
    reload: () => run(load(send('Page.reload'))),
    evaluate: <A>(script: string): Promise<A> => run(evaluate(script)),
    cdp: <A>(method: string, params?: Params): Promise<A> =>
      run(
        send(method, params).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Answer)),
          Effect.mapError(failed),
        ),
      ),
    resize: (width: number, height: number) =>
      run(
        Effect.asVoid(
          send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
          }),
        ),
      ),
    close: () => {
      close('the view closed');
      Effect.runFork(Effect.ignore(sendOn(chrome.root, 'Target.closeTarget', { targetId })));
    },
  };
};

/**
 * A view (a tab of this process's Chrome) as `options` say, closed with the scope.
 * The first view launches Chrome with `requested` (`chromeFlags`: muted); a
 * later one asking for other flags fails, since the running Chrome cannot
 * take them. When this process's Chrome died, the next view launches it
 * again: the same executable, command line and profile.
 */
export const openView = (
  requested: ReadonlyArray<string>,
  options: ViewOptions,
): Effect.Effect<
  View,
  BrowserMissing | BrowserFailed,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> => {
  const flags = requested.join(' ');
  return Effect.acquireRelease(
    opening.withPermits(1)(
      Effect.suspend(() =>
        Option.match(launched, {
          onNone: () =>
            Effect.tap(firstLaunch(requested), (launch) =>
              Effect.sync(() => {
                launched = Option.some(launch);
              }),
            ),
          onSome: (launch) => {
            if (launch.flags !== flags)
              return Effect.fail(
                BrowserFailed.make({
                  reason: `this process's Chrome runs with "${launch.flags}", not "${flags}": one Chrome per process`,
                }),
              );
            return Effect.succeed(launch);
          },
        }).pipe(
          Effect.flatMap(chromeOf),
          Effect.flatMap((chrome) => viewIn(chrome, options)),
          held,
        ),
      ),
    ),
    (view) => Effect.sync(() => view.close()),
  );
};

/** `Runtime.exceptionThrown`'s parameters, as far as a page's error is read. */
const Thrown = Schema.Struct({
  exceptionDetails: Schema.Struct({
    text: Schema.String,
    exception: Schema.optionalKey(
      Schema.Struct({ description: Schema.optionalKey(Schema.String) }),
    ),
  }),
});

/**
 * What a page threw, from a view's `Runtime.exceptionThrown` event (with
 * `Runtime` enabled): the error as the page's console says it (`Error: boom`
 * and its stack), else the protocol's text.
 */
export const thrownBy = (event: Event): Option.Option<string> =>
  Option.map(Schema.decodeUnknownOption(Thrown)(Reflect.get(event, 'data')), (thrown) =>
    Option.getOrElse(
      Option.flatMap(Option.fromUndefinedOr(thrown.exceptionDetails.exception), (e) =>
        Option.fromUndefinedOr(e.description),
      ),
      () => thrown.exceptionDetails.text,
    ),
  );
