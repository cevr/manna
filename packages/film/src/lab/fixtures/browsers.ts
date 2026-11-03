import type { SourceMap } from 'node:module';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Boolean as Bool,
  Config,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  Scope,
  Semaphore,
} from 'effect';
import { openView, thrownBy } from '../../tools/chrome.ts';
import { BrowserFailed } from '../../tools/errors.ts';
import { HOST_REACH, failureOf, mapOf, toldOf } from './host-reach.ts';
import { type Ask, fromIdle, lease } from './lease.ts';
import { type Logged, type Request, type Response, type Tab, type View, makeTab } from './tab.ts';
import { tone } from './tone.ts';

const FAKE_MIC = { seconds: 4, amplitude: 0.5, rate: 44100 } as const;

const micFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const temp = yield* Config.String('TMPDIR').pipe(Config.withDefault('/tmp'));
  const wav = (yield* Path.Path).join(temp, 'film-fake-mic.wav');
  const own = `${wav}.${process.pid}`;
  yield* fs.writeFile(
    own,
    tone(FAKE_MIC.seconds, FAKE_MIC.amplitude, { rate: FAKE_MIC.rate, channels: 'left-only' }),
  );
  yield* fs.rename(own, wav);
  return wav;
}).pipe(Effect.orDie, Effect.provide(BunServices.layer));

const flags = Effect.runSync(
  Effect.cached(
    Effect.map(micFile, (wav) => [
      '--disable-accelerated-2d-canvas',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      '--disable-features=AudioServiceSandbox',
      '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2',
    ]),
  ),
);

const forever = Scope.makeUnsafe();

const SITE = 'lab.slow.test';

const ASSETS = `https://${SITE}`;

const IDLE = `${ASSETS}/idle`;
const IDLE_PAGE = `<!doctype html><title>idle</title><script>window.name = ''</script>`;

export interface Asset {
  readonly url: string;
  readonly response: Response;
}

export const asset = (name: string, response: Response): Asset => ({
  url: `${ASSETS}/${Bun.hash(response.body).toString(36)}/${name}`,
  response: { ...response, headers: { 'access-control-allow-origin': '*' } },
});

export const scriptOf = (script: Asset) => `<script crossorigin src="${script.url}"></script>`;

interface Lease {
  readonly origin: string;
  readonly events: EventTarget;
  readonly console: (type: string, args: ReadonlyArray<unknown>) => void;
}

interface Slot {
  readonly view: Bun.WebView;
  readonly lent: View;
  readonly held: { lease: Option.Option<Lease>; retired: boolean };
}

const idle: Array<Slot> = [];
let made = 0;

export const viewsMade = () => made;

export const chromeCommandLine: Effect.Effect<string> = Effect.gen(function* () {
  const view = yield* openView(yield* flags, { width: 800, height: 600 });
  yield* Effect.promise(() => view.navigate('chrome://version'));
  return yield* Effect.promise(() =>
    view.evaluate<string>("document.querySelector('#command_line').textContent"),
  );
}).pipe(Effect.scoped, Effect.orDie, Effect.provide(BunServices.layer));

const inTurn = () => {
  const one = Semaphore.makeUnsafe(1);
  return <A>(call: () => Promise<A>): Promise<A> =>
    Effect.runPromise(
      one.withPermits(1)(
        Effect.tryPromise({
          try: call,
          catch: (cause) => BrowserFailed.make({ reason: String(cause) }),
        }),
      ),
    );
};

const Paused = Schema.Struct({
  requestId: Schema.String,
  request: Schema.Struct({ url: Schema.String }),
});

const quietly = (call: Promise<unknown>) =>
  Effect.runFork(Effect.ignore(Effect.tryPromise(() => call)));

const routeRequest = (slot: Slot) => (event: Event) => {
  const data: unknown = Reflect.get(event, 'data');
  Option.map(Schema.decodeUnknownOption(Paused)(data), (paused) => {
    const url = paused.request.url;
    const origin = new URL(url).origin;
    const holder = Option.filter(
      slot.held.lease,
      (lease) => url !== IDLE && (origin === lease.origin || origin === ASSETS),
    );
    if (Option.isSome(holder))
      return holder.value.events.dispatchEvent(new MessageEvent(event.type, { data }));
    if (url === IDLE)
      return quietly(
        slot.lent.cdp('Fetch.fulfillRequest', {
          requestId: paused.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'text/html' }],
          body: Buffer.from(IDLE_PAGE).toString('base64'),
        }),
      );
    return quietly(
      slot.lent.cdp('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Aborted' }),
    );
  });
};

const makeSlot = Effect.gen(function* () {
  const held: Slot['held'] = { lease: Option.none(), retired: false };
  const view = yield* openView(yield* flags, {
    width: 800,
    height: 600,
    console: (type, ...args) => Option.map(held.lease, (lease) => lease.console(type, args)),
  }).pipe(Effect.provideService(Scope.Scope, forever), Effect.orDie);
  made += 1;
  const protocol = inTurn();
  const scripts = inTurn();
  const slot: Slot = {
    view,
    held,
    lent: {
      cdp: (method, params) => protocol(() => view.cdp(method, params)),
      evaluate: (script) => scripts(() => view.evaluate(script)),
      navigate: (url) => view.navigate(url),
      reload: () => view.reload(),
      resize: (width, height) => view.resize(width, height),
      retire: () => {
        held.retired = true;
      },
    },
  };
  view.addEventListener('Fetch.requestPaused', routeRequest(slot));
  view.addEventListener('Runtime.exceptionThrown', (event: Event) => {
    Option.map(slot.held.lease, (lease) =>
      lease.events.dispatchEvent(
        new MessageEvent(event.type, { data: Reflect.get(event, 'data') }),
      ),
    );
  });
  yield* Effect.promise(() => view.navigate('about:blank'));
  yield* Effect.promise(() => slot.lent.cdp('Runtime.enable'));
  yield* Effect.promise(() =>
    slot.lent.cdp('Fetch.enable', {
      patterns: [{ urlPattern: `https://*${SITE}/*` }, { urlPattern: `http://*${SITE}/*` }],
    }),
  );
  return slot;
}).pipe(Effect.provide(BunServices.layer));

