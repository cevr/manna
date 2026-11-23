/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noGlobals, effect/noNewPromise, no-await-in-loop -- a test model: each step is awaited as Exact asks its sources one by one, the storage stand-in answers with promises and refuses a write by a throw, and the oracle runs the current app's garden by `Effect.runPromise` under a TestClock. */

/**
 * Move back a stage on Today (spec par-hs-back), generated histories run
 * on the port and on the current Heartseed side by side. A history plants
 * three verses and recalls them to random stages (some never), then walks
 * Today: a verse shown by a tap or met in the day's run (and one never
 * planted), a recital started, finished and let go, Show all, taps of the
 * control, `Move back` pressed one to five times before its answers land,
 * Keep, the save failing then succeeding, a call of the step back crashing
 * (the port's garden source rejects; the current app's run dies and its
 * control takes the run's exit by `answerOf`), answers landing late (after
 * Today left the verse, after it came back and opened a newer ask), and the
 * app relaunched with presses in flight (each kept or lost, its answer
 * going nowhere). Each late kind is reached at least three times.
 *
 * The port: its own sources (`backSources` over `gardenSources`, and
 * Today's rule `backOn`) over a stand-in for Exact's storage, with the
 * wiring of `features/back.contract`: the place sent at each change, the
 * presses of the latest pressed ask counted, each answer landing and Today
 * read again. The current app: `MoveBack` as `back.tsx` holds it
 * (`barAfter`; a fresh state at each mount, keyed by the verse, mounted
 * while `offersBack` holds on a planted verse; disabled while a press of
 * this mount runs; an answer to an unmounted control dropped), over its own
 * `Garden` and `Backs`, built once for the launch over the same entries.
 *
 * After every step both draw the same: the control and whether it is
 * disabled, the ask's words, its two answers and whether they are
 * disabled, the moved line and the alert; both gardens hold the same stage
 * and steps back for every verse; no step lowers a verse more than one
 * stage; and the steps back kept are never more than the asks pressed.
 * It misses the drawing itself, which `back.test.contract` owns.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import type { FileStorage } from '@manna/exact-kit/storage';
import {
  backOf,
  Backs,
  Chime,
  Garden,
  layer as gardenLayer,
  stageOf,
  type BackAnswer,
  type BackAsk,
  type GardenView,
  type Stage,
} from '@manna/heartseed/garden';
import {
  alertLine,
  answerOf,
  askLine,
  barAfter,
  IDLE,
  movedLine,
  offersBack,
  type Bar,
} from '@manna/heartseed/garden/bar';
import { verseReference } from '@manna/heartseed/passages';
import { expect, it } from 'bun:test';
import { Effect, Exit, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { TestClock } from 'effect/testing';

import { GARDEN_FILE, readGarden } from '../garden/program';
import { gardenSources } from '../garden/sources';
import { seeded, type Random } from '../test/random';
import { backOn } from './shown';
import { backSources, type BackGarden, type BackView } from './sources';

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const MINUTE = 60_000;
const DAY = 86_400_000;
const RANK: readonly Stage[] = ['seed', 'blade', 'ear', 'full corn'];
const HISTORIES = 40;
const STEPS = 24;

/** The verses a history plants (book, chapter, verse), and one it never plants. */
const VERSES: ReadonlyArray<readonly [number, number, number]> = [
  [43, 3, 16],
  [19, 23, 1],
  [23, 41, 10],
];
const PLANTABLE = VERSES.map(([book, chapter, verse]) => verseReference(book, chapter, verse));
const UNPLANTED = verseReference(45, 8, 28);

const STORE = { forget: () => undefined };

/** What one side draws: the control and its state, the ask's words, its answers' state, the moved line and the alert. */
interface Drawn {
  readonly control: 'none' | 'enabled' | 'disabled';
  readonly ask: string;
  readonly answers: 'none' | 'enabled' | 'disabled';
  readonly moved: string;
  readonly alert: string;
}

const NOTHING: Drawn = { control: 'none', ask: '', answers: 'none', moved: '', alert: '' };

/** Today's verse, as the model walks it. */
interface Place {
  reference: string;
  visited: boolean;
  held: boolean;
  listening: boolean;
  done: boolean;
  shownAll: boolean;
}

/** The faults a history turns on and off: the store refusing its writes, and a call of the step back crashing (the port's source rejects, the current app's run dies). */
interface Faults {
  failing: boolean;
  crashing: boolean;
}

