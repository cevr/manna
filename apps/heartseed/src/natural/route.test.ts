/* oxlint-disable effect/noTernary, effect/noGlobals, effect/noNullish -- the model and the generator are plain branches over plain records, a wrong step is named by its JSON, and an absent reading is undefined in the fakes. */

/**
 * The router, the `Natural` service and the reducer together, at the seam
 * the app builds: `naturalVoices` over a fake system voice, a fake native
 * module and a store that outlives each launch. Seeded histories of
 * launches (some after a crash mid-reading), Voice taps, readings, stops,
 * pauses, `Try again`, install events, load answers, broken renders and
 * loads, corrupted files and stray events run against a reference written
 * here; after every step the view, the line, the voice's status, the
 * installs and their bases, the store, and each reading's route must match
 * it. Three walks then pin the fallback's log, a stop held in both voices,
 * and a natural reading's lit words, a seek included.
 */

import { describe, expect, it } from 'bun:test';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Logger,
  Option,
  Predicate,
  References,
  Scope,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { CHOICE_KEY, nextChoice, Voice, VoiceSource, type Choice, type VoiceEvent } from '../voice';
import { lexicon } from './lexicon';
import { FILES, MIRROR, TOTAL_BYTES } from './manifest';
import { NaturalModule, NaturalUnavailable, type InstallEvent } from './module';
import { naturalVoices, tapVoice } from './route';
import { BASE_KEY, FUSE_KEY, Natural } from './service';
import { lineOf, type Download, type Failure, type NaturalView } from './state';

const SYSTEM_ID = 'com.apple.voice.enhanced.en-US.Test';
const COUNT = FILES.length;
const HISTORIES = 200;
const STEPS = 30;
const PACK = { off: 'af_heart.bin', her: 'af_heart.bin', him: 'am_michael.bin' } as const;

/** Stored bases and the base a development build installs from for each; a release build always installs from `MIRROR`. */
const BASES: ReadonlyArray<readonly [stored: string | undefined, dev: string]> = [
  [undefined, MIRROR],
  ['http://localhost:8283/', 'http://localhost:8283/'],
  ['http://10.0.0.7:8284/kokoro/', 'http://10.0.0.7:8284/kokoro/'],
  ['http://localhost:8283', MIRROR],
  ['file:///tmp/models/', MIRROR],
  ['http://local host/', MIRROR],
];

/** D3's words for a failure, written again here. */
const FAILED = new Map<Failure, string>([
  ['network', 'Natural voice could not download.'],
  ['check', 'Natural voice could not be checked.'],
  ['space', 'Not enough space for the natural voice (83 MB).'],
  ['load', 'Natural voice could not start.'],
]);

/** The floors each run of the histories must reach, so a rule the generator stops reaching is seen. */
const FLOORS = {
  'natural her': 40,
  'natural him': 60,
  'system, not ready': 180,
  'system, fuse blown': 20,
  fallbacks: 20,
  'crash launches': 35,
  'off launches': 100,
  'taps clearing the fuse': 45,
  'taps starting': 45,
  'retries network': 15,
  'retries check': 15,
  'retries space': 9,
  'retries load': 14,
  'check, fetched again': 40,
  'check twice': 3,
  'failed load': 40,
  stops: 60,
  'strays dropped': 12,
  'dev installs from a local base': 12,
  'release installs': 35,
  pauses: 30,
  resumes: 4,
} satisfies Record<string, number>;

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const pick = <A>(next: () => number, list: ReadonlyArray<A>): A =>
  list[Math.floor(next() * list.length)] as A;

const WORDS = [...lexicon().words.keys()].filter((key) => /^[a-z]{3,8}$/.test(key));

const installing: (download: Download) => boolean = Predicate.or(
  Predicate.isTagged('Downloading'),
  Predicate.isTagged('Waiting'),
);

/** Lets every forked call and event settle. */
const settle = Effect.gen(function* () {
  for (let turn = 0; turn < 40; turn++) yield* Effect.yieldNow;
});

/** A stop that holds for a turn, so a caller that does not wait for it is seen going on early. */
const held = (inflight: { count: number }, after: () => void) =>
  Effect.gen(function* () {
    inflight.count += 1;
    yield* Effect.yieldNow;
    after();
    inflight.count -= 1;
  });