const lend = (held: Lease, ask: Ask) =>
  lease<Slot>(
    {
      take: Effect.map(fromIdle(idle, makeSlot), (slot) => {
        slot.held.lease = Option.some(held);
        return slot;
      }),
      blank: (slot) =>
        Effect.gen(function* () {
          slot.held.lease = Option.none();
          yield* Effect.tryPromise(() => slot.lent.navigate(IDLE));
          yield* Effect.tryPromise(() => slot.lent.cdp('Page.resetNavigationHistory'));
        }),
      giveBack: (slot) => {
        if (slot.held.retired) return slot.view.close();
        idle.push(slot);
      },
      discard: (slot) => {
        slot.held.lease = Option.none();
        slot.view.close();
      },
    },
    ask,
  );

const WARM = 3;

idle.push(
  // oxlint-disable-next-line effect/noAsyncFunction -- the module's own load waits for its setup, so no case's timeout counts it
  ...(await Effect.runPromise(
    Effect.forEach(Array.from({ length: WARM }), () => makeSlot, { concurrency: WARM }),
  )),
);

const throttle = Effect.runSync(
  Config.option(Config.Number('FILM_E2E_CPU_THROTTLE')).pipe(
    Effect.map(Option.filter((rate) => rate > 1)),
    Effect.orDie,
  ),
);

let tabs = 0;
let open = 0;

const described = Schema.decodeUnknownOption(Schema.Struct({ description: Schema.String }));

interface TabOptions {
  readonly width: number;
  readonly height: number;
  readonly microphone: boolean;
  readonly serve: (request: Request) => Effect.Effect<Option.Option<Response>>;
  readonly assets: ReadonlyArray<Asset>;
  readonly init: ReadonlyArray<string>;
  readonly coarse?: boolean;
  readonly plain?: boolean;
}

export const openTab = (options: TabOptions): Effect.Effect<Tab, never, Scope.Scope> =>
  Effect.gen(function* () {
    const logged: Array<Logged> = [];
    const errors: Array<string> = [];
    tabs += 1;
    open += 1;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        open -= 1;
      }),
    );
    const scheme = Bool.match(options.plain === true, {
      onTrue: () => 'http',
      onFalse: () => 'https',
    });
    const origin = `${scheme}://t${tabs}.${SITE}`;
    const assets = new Map(options.assets.map((a) => [a.url, a.response]));
    const maps = new Map<string, Option.Option<SourceMap>>();
    const mapFor = (url: string): Option.Option<SourceMap> =>
      Option.getOrElse(Option.fromUndefinedOr(maps.get(url)), () => {
        const read = Option.flatMap(Option.fromUndefinedOr(assets.get(url)), (a) => mapOf(a.body));
        maps.set(url, read);
        return read;
      });
    const events = new EventTarget();
    events.addEventListener('Runtime.exceptionThrown', (event: Event) => {
      Option.map(thrownBy(event), (thrown) => errors.push(thrown));
    });
    const slot = yield* lend(
      {
        origin,
        events,
        console: (type, args) => {
          const text = args
            .map((arg) =>
              Option.match(described(arg), {
                onNone: () => String(arg),
                onSome: (d) => d.description,
              }),
            )
            .join(' ');
          const told = Option.filter(Option.some(text), () => type === 'debug').pipe(
            Option.flatMap(toldOf),
          );
          if (Option.isSome(told)) {
            Option.map(failureOf(told.value, mapFor), (failure) => errors.push(failure));
            return;
          }
          logged.push({ type, text });
          if (type.startsWith('warn') || type === 'error') errors.push(`console.${type}: ${text}`);
        },
      },
      { width: options.width, height: options.height, coarse: options.coarse === true },
    );
    yield* Effect.addFinalizer(() =>
      Effect.when(
        Effect.die(new Error(`the page reported ${errors.length}: ${errors.join(' | ')}`)),
        Effect.sync(() => errors.length > 0),
      ),
    );
    if (Option.isSome(throttle)) {
      yield* Effect.promise(() =>
        slot.lent.cdp('Emulation.setCPUThrottlingRate', { rate: throttle.value }),
      );
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => slot.lent.cdp('Emulation.setCPUThrottlingRate', { rate: 1 })),
      );
    }
    if (options.microphone)
      yield* Effect.promise(() =>
        slot.lent.cdp('Browser.setPermission', {
          origin,
          permission: { name: 'microphone' },
          setting: 'granted',
        }),
      );
    return yield* makeTab(slot.lent, {
      origin,
      events,
      serve: (request) =>
        Option.match(Option.fromUndefinedOr(assets.get(request.url.href)), {
          onNone: () => options.serve(request),
          onSome: Effect.succeedSome,
        }),
      init: [HOST_REACH, ...options.init],
      logged,
      errors,
      alone: () => open === 1,
    });
  });

export const respond = (body: Uint8Array | string, type: string, status = 200): Response => ({
  status,
  type,
  body,
});

export const servePaths =
  (answers: Readonly<Record<string, Response>>) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Effect.succeedSome(answers[request.url.pathname] ?? respond('no such page', 'text/plain', 404));