/** A storage stand-in whose writes `state.failing` refuses. */
const storageOf = (state: Faults) => {
  const files = new Map<string, ArrayBuffer>();
  const storage: FileStorage = {
    fs: {
      readFile: async (path) => {
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path, data) => {
        if (state.failing) throw new Error('the write is refused');
        files.set(path, Uint8Array.from(data).buffer);
      },
    },
  };
  return { files, storage };
};

/** The current app's store over `map`, kept across launches: its writes refused while `state.failing`, and dying while `state.crashing`. */
const oracleStore = (map: Map<string, string>, state: Faults) => {
  const refused = (method: string, key: string) =>
    state.crashing
      ? Effect.die(new Error('the step back crashed'))
      : Effect.fail(new KeyValueStore.KeyValueStoreError({ method, key, message: 'refused' }));
  return KeyValueStore.make({
    get: (key) => Effect.sync(() => map.get(key)),
    getUint8Array: (key) =>
      Effect.sync(() => {
        const value = map.get(key);
        return value === undefined ? undefined : new TextEncoder().encode(value);
      }),
    set: (key, value) =>
      state.failing || state.crashing
        ? refused('set', key)
        : Effect.sync(() => {
            map.set(key, value instanceof Uint8Array ? new TextDecoder().decode(value) : value);
          }),
    remove: (key) =>
      state.failing || state.crashing
        ? refused('remove', key)
        : Effect.sync(() => {
            map.delete(key);
          }),
    clear: Effect.sync(() => map.clear()),
    size: Effect.sync(() => map.size),
    keys: Effect.sync(() => [...map.keys()]),
  });
};

/** Each plant's stage and its count of steps back, by reference. */
const stagesOf = (garden: GardenView) => {
  if (garden._tag === 'Unread') return 'Unread';
  return Object.fromEntries(
    [...garden.plants.entries()].map(([reference, plant]) => [
      reference,
      { stage: stageOf(plant), backs: plant.backs.length },
    ]),
  );
};

const backsIn = (garden: GardenView) => {
  if (garden._tag === 'Unread') return 0;
  return [...garden.plants.values()].reduce((sum, plant) => sum + plant.backs.length, 0);
};

const stageIn = (garden: GardenView, reference: string): Option.Option<Stage> => {
  if (garden._tag === 'Unread') return Option.none();
  return Option.map(Option.fromUndefinedOr(garden.plants.get(reference)), stageOf);
};

/** Plants the three verses on the port and recalls each to a random stage; answers the instant after. */
const grow = async (
  random: Random,
  storage: FileStorage,
  garden: ReturnType<typeof gardenSources>,
) => {
  let now = START;
  for (const [book, chapter, verse] of VERSES)
    await withDataHost(() =>
      garden.gardenPlant([book, chapter, verse, verse, now, 0, 1], STORE, storage),
    );
  for (let round = 0; round < 6; round++)
    for (const reference of PLANTABLE) {
      if (!random.chance(0.6)) continue;
      now += (1 + random.below(30)) * DAY;
      const grade = random.pick([1, 3, 3, 4, 4, 4]);
      await withDataHost(() =>
        garden.gardenRecall(
          [
            reference,
            {
              startedAt: now,
              offset: 0,
              grade,
              suggested: Math.min(3, grade),
              words: 10,
              missed: grade === 1 ? 6 : 0,
              peeked: 0,
              extra: 0,
            },
            { peeked: [], shownAt: null, cap: 4 },
            now,
            0,
            1,
          ],
          STORE,
          storage,
        ),
      );
    }
  return now + DAY;
};