/** The device across launches: the files, the crash marker, the store, and the fakes' records. */
const deviceOf = (next: () => number) => {
  const refuses = next() < 0.05;
  const disk = new Map<string, string>();
  const ops: string[] = [];
  const store = KeyValueStore.makeStringOnly({
    get: (key) =>
      Effect.sync(() => {
        ops.push(`get ${key}`);
        return disk.get(key);
      }),
    set: (key, value) =>
      Effect.sync(() => {
        ops.push(`set ${key}`);
        disk.set(key, value);
      }),
    remove: (key) => Effect.sync(() => void ops.push(`remove ${key}`)),
    clear: Effect.sync(() => void ops.push('clear')),
    size: Effect.sync(() => disk.size),
    keys: Effect.sync(() => [...disk.keys()]),
  });
  return {
    refuses,
    disk,
    ops,
    store,
    inflight: { count: 0 },
    present: pick(next, [0, COUNT, COUNT, Math.floor(next() * COUNT)]),
    bad: false,
    marker: next() < 0.12,
    crashed: false,
    loaded: false,
    installing: false,
    pack: '',
    holding: undefined as number | undefined,
    breakRender: false,
    breakLoad: false,
    loads: [] as Deferred.Deferred<number, NaturalUnavailable>[],
    installs: [] as string[],
    forbidden: 0,
    rendered: new Map<number, string>(),
    module: { pauses: 0, resumes: 0, stops: 0 },
    system: {
      speaks: new Map<number, string>(),
      current: undefined as number | undefined,
      pauses: 0,
      resumes: 0,
      stops: 0,
    },
    installListeners: new Set<(event: InstallEvent) => void>(),
    moduleListeners: new Set<(event: VoiceEvent) => void>(),
    systemListeners: new Set<(event: VoiceEvent) => void>(),
  };
};

type Device = ReturnType<typeof deviceOf>;

const refused = (reason: string) => Effect.fail(NaturalUnavailable.make({ reason }));

const listening = <A>(listeners: Set<(event: A) => void>, listener: (event: A) => void) =>
  Effect.asVoid(
    Effect.acquireRelease(
      Effect.sync(() => listeners.add(listener)),
      () => Effect.sync(() => listeners.delete(listener)),
    ),
  );

/** A render: the first chunk records the pack it rendered in, and holds the reading (the crash marker set) unless it is set to break. */
const renderOf = (device: Device, utterance: number, chunk: number, ids: ReadonlyArray<number>) =>
  Effect.suspend(() => {
    if (!device.loaded) return refused('not loaded');
    if (chunk === 0) {
      device.rendered.set(utterance, device.pack);
      if (device.breakRender) {
        device.breakRender = false;
        return refused('nonfinite');
      }
      device.holding = utterance;
      device.marker = true;
    } else if (device.holding !== utterance) return refused('stale');
    return Effect.succeed({ frames: ids.map(() => 2), samples: 1200 * ids.length, millis: 1 });
  });

/** A load: at once while the model is loaded, else held until the history answers it. */
const loadOf = (device: Device, pack: string) =>
  Effect.suspend(() => {
    if (device.loaded) {
      device.pack = pack;
      return Effect.succeed(1);
    }
    const answer = Deferred.makeUnsafe<number, NaturalUnavailable>();
    device.loads.push(answer);
    return Effect.tap(Deferred.await(answer), () => Effect.sync(() => (device.pack = pack)));
  });

const moduleOf = (device: Device) =>
  NaturalModule.of({
    status: () =>
      Effect.sync(() => ({
        revision: 'test',
        files: device.present,
        bytes: 0,
        excluded: true,
        crashed: device.crashed,
        loaded: device.loaded,
        installing: device.installing,
        footprint: 0,
        peak: 0,
      })),
    install: (base) =>
      Effect.suspend(() => {
        device.installs.push(base);
        if (device.refuses) return refused('no natural voice on this platform');
        device.installing = true;
        return Effect.void;
      }),
    cancelInstall: Effect.sync(() => void (device.forbidden += 1)),
    remove: Effect.sync(() => void (device.forbidden += 1)),
    load: (_revision, _files, pack) => loadOf(device, pack),
    render: (utterance, chunk, ids) => renderOf(device, utterance, chunk, ids),
    play: (utterance) => (device.holding === utterance ? Effect.void : refused('stale')),
    pause: Effect.sync(() => void (device.module.pauses += 1)),
    resume: Effect.sync(() => void (device.module.resumes += 1)),
    stop: Effect.suspend(() => {
      device.module.stops += 1;
      return held(device.inflight, () => {
        device.holding = undefined;
        device.marker = false;
      });
    }),
    subscribe: (listener) => listening(device.moduleListeners, listener),
    subscribeInstall: (listener) => listening(device.installListeners, listener),
  });

