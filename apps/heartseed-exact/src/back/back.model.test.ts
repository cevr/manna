/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noGlobals, effect/noNewPromise, no-await-in-loop -- a test model: each step is awaited as Exact asks its sources one by one, the storage stand-in answers with promises and refuses a write by a throw, and the oracle runs the current app's garden by `Effect.runPromise` under a TestClock. */

/**
 * Move back a stage on Today (spec par-hs-back), generated histories run
 * on the port and on the current Heartseed side by side. A history plants
 * three verses and recalls them to random stages (some never), then walks
 * Today: a verse shown by a tap or met in the day's run (and one never
 * planted), a recital started, finished and let go, Show all, taps of the
 * control, `Move back` pressed one to five times before its answers land,
 * Keep, the save failing then succeeding, and answers landing late (after
 * the control left, came back and opened a second ask).
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
import { backSources, type BackView } from './sources';

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

/** A storage stand-in whose writes `state.failing` refuses. */
const storageOf = () => {
  const files = new Map<string, ArrayBuffer>();
  const state = { failing: false };
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
  return { files, state, storage };
};

/** The current app's store over `entries`, its writes refused while `state.failing`. */
const oracleStore = (
  entries: ReadonlyArray<readonly [string, string]>,
  state: { readonly failing: boolean },
) => {
  const map = new Map<string, string>(entries);
  const refused = (method: string, key: string) =>
    Effect.fail(new KeyValueStore.KeyValueStoreError({ method, key, message: 'refused' }));
  return KeyValueStore.make({
    get: (key) => Effect.sync(() => map.get(key)),
    getUint8Array: (key) =>
      Effect.sync(() => {
        const value = map.get(key);
        return value === undefined ? undefined : new TextEncoder().encode(value);
      }),
    set: (key, value) =>
      state.failing
        ? refused('set', key)
        : Effect.sync(() => {
            map.set(key, value instanceof Uint8Array ? new TextDecoder().decode(value) : value);
          }),
    remove: (key) =>
      state.failing
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
const runHistory = async (seed: number, seen: Set<string>) => {
  const random = seeded(seed);
  const stand = storageOf();
  const garden = gardenSources({ host: HOST, quiet: true });
  let now = await grow(random, stand.storage, garden);
  const portRead = async () =>
    (await runCall(readGarden(stand.storage), { now, seed }, HOST)).garden;

  const file = stand.files.get(GARDEN_FILE);
  const entries: ReadonlyArray<readonly [string, string]> =
    file === undefined ? [] : JSON.parse(new TextDecoder().decode(file));
  const failing = { failing: false };
  const scope = await Effect.runPromise(Scope.make());
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      gardenLayer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(KeyValueStore.KeyValueStore, oracleStore(entries, failing)),
            Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
          ),
        ),
        Layer.provideMerge(Layer.mergeAll(TestClock.layer(), Logger.layer([]))),
      ),
      scope,
    ),
  );
  const app = <A>(effect: Effect.Effect<A, never, Garden | Backs>) =>
    Effect.runPromise(
      Effect.andThen(TestClock.setTime(now), effect).pipe(Effect.provideContext(context)),
    );
  const appView = () => app(Effect.flatMap(Garden, (each) => each.view));

  const back = backSources(garden);
  const call = <A>(run: () => A) => withDataHost(run);

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
  const askedPressed = new Set<number>();

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
    const moved = await call(() =>
      back.todayBackMove([press.ask, now, 0, seed], STORE, stand.storage),
    );
    if (moved.ask === pressed) presses -= 1;
    portView = call(() => back.todayBackAnswered([moved.ask, moved.answer]));
    const ask = opened.get(press.ask);
    if (ask !== undefined) {
      const answer: BackAnswer = await app(Effect.flatMap(Backs, (backs) => backs.back(ask)));
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
  /** `Move back` pressed one to five times before an answer lands; most often every answer then lands. */
  const press = async () => {
    if (portDrawn().answers !== 'enabled') return;
    const times = 1 + random.below(5);
    if (pressed !== portView.ask) presses = 0;
    pressed = portView.ask;
    presses += times;
    askedPressed.add(portView.ask);
    for (let each = 0; each < times; each++) inflight.push({ ask: portView.ask, mount });
    if (random.chance(0.6)) while (inflight.length > 0) await land(0);
  };
  const keep = async () => {
    if (portDrawn().answers !== 'enabled') return;
    portView = call(() => back.todayBackKeep());
    bar = barAfter(bar, { type: 'kept' });
  };
  const fail = async () => {
    stand.state.failing = !stand.state.failing;
    failing.failing = stand.state.failing;
  };
  const late = async () => {
    if (inflight.length > 0) await land(random.below(inflight.length));
  };

  /** The steps, each with its share of a hundred. */
  const steps: ReadonlyArray<readonly [number, string, () => Promise<void>]> = [
    [12, 'show', show],
    [6, 'say', say],
    [4, 'finish', finish],
    [4, 'next', next],
    [3, 'show all', showAll],
    [21, 'tap', tap],
    [20, 'press', press],
    [6, 'keep', keep],
    [8, 'fail', fail],
    [16, 'land', late],
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
  await Effect.runPromise(Scope.close(scope, Exit.void));
};

it(`draws what the current Today draws, and moves a verse at most one stage per ask, over ${HISTORIES} generated histories`, async () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= HISTORIES; seed++) await runHistory(seed, seen);
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