/** One history of `seed`: both sides walked step by step and compared after each; `seen` gathers the states reached. */
const runHistory = async (seed: number, seen: Set<string>, tally: Map<string, number>) => {
  const random = seeded(seed);
  const faults: Faults = { failing: false, crashing: false };
  const stand = storageOf(faults);
  let garden = gardenSources({ host: HOST, quiet: true });
  let now = await grow(random, stand.storage, garden);
  const portRead = async () =>
    (await runCall(readGarden(stand.storage), { now, seed }, HOST)).garden;

  const file = stand.files.get(GARDEN_FILE);
  const kept = new Map<string, string>(
    file === undefined ? [] : JSON.parse(new TextDecoder().decode(file)),
  );
  /** The current app's launch: its own `Garden` and `Backs` built over the store kept across launches. */
  const launchApp = async () => {
    const scope = await Effect.runPromise(Scope.make());
    const context = await Effect.runPromise(
      Layer.buildWithScope(
        gardenLayer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(KeyValueStore.KeyValueStore, oracleStore(kept, faults)),
              Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
            ),
          ),
          Layer.provideMerge(Layer.mergeAll(TestClock.layer(), Logger.layer([]))),
        ),
        scope,
      ),
    );
    return { scope, context };
  };
  let launched = await launchApp();
  const appExit = <A>(effect: Effect.Effect<A, never, Garden | Backs>) =>
    Effect.runPromiseExit(
      Effect.andThen(TestClock.setTime(now), effect).pipe(Effect.provideContext(launched.context)),
    );
  const app = async <A>(effect: Effect.Effect<A, never, Garden | Backs>) =>
    Exit.match(await appExit(effect), {
      onSuccess: (value) => value,
      onFailure: (cause) => {
        throw new Error(`the current app's garden failed: ${String(cause)}`);
      },
    });
  const appView = () => app(Effect.flatMap(Garden, (each) => each.view));
  /** The current app's answer to `ask`, as its control takes a run of the step back (`answerOf`). */
  const appBack = async (ask: BackAsk) =>
    answerOf(await appExit(Effect.flatMap(Backs, (backs) => backs.back(ask))));

  /** The port's garden as the step back reaches it: its source rejects while a call crashes. */
  const backGarden = (sources: ReturnType<typeof gardenSources>): BackGarden => ({
    gardenBackFrom: (args, store, storage) =>
      faults.crashing
        ? Promise.reject(new Error('the step back crashed'))
        : sources.gardenBackFrom(args, store, storage),
  });
  let back = backSources(backGarden(garden));
  const call = <A>(run: () => A) => withDataHost(run);
  let launch = 1;

  const place: Place = {
    reference: random.pick(PLANTABLE),
    visited: true,
    held: false,
    listening: false,
    done: false,
    shownAll: false,
  };

  let portView: BackView = call(() => back.todayBackBoot());
  let pressed = 0;
  let presses = 0;
  const inflight: Array<{ readonly ask: number; readonly mount: number }> = [];
  const askedPressed = new Set<string>();
  const count = (what: string) => tally.set(what, (tally.get(what) ?? 0) + 1);

  let bar: Bar = IDLE;
  let mount = 0;
  let mounted = false;
  let mountedOn = '';
  const opened = new Map<number, BackAsk>();

  const stageWord = (garden: GardenView) =>
    Option.match(stageIn(garden, place.reference), {
      onNone: () => 'not planted',
      onSome: (stage): string => stage,
    });
  const appStage = async () => stageIn(await appView(), place.reference);

  /** Today's place sent to the port (the Contract's `todayBackFollow`) and the current app's mount followed. */
  const settle = async () => {
    const read = await portRead();
    const offered = backOn(
      Option.some({
        piece: { reference: place.reference },
        item: Option.some(place.reference),
        held: place.held,
        done: place.done,
      }),
      Option.some({ visit: place.visited ? [{ piece: { reference: place.reference } }] : [] }),
      read._tag === 'Read' ? Option.some(read) : Option.none(),
      place.listening,
      place.shownAll,
    );
    portView = call(() => back.todayBackSeen([place.reference, stageWord(read), offered]));
    const on =
      Option.isSome(await appStage()) &&
      offersBack({
        listening: place.listening,
        recital: place.held,
        done: place.done,
        shownAll: place.shownAll,
        visited: place.visited,
      });
    if (on && (!mounted || mountedOn !== place.reference)) {
      mount += 1;
      bar = IDLE;
    }
    if (!on) bar = IDLE;
    mounted = on;
    mountedOn = place.reference;
  };

  const portDrawn = (): Drawn => {
    if (portView.reference !== place.reference) return NOTHING;
    const running = presses > 0 && pressed === portView.ask;
    const asking = portView.offers && portView.status === 'Asking';
    const state = running ? 'disabled' : 'enabled';
    return {
      control: portView.offers && !asking ? state : 'none',
      ask: asking ? portView.askLine : '',
      answers: asking ? state : 'none',
      moved: portView.moved,
      alert: portView.alert,
    };
  };

  const appDrawn = async (): Promise<Drawn> => {
    if (!mounted) return NOTHING;
    const running = inflight.some((each) => each.mount === mount);
    const landing = Option.flatMap(await appStage(), backOf);
    const asking = Option.isSome(landing) && bar.status === 'Asking';
    const state = running ? 'disabled' : 'enabled';
    return {
      control: Option.isSome(landing) && !asking ? state : 'none',
      ask: Option.match(
        Option.filter(landing, () => asking),
        {
          onNone: () => '',
          onSome: (to) => askLine(place.reference, to),
        },
      ),
      answers: asking ? state : 'none',
      moved: bar.status === 'Moved' ? movedLine(bar.stage) : '',
      alert: bar.status === 'Refused' ? alertLine(place.reference) : '',
    };
  };

  /** The `index`th press in flight landing on both sides: its step back, then its answer. */
  const land = async (index: number) => {
    const [press] = inflight.splice(index, 1);
    if (press === undefined) return;
    if (portView.status === 'Asking' && portView.ask > press.ask) count('late over a newer ask');
    if (press.mount !== mount || !mounted) count('late after the control left');
    if (faults.crashing) count('crashed');
    const moved = await call(() =>
      back.todayBackMove([press.ask, now, 0, seed], STORE, stand.storage),
    );
    if (moved.ask === pressed) presses -= 1;
    portView = call(() => back.todayBackAnswered([moved.ask, moved.answer]));
    const ask = opened.get(press.ask);
    if (ask !== undefined) {
      const answer: BackAnswer = await appBack(ask);
      if (press.mount === mount && mounted) bar = barAfter(bar, { type: 'answered', ask, answer });
    }
    await settle();
  };

  /** A verse shown anew: by a tap or met in the run, planted or not. */
  const show = async () => {
    place.reference = random.chance(0.1) ? UNPLANTED : random.pick(PLANTABLE);
    place.visited = random.chance(0.7);
    place.held = false;
    place.listening = false;
    place.done = false;
    place.shownAll = false;
  };
  const say = async () => {
    if (place.held) return;
    place.held = true;
    place.listening = true;
  };
  const finish = async () => {
    place.listening = false;
  };
  const next = async () => {
    if (!place.held || place.listening) return;
    place.held = false;
    place.done = true;
  };
  const showAll = async () => {
    if (!place.held) place.shownAll = true;
  };
  const tap = async () => {
    if (portDrawn().control !== 'enabled') return;
    const read = await portRead();
    portView = call(() => back.todayBackOpen([place.reference, stageWord(read)]));
    const ask: BackAsk = { reference: place.reference, from: Option.getOrThrow(await appStage()) };
    opened.set(portView.ask, ask);
    bar = barAfter(bar, { type: 'opened', ask });
  };
  /** `Move back` pressed one to five times before an answer lands; often every answer then lands, else they land later, by `land`, a press or the end. */
  const press = async () => {
    if (portDrawn().answers !== 'enabled') return;
    const times = 1 + random.below(5);
    if (pressed !== portView.ask) presses = 0;
    pressed = portView.ask;
    presses += times;
    askedPressed.add(`${launch}:${portView.ask}`);
    for (let each = 0; each < times; each++) inflight.push({ ask: portView.ask, mount });
    if (random.chance(0.4)) while (inflight.length > 0) await land(0);
  };
  const keep = async () => {
    if (portDrawn().answers !== 'enabled') return;
    portView = call(() => back.todayBackKeep());
    bar = barAfter(bar, { type: 'kept' });
  };
  const fail = async () => {
    faults.failing = !faults.failing;
  };
  /**
   * A call of the step back crashing, or no longer: turned only while no
   * press is in flight. The current app's `Backs` keeps no answer for a run
   * that died, so a later press of the same ask runs again, where the port
   * gives every press its ask's first answer (`Failed`): a crash that
   * clears between two presses of one ask is a named difference, not drawn.
   */
  const crash = async () => {
    if (inflight.length === 0) faults.crashing = !faults.crashing;
  };
  const late = async () => {
    if (inflight.length > 0) await land(random.below(inflight.length));
  };
  /** Today left for another verse and back to this one by a tap, while presses may be in flight, and most often a new ask opened there at once. */
  const away = async () => {
    const from = place.reference;
    await show();
    if (place.reference === from) place.reference = UNPLANTED;
    await settle();
    place.reference = from;
    place.visited = true;
    await settle();
    if (random.chance(0.7)) await tap();
  };
  /**
   * The app relaunched: each press in flight either kept its step back
   * before the end (its answer goes nowhere, the launch that would take it
   * gone) or never ran; both sides start again over what the store keeps,
   * the port's sources and the current app's garden new.
   */
  const relaunch = async () => {
    if (inflight.length > 0) count('relaunched with presses in flight');
    for (const each of inflight.splice(0)) {
      if (!random.chance(0.5)) continue;
      count('kept by a launch that ended');
      await call(() => back.todayBackMove([each.ask, now, 0, seed], STORE, stand.storage));
      const ask = opened.get(each.ask);
      if (ask !== undefined) await appBack(ask);
    }
    await Effect.runPromise(Scope.close(launched.scope, Exit.void));
    launched = await launchApp();
    garden = gardenSources({ host: HOST, quiet: true });
    back = backSources(backGarden(garden));
    launch += 1;
    portView = call(() => back.todayBackBoot());
    opened.clear();
    pressed = 0;
    presses = 0;
    bar = IDLE;
    mounted = false;
  };

  /** The steps, each with its share of a hundred. */
  const steps: ReadonlyArray<readonly [number, string, () => Promise<void>]> = [
    [8, 'show', show],
    [4, 'say', say],
    [3, 'finish', finish],
    [3, 'next', next],
    [3, 'show all', showAll],
    [18, 'tap', tap],
    [18, 'press', press],
    [4, 'keep', keep],
    [5, 'fail', fail],
    [4, 'crash', crash],
    [10, 'away', away],
    [5, 'relaunch', relaunch],
    [15, 'land', late],
  ];
  const pick = (): readonly [number, string, () => Promise<void>] => {
    let roll = random.below(100);
    for (const step of steps) {
      if (roll < step[0]) return step;
      roll -= step[0];
    }
    return [0, 'show', show];
  };

  const startBacks = backsIn(await portRead());

  /** Every check after one step, `before` the port's garden before it. */
  const check = async (where: string, before: GardenView) => {
    const after = await portRead();
    expect({ where, drawn: portDrawn() }).toEqual({ where, drawn: await appDrawn() });
    expect({ where, garden: stagesOf(after) }).toEqual({
      where,
      garden: stagesOf(await appView()),
    });
    for (const reference of PLANTABLE) {
      const fell = Option.getOrElse(
        Option.map(
          Option.all([stageIn(before, reference), stageIn(after, reference)]),
          ([was, is]) => RANK.indexOf(was) - RANK.indexOf(is),
        ),
        () => 0,
      );
      expect({ where, reference, fell: fell <= 1 }).toEqual({ where, reference, fell: true });
    }
    expect({ where, kept: backsIn(after) - startBacks <= askedPressed.size }).toEqual({
      where,
      kept: true,
    });
  };

  await settle();
  for (let index = 0; index < STEPS; index++) {
    now += MINUTE;
    const before = await portRead();
    const [, label, step] = pick();
    await step();
    await settle();
    await check(`seed ${seed} step ${index} ${label}`, before);
    seen.add(`${label}:${portDrawn().control}:${portView.status}`);
  }
  while (inflight.length > 0) await land(0);
  await check(`seed ${seed} end`, await portRead());
  await Effect.runPromise(Scope.close(launched.scope, Exit.void));
};

it(`draws what the current Today draws, and moves a verse at most one stage per ask, over ${HISTORIES} generated histories`, async () => {
  const seen = new Set<string>();
  const tally = new Map<string, number>();
  for (let seed = 1; seed <= HISTORIES; seed++) await runHistory(seed, seen, tally);
  for (const late of [
    'late over a newer ask',
    'late after the control left',
    'crashed',
    'relaunched with presses in flight',
    'kept by a launch that ended',
  ])
    expect({ late, often: (tally.get(late) ?? 0) >= 3 }).toEqual({ late, often: true });
  for (const state of ['Asking', 'Kept', 'Moved', 'Refused'])
    expect({ state, reached: [...seen].some((each) => each.endsWith(`:${state}`)) }).toEqual({
      state,
      reached: true,
    });
  for (const drawn of ['enabled', 'none'])
    expect({ drawn, reached: [...seen].some((each) => each.includes(`:${drawn}:`)) }).toEqual({
      drawn,
      reached: true,
    });
});