const systemOf = (device: Device) =>
  VoiceSource.of({
    voices: Effect.succeed([
      {
        id: SYSTEM_ID,
        language: 'en-US',
        name: 'Test',
        quality: 2,
        novelty: false,
        personal: false,
      },
    ]),
    speak: (utterance, _text, speaking) =>
      Effect.sync(() => {
        device.system.speaks.set(utterance, speaking.system);
        device.system.current = utterance;
      }),
    pause: Effect.sync(() => void (device.system.pauses += 1)),
    resume: Effect.sync(() => void (device.system.resumes += 1)),
    stop: Effect.suspend(() => {
      device.system.stops += 1;
      return held(device.inflight, () => {
        device.system.current = undefined;
      });
    }),
    subscribe: (listener) => listening(device.systemListeners, listener),
  });

const voicesOf = (device: Device, dev: boolean) =>
  naturalVoices({
    system: Layer.succeed(VoiceSource, systemOf(device)),
    module: Layer.succeed(NaturalModule, moduleOf(device)),
    dev,
  }).pipe(Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, device.store)));

/** A logger that hands each line, its message then its annotations as JSON, to `keep`, and prints nothing. */
const keptLogs = (keep: (line: string) => void) =>
  Logger.layer([
    Logger.make((options) => {
      keep(
        `${[options.message].flat().map(String).join(' ')} ${JSON.stringify(options.fiber.getRef(References.CurrentLogAnnotations))}`,
      );
    }),
  ]);

/** The reference: what the owner's rules say the app holds after each step. */
interface Model {
  choice: Choice;
  fuse: 'clear' | 'blown';
  said: boolean;
  download: Download;
  started: boolean;
  again: boolean;
  complete: boolean;
  reading: 'idle' | 'reading' | 'paused';
  active: 'system' | 'natural';
  utterance: number;
  breaks: boolean;
  routes: Map<number, string>;
  installs: string[];
  storedFuse: string | undefined;
  storedChoice: string | undefined;
  fallbacks: number;
}

/** One launch's services. */
interface Launch {
  readonly scope: Scope.Closeable;
  readonly built: Context.Context<Voice | Natural>;
  readonly voice: Voice['Service'];
  readonly natural: Natural['Service'];
}

/** One history: its draws, the device, the reference, the launch it is in, and what it has seen. */
interface World {
  readonly seed: number;
  readonly next: () => number;
  readonly dev: boolean;
  readonly base: string;
  readonly device: Device;
  readonly m: Model;
  readonly trail: string[];
  readonly logged: { fallbacks: number };
  readonly counts: Record<string, number>;
  launch: Option.Option<Launch>;
}

type Found = string | undefined;

const count = (w: World, name: string) => {
  w.counts[name] = (w.counts[name] ?? 0) + 1;
};

const wrong = (w: World, what: string): Found =>
  `seed ${w.seed} dev=${w.dev} after ${w.trail.join(' ')}: ${what}`;

const current = (w: World): Launch => Option.getOrThrow(w.launch);

/** D3's line for the view the reference holds. */
const lineFor = (view: NaturalView): Option.Option<{ text: string; retry: boolean }> => {
  if (view.choice === 'off') return Option.none();
  if (view.said)
    return Option.some({
      text: 'The natural voice stopped unexpectedly, so the system voice reads for now.',
      retry: false,
    });
  const d = view.download;
  if (d._tag === 'Failed') return Option.some({ text: FAILED.get(d.reason) ?? '', retry: true });
  if (d._tag === 'Waiting')
    return Option.some({ text: 'Natural voice: waiting for a connection', retry: false });
  if (d._tag === 'Loading')
    return Option.some({ text: 'Natural voice: getting ready', retry: false });
  if (d._tag !== 'Downloading') return Option.none();
  const percent = Math.floor((100 * d.bytes) / d.total);
  return Option.some({ text: `Natural voice: downloading, ${percent}%`, retry: false });
};

const install = (w: World) => {
  w.m.installs.push(w.base);
  w.m.download = w.device.refuses
    ? { _tag: 'Unsupported' }
    : { _tag: 'Downloading', bytes: 0, total: TOTAL_BYTES };
};

const start = (w: World) => {
  w.m.started = true;
  if (w.m.complete) w.m.download = { _tag: 'Loading' };
  else install(w);
};

/** The reference at a launch: the stored choice, the fuse (blown by a crash or by its stored text), the download idle until it begins. */
const launched = (w: World, crash: boolean) => {
  const m = w.m;
  const stored = m.storedChoice;
  m.choice = stored === 'off' || stored === 'her' || stored === 'him' ? stored : 'her';
  m.fuse = crash || m.storedFuse === 'blown' ? 'blown' : 'clear';
  m.said = crash;
  if (crash) m.storedFuse = 'blown';
  Object.assign(m, {
    download: { _tag: 'Idle' },
    started: false,
    again: false,
    complete: w.device.present === COUNT,
    reading: 'idle',
    active: 'system',
    utterance: 0,
    breaks: false,
    routes: new Map(),
  });
  if (m.choice !== 'off') start(w);
  count(w, crash ? 'crash launches' : 'launches');
  if (m.choice === 'off') count(w, 'off launches');
};

/** Opens a launch over the device as it stands; `crash` is the marker the last launch left. */
const open = (w: World, crash: boolean) =>
  Effect.gen(function* () {
    const device = w.device;
    Object.assign(device, {
      crashed: crash,
      marker: false,
      loaded: false,
      installing: false,
      holding: undefined,
      breakRender: false,
      loads: [],
      rendered: new Map(),
    });
    device.system.current = undefined;
    device.system.speaks = new Map();
    const scope = yield* Scope.make();
    const built = yield* Layer.buildWithScope(voicesOf(device, w.dev), scope);
    w.launch = Option.some({
      scope,
      built,
      voice: Context.get(built, Voice),
      natural: Context.get(built, Natural),
    });
    launched(w, crash);
  });

const viewWrong = (w: World) =>
  Effect.gen(function* () {
    const { natural, voice } = current(w);
    const view = yield* natural.view;
    const m = w.m;
    const want: NaturalView = {
      download: m.download,
      fuse: m.fuse,
      said: m.said,
      choice: m.choice,
    };
    if (JSON.stringify(view) !== JSON.stringify(want))
      return wrong(w, `view ${JSON.stringify(view)}, want ${JSON.stringify(want)}`);
    if (JSON.stringify(lineOf(view)) !== JSON.stringify(lineFor(want)))
      return wrong(
        w,
        `line ${JSON.stringify(lineOf(view))}, want ${JSON.stringify(lineFor(want))}`,
      );
    const status = (yield* voice.view).status;
    if (status !== m.reading) return wrong(w, `voice ${status}, want ${m.reading}`);
    return undefined;
  });

const deviceWrong = (w: World): Found => {
  const { device, m } = w;
  if (JSON.stringify(device.installs) !== JSON.stringify(m.installs))
    return wrong(
      w,
      `installs ${JSON.stringify(device.installs)}, want ${JSON.stringify(m.installs)}`,
    );
  if (device.forbidden > 0) return wrong(w, 'cancelled or removed the download');
  if (device.installing !== installing(m.download))
    return wrong(w, `module installing ${device.installing} in ${m.download._tag}`);
  if (device.holding !== undefined && device.system.current !== undefined)
    return wrong(w, 'both voices hold a reading');
  if (w.logged.fallbacks !== m.fallbacks)
    return wrong(w, `${w.logged.fallbacks} fallback logs, want ${m.fallbacks}`);
  return undefined;
};

const storeWrong = (w: World): Found => {
  const { device, m } = w;
  if (device.disk.get(FUSE_KEY) !== m.storedFuse)
    return wrong(w, `fuse stored ${device.disk.get(FUSE_KEY)}, want ${m.storedFuse}`);
  if (device.disk.get(CHOICE_KEY) !== m.storedChoice)
    return wrong(w, `choice stored ${device.disk.get(CHOICE_KEY)}, want ${m.storedChoice}`);
  const writes = device.ops.filter(
    (op) => !op.startsWith('get ') && op !== `set ${FUSE_KEY}` && op !== `set ${CHOICE_KEY}`,
  );
  if (writes.length > 0) return wrong(w, `wrote ${writes.join(', ')}`);
  if (!w.dev && device.ops.includes(`get ${BASE_KEY}`))
    return wrong(w, 'a release build read the base');
  return undefined;
};

/** Each reading's route this launch: `S`, `N:<pack>`, or `N:<pack>>S` for a fallback; the system voice always asked its own id. */
const routesWrong = (w: World): Found => {
  for (const [utterance, route] of w.m.routes) {
    const rendered = w.device.rendered.get(utterance);
    const spoken = w.device.system.speaks.get(utterance);
    const went = [rendered === undefined ? '' : `N:${rendered}`, spoken === undefined ? '' : 'S']
      .filter((part) => part !== '')
      .join('>');
    if (went !== route) return wrong(w, `utterance ${utterance} went ${went}, want ${route}`);
    if (spoken !== undefined && spoken !== SYSTEM_ID)
      return wrong(w, `the system voice was asked ${spoken}`);
  }
  return undefined;
};

const check = (w: World) =>
  Effect.map(viewWrong(w), (found) => found ?? deviceWrong(w) ?? storeWrong(w) ?? routesWrong(w));

/** What the next load comes to: a file missing, a file that fails its check (and is gone), a broken engine, or loaded. */
const loadOutcome = (w: World) => {
  const device = w.device;
  if (w.m.again && device.present === COUNT && w.next() < 0.4) device.bad = true;
  if (device.present < COUNT) return 'missing';
  if (device.bad) {
    device.bad = false;
    device.present = COUNT - 1;
    return 'check';
  }
  if (device.breakLoad) {
    device.breakLoad = false;
    return 'the engine would not start';
  }
  return 'ok';
};

/** The reference after a load failed: a missing or bad file is fetched again once, then said; anything else is a failed load. */
const loadFailed = (w: World, outcome: string) => {
  const m = w.m;
  if (outcome !== 'missing' && outcome !== 'check') {
    m.download = { _tag: 'Failed', reason: 'load' };
    count(w, 'failed load');
  } else if (m.again) {
    m.download = { _tag: 'Failed', reason: 'check' };
    count(w, 'check twice');
  } else {
    m.again = true;
    m.complete = false;
    install(w);
    count(w, 'check, fetched again');
  }
};

const answerLoad = (w: World) =>
  Effect.gen(function* () {
    const answer = w.device.loads.shift();
    if (answer === undefined) return undefined;
    const outcome = loadOutcome(w);
    w.trail.push(`load:${outcome}`);
    if (outcome !== 'ok') {
      yield* Deferred.fail(answer, NaturalUnavailable.make({ reason: outcome }));
      loadFailed(w, outcome);
      return undefined;
    }
    w.device.loaded = true;
    yield* Deferred.succeed(answer, 1);
    w.m.download = { _tag: 'Ready' };
    w.m.again = false;
    return undefined;
  });

const sendInstall = (w: World, event: InstallEvent) => {
  for (const listener of w.device.installListeners) listener(event);
};

/** The download's next event, sent by the module and taken into the reference. */
const installEvent = (w: World): Found => {
  const kind = pick(w.next, [
    'progress',
    'progress',
    'waiting',
    'done',
    'done',
    'network',
    'check',
    'space',
  ] as const);
  w.trail.push(kind);
  if (kind === 'progress') {
    const bytes = Math.floor(w.next() * TOTAL_BYTES);
    sendInstall(w, { kind, bytes, total: TOTAL_BYTES, reason: '' });
    w.m.download = { _tag: 'Downloading', bytes, total: TOTAL_BYTES };
    return undefined;
  }
  if (kind === 'waiting') {
    sendInstall(w, { kind, bytes: 0, total: 0, reason: '' });
    w.m.download = { _tag: 'Waiting' };
    return undefined;
  }
  w.device.installing = false;
  if (kind === 'done') {
    w.device.present = COUNT;
    w.device.bad = false;
    sendInstall(w, { kind, bytes: TOTAL_BYTES, total: TOTAL_BYTES, reason: '' });
    w.m.complete = true;
    w.m.download = { _tag: 'Loading' };
    return undefined;
  }
  sendInstall(w, { kind: 'failed', bytes: 0, total: TOTAL_BYTES, reason: kind });
  w.m.download = { _tag: 'Failed', reason: kind };
  return undefined;
};

const relaunch = (w: World) =>
  Effect.gen(function* () {
    const crash = w.device.marker;
    yield* Scope.close(current(w).scope, Exit.void);
    yield* open(w, crash);
    return undefined;
  });

const tap = (w: World) =>
  Effect.gen(function* () {
    yield* tapVoice.pipe(Effect.provideContext(current(w).built));
    const m = w.m;
    const chosen = nextChoice(m.choice);
    if (m.fuse === 'blown') {
      m.storedFuse = 'clear';
      count(w, 'taps clearing the fuse');
    }
    Object.assign(m, { fuse: 'clear', said: false, choice: chosen, storedChoice: chosen });
    if (chosen !== 'off' && !m.started && m.download._tag === 'Idle') {
      start(w);
      count(w, 'taps starting');
    }
    if (chosen === 'off') m.reading = 'idle';
    return undefined;
  });

/** The route the reference expects for a new reading. */
const routed = (w: World) => {
  const m = w.m;
  if (m.download._tag !== 'Ready' || m.fuse === 'blown') {
    m.routes.set(m.utterance, 'S');
    m.active = 'system';
    count(w, m.download._tag === 'Ready' ? 'system, fuse blown' : 'system, not ready');
    return;
  }
  const pack = PACK[m.choice];
  if (!m.breaks) {
    m.routes.set(m.utterance, `N:${pack}`);
    m.active = 'natural';
    count(w, `natural ${m.choice}`);
    return;
  }
  m.breaks = false;
  m.routes.set(m.utterance, `N:${pack}>S`);
  m.active = 'system';
  m.fallbacks += 1;
  count(w, 'fallbacks');
};

const read = (w: World) =>
  Effect.gen(function* () {
    const words = Array.from({ length: 1 + Math.floor(w.next() * 5) }, () => pick(w.next, WORDS));
    yield* current(w).voice.read(`${words.join(' ')}.`);
    if (w.m.choice === 'off') return undefined;
    w.m.utterance += 1;
    w.m.reading = 'reading';
    routed(w);
    return undefined;
  });

const stop = (w: World) =>
  Effect.gen(function* () {
    const { device, m } = w;
    const before = { system: device.system.stops, natural: device.module.stops };
    yield* current(w).voice.stop;
    if (m.reading === 'idle') return undefined;
    if (device.inflight.count !== 0)
      return wrong(w, 'the stop returned before both voices stopped');
    if (device.system.stops === before.system || device.module.stops === before.natural)
      return wrong(w, 'the stop missed a voice');
    m.reading = 'idle';
    count(w, 'stops');
    return undefined;
  });

/** A pause or a resume: it reaches the active voice alone. */
const hold = (w: World, which: 'pauses' | 'resumes') =>
  Effect.gen(function* () {
    const { device, m } = w;
    const before = { system: device.system[which], natural: device.module[which] };
    const { voice } = current(w);
    yield* which === 'pauses' ? voice.pause : voice.resume;
    if (m.reading !== (which === 'pauses' ? 'reading' : 'paused')) return undefined;
    m.reading = which === 'pauses' ? 'paused' : 'reading';
    const reached = [device.system[which] - before.system, device.module[which] - before.natural];
    const want = m.active === 'natural' ? [0, 1] : [1, 0];
    if (JSON.stringify(reached) !== JSON.stringify(want))
      return wrong(w, `${which} reached ${JSON.stringify(reached)}, active ${m.active}`);
    count(w, which);
    return undefined;
  });

const retry = (w: World) =>
  Effect.gen(function* () {
    yield* current(w).natural.retry;
    const d = w.m.download;
    if (d._tag !== 'Failed') return undefined;
    count(w, `retries ${d.reason}`);
    if (d.reason === 'load') w.m.download = { _tag: 'Loading' };
    else {
      w.m.again = false;
      install(w);
    }
    return undefined;
  });

const finish = (listeners: Set<(event: VoiceEvent) => void>, utterance: number) => {
  for (const listener of listeners) listener({ utterance, kind: 'finish', location: 0, length: 0 });
};

/** The natural voice ends the reading it holds. */
const naturalEnds = (w: World): Found => {
  const { device, m } = w;
  const utterance = device.holding;
  if (utterance === undefined) return undefined;
  const reading = m.reading !== 'idle';
  device.holding = undefined;
  device.marker = false;
  finish(device.moduleListeners, utterance);
  if (m.active === 'natural' && reading && utterance === m.utterance) m.reading = 'idle';
  return undefined;
};

/** The system voice ends the reading it holds. */
const systemEnds = (w: World): Found => {
  const { device, m } = w;
  const utterance = device.system.current;
  if (utterance === undefined) return undefined;
  const reading = m.reading !== 'idle';
  device.system.current = undefined;
  finish(device.systemListeners, utterance);
  if (m.active === 'system' && reading && utterance === m.utterance) m.reading = 'idle';
  return undefined;
};

/** The system voice sends a finish for the current reading whether it holds it or not: heard only while it is the active voice. */
const stray = (w: World): Found => {
  const m = w.m;
  if (m.utterance === 0) return undefined;
  const reading = m.reading !== 'idle';
  finish(w.device.systemListeners, m.utterance);
  if (reading && m.active === 'system') m.reading = 'idle';
  else if (reading) count(w, 'strays dropped');
  return undefined;
};

const sync = (run: (w: World) => Found) => (w: World) => Effect.sync(() => run(w));

const COMMANDS = {
  relaunch,
  tap,
  read,
  stop,
  pause: (w: World) => hold(w, 'pauses'),
  resume: (w: World) => hold(w, 'resumes'),
  retry,
  'natural ends': sync(naturalEnds),
  'system ends': sync(systemEnds),
  stray: sync(stray),
  'break render': sync((w) => {
    w.device.breakRender = true;
    w.m.breaks = true;
    return undefined;
  }),
  'break load': sync((w) => {
    w.device.breakLoad = true;
    return undefined;
  }),
  corrupt: sync((w) => {
    if (w.device.present === COUNT) w.device.bad = true;
    return undefined;
  }),
} satisfies Record<string, (w: World) => Effect.Effect<Found>>;

type Command = keyof typeof COMMANDS;

const DRAWN: ReadonlyArray<Command> = [
  'relaunch',
  'relaunch',
  'tap',
  'tap',
  'tap',
  'read',
  'read',
  'read',
  'read',
  'stop',
  'stop',
  'pause',
  'resume',
  'retry',
  'retry',
  'natural ends',
  'system ends',
  'stray',
  'break render',
  'break load',
  'corrupt',
];

/** One step: an install event while the module downloads, a load's answer while one waits, else a reader's or the device's command. */
const stepOf = (w: World): Effect.Effect<Found> => {
  const roll = w.next();
  if (w.device.installing && roll < 0.4) return Effect.sync(() => installEvent(w));
  if (w.device.loads.length > 0 && roll < 0.55) return answerLoad(w);
  const command = pick(w.next, DRAWN);
  w.trail.push(command);
  return COMMANDS[command](w);
};

/** A world for one seed: the build, the stored choice, fuse and base, and the files present, all drawn. */
const worldOf = (seed: number, counts: Record<string, number>): World => {
  const next = random(seed * 104_729);
  const dev = next() < 0.5;
  const device = deviceOf(next);
  const storedChoice = pick(next, [undefined, 'off', 'her', 'him', 'her']);
  const storedFuse = pick(next, [undefined, undefined, 'blown', 'clear', 'Blown']);
  const [storedBase, devBase] = pick(next, BASES);
  for (const [key, value] of [
    [CHOICE_KEY, storedChoice],
    [FUSE_KEY, storedFuse],
    [BASE_KEY, storedBase],
  ] as const)
    if (value !== undefined) device.disk.set(key, value);
  return {
    seed,
    next,
    dev,
    base: dev ? devBase : MIRROR,
    device,
    m: {
      choice: 'her',
      fuse: 'clear',
      said: false,
      download: { _tag: 'Idle' },
      started: false,
      again: false,
      complete: false,
      reading: 'idle',
      active: 'system',
      utterance: 0,
      breaks: false,
      routes: new Map(),
      installs: [],
      storedFuse,
      storedChoice,
      fallbacks: 0,
    },
    trail: [],
    logged: { fallbacks: 0 },
    counts,
    launch: Option.none(),
  };
};

/** Runs one seeded history; the first broken rule, or none. */
const history = (seed: number, counts: Record<string, number>) => {
  const w = worldOf(seed, counts);
  return Effect.gen(function* () {
    const crash = w.device.marker;
    yield* open(w, crash);
    w.trail.push(crash ? 'launch!' : 'launch');
    for (let stepNo = 0; stepNo <= STEPS; stepNo++) {
      const found = stepNo === 0 ? undefined : yield* stepOf(w);
      if (found !== undefined) return found;
      yield* settle;
      const seen = yield* check(w);
      if (seen !== undefined) return seen;
    }
    if (w.dev && w.m.installs.some((each) => each !== MIRROR))
      count(w, 'dev installs from a local base');
    if (!w.dev && w.m.installs.length > 0) count(w, 'release installs');
    yield* Scope.close(current(w).scope, Exit.void);
    return undefined;
  }).pipe(
    Effect.provide(
      keptLogs((line) => {
        if (line.startsWith('natural.fallback ')) w.logged.fallbacks += 1;
      }),
    ),
  );
};

/** One launch of a device with every file present and Her stored, its load answered: the natural voice reads. */
const ready = Effect.gen(function* () {
  const device = deviceOf(() => 0.5);
  device.disk.set(CHOICE_KEY, 'her');
  const scope = yield* Scope.make();
  const built = yield* Layer.buildWithScope(voicesOf(device, false), scope);
  yield* settle;
  device.loaded = true;
  const answer = device.loads.shift();
  if (answer !== undefined) yield* Deferred.succeed(answer, 1);
  yield* settle;
  return { device, scope, voice: Context.get(built, Voice), natural: Context.get(built, Natural) };
});

describe('the router between the system voice and the natural voice', () => {
  it(`holds the owner's rules over ${HISTORIES} seeded histories of ${STEPS} steps`, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const counts: Record<string, number> = {};
        const broken: string[] = [];
        for (let seed = 1; seed <= HISTORIES && broken.length === 0; seed++) {
          const found = yield* history(seed, counts);
          if (found !== undefined) broken.push(found);
        }
        expect(broken).toEqual([]);
        const short = Object.entries(FLOORS)
          .filter(([name, floor]) => (counts[name] ?? 0) < floor)
          .map(([name, floor]) => `${name} ${counts[name] ?? 0} < ${floor}`);
        expect(short).toEqual([]);
      }),
    ));

  it('reads a natural speak that fails before its first audio by the system voice, the same utterance, and logs it', () => {
    const lines: string[] = [];
    return Effect.runPromise(
      Effect.gen(function* () {
        const { device, scope, voice, natural } = yield* ready;
        const readsBefore = yield* natural.reads;
        device.breakRender = true;
        yield* voice.read('grace and peace.');
        yield* settle;
        const status = (yield* voice.view).status;
        yield* Scope.close(scope, Exit.void);
        expect({
          readsBefore,
          rendered: device.rendered.get(1),
          spoken: device.system.speaks.get(1),
          status,
        }).toEqual({
          readsBefore: true,
          rendered: 'af_heart.bin',
          spoken: SYSTEM_ID,
          status: 'reading',
        });
        expect(lines.filter((line) => line.startsWith('natural.fallback '))).toEqual([
          'natural.fallback {"utterance":1,"reason":"the natural voice could not read the first chunk"}',
        ]);
      }).pipe(Effect.provide(keptLogs((line) => void lines.push(line)))),
    );
  });

  it('a stop returns only once the system voice and the natural voice have both stopped', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { device, scope, voice } = yield* ready;
        yield* voice.read('grace and peace.');
        yield* settle;
        const holding = device.holding;
        const before = { system: device.system.stops, natural: device.module.stops };
        yield* voice.stop;
        const after = {
          inflight: device.inflight.count,
          system: device.system.stops - before.system,
          natural: device.module.stops - before.natural,
          holding: device.holding,
          status: (yield* voice.view).status,
        };
        yield* Scope.close(scope, Exit.void);
        expect({ holding, after }).toEqual({
          holding: 1,
          after: { inflight: 0, system: 1, natural: 1, holding: undefined, status: 'idle' },
        });
      }).pipe(Effect.provide(keptLogs(() => undefined))),
    ));

  it('lights each word of a natural reading from the module’s ranges, and a seek reads on in the natural voice from the word sought, the words before it lit', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { device, scope, voice } = yield* ready;
        const text = 'and the light was good and the earth was';
        const spans = [...text.matchAll(/\S+/gu)].map((word) => ({
          location: word.index,
          length: word[0].length,
        }));
        const emit = (
          utterance: number,
          kind: VoiceEvent['kind'],
          at = { location: 0, length: 0 },
        ) =>
          Effect.sync(() => {
            for (const listener of device.moduleListeners) listener({ utterance, kind, ...at });
          });
        const lit = Effect.map(voice.view, (view) => view.lit);
        yield* voice.read(text);
        yield* settle;
        const reading: number[] = [];
        for (const span of spans.slice(0, 3)) {
          yield* emit(1, 'range', span);
          reading.push(yield* lit);
        }
        const offset = spans[6]?.location ?? 0;
        yield* voice.seek(6);
        yield* settle;
        const sought = yield* lit;
        const next = spans[7] ?? { location: 0, length: 0 };
        yield* emit(2, 'range', { location: next.location - offset, length: next.length });
        const after = yield* lit;
        yield* emit(2, 'finish');
        const end = yield* voice.view;
        yield* Scope.close(scope, Exit.void);
        expect({
          reading,
          sought,
          after,
          end: [end.ended, end.lit],
          packs: [device.rendered.get(1), device.rendered.get(2)],
          system: device.system.speaks.size,
        }).toEqual({
          reading: [1, 2, 3],
          sought: 6,
          after: 8,
          end: ['finished', 9],
          packs: ['af_heart.bin', 'af_heart.bin'],
          system: 0,
        });
      }).pipe(Effect.provide(keptLogs(() => undefined))),
    ));
});
