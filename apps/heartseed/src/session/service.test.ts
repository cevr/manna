/* oxlint-disable effect/noGlobals, effect/noNullish -- the store stand-in keeps its disk and its faults in plain maps and sets a case changes between steps, and answers a missing key as undefined, as the store does; the zone is the host's, switched through `process.env.TZ` and put back when the case ends. */

/**
 * The session service over a store in memory and a garden a case changes
 * by hand, under a test clock and a host zone the case sets. Generated
 * launches hold it to the minutes' rules (S8, S15) and the plan's moment
 * (S11): the stored text is read once per launch, as `5` unless it is one of
 * the four texts or when its read fails; only a tap writes, the store ends
 * at the last landed tap, and a refused write keeps the choice for the
 * launch alone; the plan is made at Today's first `begin` with a read
 * garden, at the clock's instant and the zone's offset there, then again at
 * each tap, and never by time passing, a keep landing or a later `begin`.
 * Over the app's own garden, a plan made while a keep is under way is made
 * from the view before it, at the instant of the begin or the tap, and the
 * keep, once it lands, counts its item done.
 * The oracle is `src/test/session-model.ts` with its own days and `Intl`'s
 * zones, never the service's helpers.
 */

import { describe, expect, it } from 'bun:test';
import {
  Array as Arr,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  Option,
  Scope,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as TestClock from 'effect/testing/TestClock';

import { Dictation } from '../dictation';
import { initial } from '../dictation/attempt';
import { Chime, Garden, layer as gardenLayer, plantOf, type GardenView } from '../garden';
import { Recalls, type Grade, type Recall } from '../sayit';
import { countsOf, MINUTES, type Minutes } from '../session';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
import {
  countsModel,
  DAY,
  dueModel,
  HOUR,
  MINUTE,
  planModel,
  type ModelPiece,
} from '../test/session-model';
import { hostZone, offsetIn, restore, travel, ZONES } from '../test/zone';
import { layer, MINUTES_KEY, Session } from './service';

/** Texts a disk may hold under the key that are none of the four: each reads as 5. */
const BAD_TEXTS: readonly string[] = ['7', '', '05', '"10"', '10.0', 'ten', '20 ', '0', 'null'];

const STORED: readonly [string | undefined, ...(string | undefined)[]] = [
  undefined,
  '2',
  '5',
  '10',
  '20',
  ...BAD_TEXTS,
];

/** What the minutes read as, by the rule (S8): one of the four texts, else 5. */
const minutesRule = (text: string | undefined) =>
  MINUTES.find((each) => String(each) === text) ?? 5;

const failure = (method: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method });

/** The device's disk, the faults of the launch under way, and every write it was asked for. */
interface Disk {
  readonly map: Map<string, string>;
  readonly failGet: Set<string>;
  readonly failSet: Set<string>;
  /** A write to hold until its gate opens. */
  hold: Option.Option<Deferred.Deferred<void>>;
  readonly sets: string[];
  /** Each value a write was asked to put, in the order the writes began. */
  readonly values: string[];
  /** Each write's ordinal from the first, with how it ended, in the order the writes ended. */
  readonly settled: { readonly ordinal: number; readonly outcome: 'landed' | 'refused' }[];
  /** The fault of each write by its order, from the first: held until a gate opens, refused, or both. */
  readonly script: readonly {
    readonly gate: Option.Option<Deferred.Deferred<void>>;
    readonly refuse: boolean;
  }[];
}

/** A disk holding `text` under the key, or nothing when it is absent. */
const diskOf = (text: string | undefined): Disk => {
  const map = new Map<string, string>();
  if (text !== undefined) map.set(MINUTES_KEY, text);
  return {
    map,
    failGet: new Set(),
    failSet: new Set(),
    hold: Option.none(),
    sets: [],
    values: [],
    settled: [],
    script: [],
  };
};

type WriteFault = 'ok' | 'held' | 'refused' | 'held-refused';

/** A disk holding `text` whose writes, in order, meet `faults`; the gates of the held ones, in order. */
const faultyDisk = (text: string | undefined, faults: readonly { readonly fault: WriteFault }[]) =>
  Effect.gen(function* () {
    const gates: Deferred.Deferred<void>[] = [];
    const script = [];
    for (const { fault } of faults) {
      let gate = Option.none<Deferred.Deferred<void>>();
      if (fault.startsWith('held')) {
        const made = yield* Deferred.make<void>();
        gates.push(made);
        gate = Option.some(made);
      }
      script.push({ gate, refuse: fault.endsWith('refused') });
    }
    const disk: Disk = { ...diskOf(text), script };
    return { disk, gates, values: disk.values };
  });

/** `list` in an order `next` draws. */
const shuffled = <A>(next: () => number, list: readonly A[]) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(next, i + 1);
    [out[i], out[j]] = [out[j] as A, out[i] as A];
  }
  return out;
};

const storeOf = (disk: Disk) =>
  KeyValueStore.makeStringOnly({
    get: (key) =>
      Effect.suspend(() => {
        if (disk.failGet.has(key)) return Effect.fail(failure('get'));
        return Effect.succeed(disk.map.get(key));
      }),
    set: (key, value) =>
      Effect.gen(function* () {
        disk.sets.push(key);
        disk.values.push(value);
        const ordinal = disk.values.length - 1;
        const scripted = disk.script[ordinal];
        const gate = Option.orElse(
          Option.flatMap(Option.fromNullishOr(scripted), (each) => each.gate),
          () => disk.hold,
        );
        disk.hold = Option.none();
        if (Option.isSome(gate)) yield* Deferred.await(gate.value);
        if (disk.failSet.has(key) || scripted?.refuse === true) {
          disk.settled.push({ ordinal, outcome: 'refused' });
          return yield* failure('set');
        }
        disk.map.set(key, value);
        disk.settled.push({ ordinal, outcome: 'landed' });
      }),
    remove: (key) => Effect.sync(() => void disk.map.delete(key)),
    clear: Effect.sync(() => disk.map.clear()),
    size: Effect.sync(() => disk.map.size),
    keys: Effect.sync(() => [...disk.map.keys()]),
  });

/** A garden a case changes by hand: its read plants by reference, or unread; `settled` waits on `pending` while a keep is held. */
interface Field {
  read: boolean;
  readonly recalls: Map<string, Recall[]>;
  pending: Option.Option<Deferred.Deferred<void>>;
}

const emptyField = (): Field => ({ read: true, recalls: new Map(), pending: Option.none() });

const viewOf = (field: Field): GardenView => {
  if (!field.read) return { _tag: 'Unread' };
  const plants = new Map(
    [...field.recalls].flatMap(([reference, recalls]) =>
      Arr.match(recalls, {
        onEmpty: () => [],
        onNonEmpty: (some) => [[reference, plantOf(some)] as const],
      }),
    ),
  );
  return { _tag: 'Read', plants };
};

const gardenOf = (field: Field) =>
  Garden.of({
    view: Effect.sync(() => viewOf(field)),
    settled: Effect.suspend(() =>
      Option.match(field.pending, {
        onNone: () => Effect.sync(() => viewOf(field)),
        onSome: (gate) =>
          Effect.andThen(
            Deferred.await(gate),
            Effect.sync(() => viewOf(field)),
          ),
      }),
    ),
    changes: Stream.never,
  });

/** Dictation with no recital under way, as at every making of these cases. */
const idle = Layer.mock(Dictation)({ view: Effect.succeed(initial.view) });

/** The model's pieces as the session takes them; it plans by their counts, never their text. */
const textless = (pieces: readonly ModelPiece[]) => pieces.map((piece) => ({ ...piece, text: '' }));

/** One launch of the service, at `at`, in its own scope and test clock. */
const launch = (pieces: readonly ModelPiece[], disk: Disk, field: Field, at: number) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      layer(textless(pieces)).pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(KeyValueStore.KeyValueStore, storeOf(disk)),
            Layer.succeed(Garden, gardenOf(field)),
            idle,
          ),
        ),
        Layer.provideMerge(Layer.merge(TestClock.layer(), Logger.layer([]))),
      ),
      scope,
    );
    const session = Context.get(services, Session);
    const run = <A>(effect: Effect.Effect<A>) => Effect.provideContext(effect, services);
    yield* run(TestClock.setTime(at));
    return { scope, session, run };
  });

type Live = Effect.Success<ReturnType<typeof launch>>;

/** The fault a recall's write meets: held until its gate opens, then landed or refused. */
interface KeepFault {
  readonly gate: Deferred.Deferred<void>;
  readonly refuse: boolean;
}

/** A store over `map` whose recall writes meet the fault `faults` holds for their key, if any. */
const keepingStore = (map: Map<string, string>, faults: Map<string, KeepFault>) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => map.get(key)),
    set: (key, value) =>
      Effect.gen(function* () {
        const fault = faults.get(key);
        if (fault !== undefined) {
          yield* Deferred.await(fault.gate);
          if (fault.refuse) return yield* failure('set');
        }
        map.set(key, value);
      }),
    remove: (key) => Effect.sync(() => void map.delete(key)),
    clear: Effect.sync(() => map.clear()),
    size: Effect.sync(() => map.size),
    keys: Effect.sync(() => [...map.keys()]),
  });

/** One launch of the session over the app's own garden, which reads `map` and keeps recalls into it, at `at`. */
const launchKept = (
  pieces: readonly ModelPiece[],
  map: Map<string, string>,
  faults: Map<string, KeepFault>,
  at: number,
) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      layer(textless(pieces)).pipe(
        Layer.provideMerge(
          gardenLayer.pipe(
            Layer.provide(Layer.succeed(Chime, Chime.of({ grow: () => Effect.void }))),
          ),
        ),
        Layer.provide(idle),
        Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, keepingStore(map, faults))),
        Layer.provideMerge(Layer.merge(TestClock.layer(), Logger.layer([]))),
      ),
      scope,
    );
    const run = <A>(effect: Effect.Effect<A>) => Effect.provideContext(effect, services);
    yield* run(TestClock.setTime(at));
    return {
      scope,
      run,
      session: Context.get(services, Session),
      garden: Context.get(services, Garden),
      recalls: Context.get(services, Recalls),
    };
  });

/** The recalls `map` holds, by reference. */
const plantsIn = (map: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of map) {
    if (!key.startsWith(PREFIX)) continue;
    const recall: Recall = JSON.parse(value);
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  }
  return plants;
};

/** The service's counts line now, over its plan and the garden's view. */
const lineOf = (session: Session['Service'], garden: Garden['Service']) =>
  Effect.gen(function* () {
    const seen = yield* garden.view;
    const plan = (yield* session.view).plan;
    if (seen._tag === 'Unread') return Option.none<string>();
    return Option.map(plan, (made) => countsOf(made, seen));
  });

/** The next 04:00 on the host's wall clock after `at`: where one day of the reader's ends. */
const nextMorning = (zone: string, at: number) => {
  const wall = at + offsetIn(zone, at) * MINUTE;
  const morning = Math.floor((wall - 4 * HOUR) / DAY) * DAY + 4 * HOUR + DAY;
  return morning - offsetIn(zone, morning - offsetIn(zone, at) * MINUTE) * MINUTE;
};

const recallOf = (
  next: () => number,
  reference: string,
  startedAt: number,
  zone: string,
): Recall => {
  const grade = pickOf<Grade>(next, [1, 2, 3, 3, 4]);
  const record: Recall = {
    reference,
    startedAt,
    grade,
    suggested: pickOf<Recall['suggested']>(next, [1, 2, 3]),
    words: 1 + below(next, 60),
    missed: below(next, 3),
    peeked: below(next, 2),
    extra: 0,
  };
  if (next() < 0.1) return record;
  return { ...record, offset: offsetIn(zone, startedAt) };
};

const piecesOf = (next: () => number): ModelPiece[] => {
  const groups = 1 + below(next, 4);
  return Array.from({ length: 1 + below(next, 6) }, (_, index) => ({
    reference: `Book ${index + 1}:${1 + below(next, 3)}`,
    words: 1 + below(next, 90),
    group: `group ${below(next, groups)}`,
  }));
};

/** A garden of some of `pieces` and a verse no piece names, recalled up to a year before `at`, some today. */
const fieldOf = (next: () => number, pieces: readonly ModelPiece[], at: number, zone: string) => {
  const recalls = new Map<string, Recall[]>();
  for (const reference of [...pieces.map((piece) => piece.reference), 'Stray 1:1']) {
    if (next() < 0.35) continue;
    let t = at - pickOf(next, [HOUR, DAY, 9 * DAY, 40 * DAY, 365 * DAY]) * (0.2 + next());
    const kept: Recall[] = [];
    for (let i = 0, n = 1 + below(next, 5); i < n; i++) {
      kept.push(recallOf(next, reference, Math.round(t), zone));
      t += pickOf(next, [10 * MINUTE, 6 * HOUR, 2 * DAY, 20 * DAY]);
    }
    recalls.set(
      reference,
      kept.filter((each) => each.startedAt < at),
    );
  }
  return recalls;
};

const recallsByReference = (field: Field) =>
  new Map([...field.recalls].filter(([, recalls]) => recalls.length > 0));

/** An item as the service's plan and the model's both carry it. */
const itemOf = ({
  reference,
  fresh,
  recalls,
  seconds,
}: {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
}) => ({ reference, fresh, recalls, seconds });

type Items = ReturnType<typeof itemOf>[];

/** Every bucket a run of the generator reached, for the floor test. */
const reached = new Map<string, number>();
const bump = (key: string) => reached.set(key, (reached.get(key) ?? 0) + 1);

const storedBucket = (text: string | undefined) => {
  if (text === undefined) return 'absent';
  if (BAD_TEXTS.includes(text)) return 'bad';
  return text;
};

/** One generated device: its disk, garden, clock and zone, the launch under way, and what the rules say it must show and hold. */
class Device {
  readonly next: () => number;
  readonly zone: string;
  readonly pieces: ModelPiece[];
  now: number;
  readonly disk: Disk;
  readonly field: Field;
  /** The text the disk must hold under the key: the start's, then each landed tap's. */
  text: string | undefined;
  shown: Minutes;
  plan: Option.Option<Items> = Option.none();
  taps = 0;
  readonly trail: string[];

  constructor(readonly seed: number) {
    this.next = random(seed);
    this.zone = pickOf(this.next, ZONES);
    this.pieces = piecesOf(this.next);
    this.now =
      Date.UTC(2020 + below(this.next, 10), below(this.next, 12), 1 + below(this.next, 27)) +
      below(this.next, DAY);
    this.text = pickOf(this.next, STORED);
    this.disk = diskOf(this.text);
    this.field = {
      read: this.next() > 0.2,
      recalls: fieldOf(this.next, this.pieces, this.now, this.zone),
      pending: Option.none(),
    };
    this.shown = minutesRule(this.text);
    this.trail = [`zone=${this.zone} stored=${JSON.stringify(this.text)} read=${this.field.read}`];
    bump(`stored:${storedBucket(this.text)}`);
    if (!this.field.read) bump('garden:unread');
  }

  where() {
    return `seed ${this.seed}: ${this.trail.join(' ')}`;
  }

  /** The model's plan for the garden now, at the clock's instant, in the device's zone. */
  expected(): Items {
    return planModel({
      plants: recallsByReference(this.field),
      pieces: this.pieces,
      at: this.now,
      offset: offsetIn(this.zone, this.now),
      minutes: this.shown,
    }).items.map(itemOf);
  }

  begin(live: Live) {
    if (Option.isNone(this.plan) && this.field.read) this.plan = Option.some(this.expected());
    return live.run(live.session.begin);
  }

  tap(live: Live, refused: boolean) {
    const choice = pickOf(this.next, MINUTES);
    this.trail.push(String(choice));
    this.taps += 1;
    this.shown = choice;
    if (refused) this.disk.failSet.add(MINUTES_KEY);
    else this.text = String(choice);
    if (Option.isSome(this.plan)) {
      this.plan = Option.some(this.expected());
      bump('tap:remade');
    }
    return Effect.ensuring(
      live.run(live.session.choose(choice)),
      Effect.sync(() => this.disk.failSet.delete(MINUTES_KEY)),
    );
  }

  wait(live: Live) {
    this.now += pickOf(this.next, [MINUTE, HOUR, 5 * HOUR, DAY, 31 * DAY]);
    return live.run(TestClock.setTime(this.now));
  }

  /** A keep lands in the garden: a recall of a piece or of the stray verse, at the clock's instant. */
  keep(live: Live) {
    const reference = pickOf(this.next, [
      'Stray 1:1',
      ...this.pieces.map((piece) => piece.reference),
    ]);
    const kept = this.field.recalls.get(reference) ?? [];
    kept.push(recallOf(this.next, reference, this.now, this.zone));
    this.field.recalls.set(reference, kept);
    this.now += 1;
    return live.run(TestClock.setTime(this.now));
  }

  /** A new launch over the same disk: the minutes read again (5 when the read fails), the garden read or not, no plan yet. */
  relaunch(live: Live, getFails: boolean) {
    return Scope.close(live.scope, Exit.void).pipe(
      Effect.andThen(() => {
        if (getFails) this.disk.failGet.add(MINUTES_KEY);
        this.field.read = this.next() > 0.2;
        this.disk.sets.length = 0;
        this.taps = 0;
        return Effect.ensuring(
          launch(this.pieces, this.disk, this.field, this.now),
          Effect.sync(() => this.disk.failGet.delete(MINUTES_KEY)),
        );
      }),
      Effect.tap(() =>
        Effect.sync(() => {
          this.shown = minutesRule(this.text);
          if (getFails) this.shown = 5;
          this.plan = Option.none();
          expect(this.disk.sets, `${this.where()} (nothing written at launch)`).toEqual([]);
        }),
      ),
    );
  }

  /** The service's view and the disk, held to the rules after a step. */
  check(live: Live) {
    return Effect.map(live.session.view, (view) => {
      const where = this.where();
      expect(view.minutes, where).toBe(this.shown);
      expect(
        Option.map(view.plan, (made) => made.items.map(itemOf)),
        where,
      ).toEqual(this.plan);
      expect(this.disk.map.get(MINUTES_KEY), `${where} (the last landed tap)`).toBe(this.text);
      expect(this.disk.sets.length, `${where} (a write per tap at most)`).toBeLessThanOrEqual(
        this.taps,
      );
    });
  }
}

type Op = 'begin' | 'tap' | 'tap-refused' | 'wait' | 'keep' | 'relaunch' | 'relaunch-get-fails';

const OPS: readonly [Op, ...Op[]] = [
  'begin',
  'begin',
  'tap',
  'tap',
  'tap',
  'tap-refused',
  'wait',
  'keep',
  'relaunch',
  'relaunch-get-fails',
];

/** One step of `device`, which may hand back a new launch. */
const stepOf = (device: Device, live: Live, op: Op): Effect.Effect<Live> => {
  const stay = (effect: Effect.Effect<void>) => Effect.as(effect, live);
  switch (op) {
    case 'begin':
      return stay(device.begin(live));
    case 'tap':
      return stay(device.tap(live, false));
    case 'tap-refused':
      return stay(device.tap(live, true));
    case 'wait':
      return stay(device.wait(live));
    case 'keep':
      return stay(device.keep(live));
    case 'relaunch':
      return device.relaunch(live, false);
    case 'relaunch-get-fails':
      return device.relaunch(live, true);
  }
};

const runDevice = (seed: number) =>
  Effect.gen(function* () {
    const device = new Device(seed);
    travel(device.zone);
    let live = yield* launch(device.pieces, device.disk, device.field, device.now);
    expect(device.disk.sets, `${device.where()} (nothing written at launch)`).toEqual([]);
    for (let step = 0; step < 12; step++) {
      const op = pickOf(device.next, OPS);
      device.trail.push(op);
      bump(`op:${op}`);
      if (!device.field.read) bump(`op:${op}:unread`);
      live = yield* stepOf(device, live, op);
      yield* device.check(live);
    }
    yield* Scope.close(live.scope, Exit.void);
  });

/** `effect` run with the host's zone put back after it, whatever zones it travelled to. */
const zoned = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(hostZone),
    () => effect,
    (before) => Effect.sync(() => restore(before)),
  );

const FLOORS = {
  'stored:absent': 15,
  'stored:2': 15,
  'stored:5': 15,
  'stored:10': 15,
  'stored:20': 15,
  'stored:bad': 100,
  'garden:unread': 40,
  'op:begin': 400,
  'op:begin:unread': 60,
  'op:tap': 400,
  'op:tap:unread': 50,
  'op:tap-refused': 200,
  'op:wait': 200,
  'op:keep': 200,
  'op:relaunch': 200,
  'op:relaunch-get-fails': 200,
  'tap:remade': 300,
} satisfies Record<string, number>;

const TAPS_FLOORS = {
  'none landed': 10,
  'last refused, an earlier landed': 40,
  'an earlier write held': 150,
  'an older held write refused, a later one landed': 90,
  'the view checked after an older held write was refused': 100,
  'the last refusal older than the last tap': 100,
} satisfies Record<string, number>;

interface Tap {
  readonly minutes: Minutes;
  readonly fault: WriteFault;
  readonly gap: boolean;
}

const lands = (tap: Tap) => tap.fault === 'ok' || tap.fault === 'held';

/** The classes of schedule a run of taps reached, for the floors. */
const noteSchedule = (taps: readonly Tap[], note: (key: string) => void) => {
  const lastTap = taps.length - 1;
  const landed = taps.some(lands);
  if (!landed) note('none landed');
  if (taps[lastTap]?.fault.endsWith('refused') === true && landed)
    note('last refused, an earlier landed');
  if (taps.some((tap, index) => tap.fault.startsWith('held') && index < lastTap))
    note('an earlier write held');
  const heldRefused = taps.findIndex(
    (tap, index) => tap.fault === 'held-refused' && index < lastTap,
  );
  if (heldRefused >= 0 && taps.some((tap, index) => index > heldRefused && lands(tap)))
    note('an older held write refused, a later one landed');
  const lastRefusal = taps.findLastIndex((tap) => tap.fault.endsWith('refused'));
  if (lastRefusal >= 0 && lastRefusal < lastTap) note('the last refusal older than the last tap');
};

/** One generated run of overlapping taps whose writes are held and refused as `next` draws, the gates opened in a drawn order. */
const runTaps = (seed: number, note: (key: string) => void) =>
  Effect.gen(function* () {
    const next = random(seed * 7919);
    const start = pickOf(next, STORED);
    const taps: Tap[] = Array.from({ length: 2 + below(next, 5) }, () => ({
      minutes: pickOf(next, MINUTES),
      fault: pickOf<WriteFault>(next, ['ok', 'ok', 'held', 'refused', 'held-refused']),
      gap: next() < 0.4,
    }));
    const where = `seed ${seed}: ${JSON.stringify(start)} ${JSON.stringify(taps)}`;
    const writes = yield* faultyDisk(start, taps);
    const live = yield* launch([], writes.disk, emptyField(), 0);
    const fibers = [];
    for (const tap of taps) {
      fibers.push(
        yield* Effect.forkChild(live.run(live.session.choose(tap.minutes)), {
          startImmediately: true,
        }),
      );
      if (tap.gap) yield* Effect.yieldNow;
    }
    const lastTap = taps.length - 1;
    let olderRefusalSeen = false;
    /** The current launch shows the last tap, whichever writes have ended and however. */
    const shownIsLast = (when: string) =>
      Effect.map(live.session.view, (view) => {
        const ended = writes.disk.settled.map((each) => `${each.ordinal}:${each.outcome}`);
        expect(Option.some(view.minutes), `${where} (${when}, ended ${ended.join(' ')})`).toEqual(
          Option.map(Arr.last(taps), (tap) => tap.minutes),
        );
        const olderHeldRefused = writes.disk.settled.some(
          (each) =>
            each.outcome === 'refused' &&
            each.ordinal < lastTap &&
            taps[each.ordinal]?.fault === 'held-refused',
        );
        if (olderHeldRefused) olderRefusalSeen = true;
      });
    yield* shownIsLast('before a gate opens');
    for (const gate of shuffled(next, writes.gates)) {
      yield* Deferred.succeed(gate, undefined);
      yield* shownIsLast('as a gate opens');
      for (let turn = 0; turn < 6; turn++) {
        yield* Effect.yieldNow;
        yield* shownIsLast('as the writes after it end');
      }
    }
    yield* Fiber.joinAll(fibers);
    yield* shownIsLast('once every tap is joined');
    expect(writes.values, `${where} (each tap's own choice, in tap order)`).toEqual(
      taps.map((tap) => String(tap.minutes)),
    );
    const text = Option.match(Arr.last(taps.filter(lands)), {
      onNone: () => start,
      onSome: (tap) => String(tap.minutes),
    });
    expect(writes.disk.map.get(MINUTES_KEY), where).toBe(text);
    yield* Scope.close(live.scope, Exit.void);
    const again = yield* launch([], writes.disk, emptyField(), 0);
    expect((yield* again.session.view).minutes, `${where} (relaunch)`).toBe(minutesRule(text));
    yield* Scope.close(again.scope, Exit.void);
    noteSchedule(taps, note);
    if (olderRefusalSeen) note('the view checked after an older held write was refused');
  });

describe('the session service', () => {
  it('reads, writes and plans by the rules over 400 generated launches', () =>
    Effect.runPromise(
      zoned(
        Effect.gen(function* () {
          for (let seed = 1; seed <= 400; seed++) yield* runDevice(seed);
          const low = Object.entries(FLOORS).filter(
            ([key, floor]) => (reached.get(key) ?? 0) < floor,
          );
          expect(low.map(([key]) => `${key} ${reached.get(key) ?? 0}`)).toEqual([]);
        }),
      ),
    ));

  it('reads each bad stored text as 5 and writes nothing', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (const bad of BAD_TEXTS) {
          const disk = diskOf(bad);
          const live = yield* launch([], disk, emptyField(), 0);
          yield* live.session.begin;
          expect((yield* live.session.view).minutes, JSON.stringify(bad)).toBe(5);
          expect(disk.map.get(MINUTES_KEY)).toBe(bad);
          expect(disk.sets).toEqual([]);
          yield* Scope.close(live.scope, Exit.void);
        }
      }),
    ));

  it('ends the store at the last tap when an earlier write lands after it', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const disk = diskOf(undefined);
        const live = yield* launch([], disk, emptyField(), 0);
        const gate = yield* Deferred.make<void>();
        disk.hold = Option.some(gate);
        const first = yield* Effect.forkChild(live.session.choose(10), { startImmediately: true });
        for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
        const second = yield* Effect.forkChild(live.session.choose(20), { startImmediately: true });
        for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
        expect((yield* live.session.view).minutes).toBe(20);
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(first);
        yield* Fiber.join(second);
        expect(disk.map.get(MINUTES_KEY)).toBe('20');
        yield* Scope.close(live.scope, Exit.void);
        const again = yield* launch([], disk, emptyField(), 0);
        expect((yield* again.session.view).minutes).toBe(20);
        yield* Scope.close(again.scope, Exit.void);
      }),
    ));

  it('ends the store at the last landed tap over 300 generated runs of overlapping taps, held and refused writes', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const seen = new Map<string, number>();
        const note = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1);
        for (let seed = 1; seed <= 300; seed++) yield* runTaps(seed, note);
        const low = Object.entries(TAPS_FLOORS).filter(
          ([key, floor]) => (seen.get(key) ?? 0) < floor,
        );
        expect(low.map(([key]) => `${key} ${seen.get(key) ?? 0}`)).toEqual([]);
      }),
    ));

  it('relaunches at 20 after taps 10, 20 and 2 with the first write held and the third refused', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const writes = yield* faultyDisk(undefined, [
          { fault: 'held' },
          { fault: 'ok' },
          { fault: 'refused' },
        ]);
        const live = yield* launch([], writes.disk, emptyField(), 0);
        const fibers = [];
        for (const minutes of [10, 20, 2] as const)
          fibers.push(
            yield* Effect.forkChild(live.run(live.session.choose(minutes)), {
              startImmediately: true,
            }),
          );
        expect((yield* live.session.view).minutes).toBe(2);
        for (const gate of writes.gates) yield* Deferred.succeed(gate, undefined);
        yield* Fiber.joinAll(fibers);
        expect(writes.values).toEqual(['10', '20', '2']);
        yield* Scope.close(live.scope, Exit.void);
        const again = yield* launch([], writes.disk, emptyField(), 0);
        expect((yield* again.session.view).minutes).toBe(20);
        yield* Scope.close(again.scope, Exit.void);
      }),
    ));

  it('keeps 2 as the choice after taps 10, 20 and 2 when the first write, held, is refused and the later ones land', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const writes = yield* faultyDisk(undefined, [
          { fault: 'held-refused' },
          { fault: 'ok' },
          { fault: 'ok' },
        ]);
        const live = yield* launch([], writes.disk, emptyField(), 0);
        const fibers = [];
        for (const minutes of [10, 20, 2] as const)
          fibers.push(
            yield* Effect.forkChild(live.run(live.session.choose(minutes)), {
              startImmediately: true,
            }),
          );
        expect((yield* live.session.view).minutes).toBe(2);
        for (const gate of writes.gates) yield* Deferred.succeed(gate, undefined);
        yield* Fiber.joinAll(fibers);
        expect(writes.disk.settled).toEqual([
          { ordinal: 0, outcome: 'refused' },
          { ordinal: 1, outcome: 'landed' },
          { ordinal: 2, outcome: 'landed' },
        ]);
        expect((yield* live.session.view).minutes).toBe(2);
        expect(writes.disk.map.get(MINUTES_KEY)).toBe('2');
        yield* Scope.close(live.scope, Exit.void);
        const again = yield* launch([], writes.disk, emptyField(), 0);
        expect((yield* again.session.view).minutes).toBe(2);
        yield* Scope.close(again.scope, Exit.void);
      }),
    ));

  it('makes the plan from the garden view at once, not waiting on a keep under way', () =>
    Effect.runPromise(
      zoned(
        Effect.gen(function* () {
          travel('UTC');
          const at = Date.UTC(2026, 0, 10, 12);
          const pieces: ModelPiece[] = [{ reference: 'Book 1:1', words: 20, group: 'one' }];
          const gate = yield* Deferred.make<void>();
          const field: Field = { ...emptyField(), pending: Option.some(gate) };
          const live = yield* launch(pieces, diskOf(undefined), field, at);
          const begun = yield* Effect.forkChild(live.session.begin, { startImmediately: true });
          for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
          const fresh = Option.some([
            { reference: 'Book 1:1', fresh: true, recalls: 0, seconds: 20 },
          ]);
          const items = Effect.map(live.session.view, (view) =>
            Option.map(view.plan, (made) => made.items.map(itemOf)),
          );
          expect(yield* items).toEqual(fresh);
          field.recalls.set('Book 1:1', [recallOf(random(1), 'Book 1:1', at - MINUTE, 'UTC')]);
          field.pending = Option.none();
          yield* Deferred.succeed(gate, undefined);
          yield* Fiber.join(begun);
          expect(yield* items).toEqual(fresh);
          yield* Scope.close(live.scope, Exit.void);
        }),
      ),
    ));

  it('plans from the view before a held keep, at the instant of the begin or the tap, over 250 generated launches', () =>
    Effect.runPromise(
      zoned(
        Effect.gen(function* () {
          const seen = new Map<string, number>();
          const note = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1);
          for (let seed = 1; seed <= 250; seed++) yield* runKept(seed, note);
          const low = Object.entries(KEPT_FLOORS).filter(
            ([key, floor]) => (seen.get(key) ?? 0) < floor,
          );
          expect(low.map(([key]) => `${key} ${seen.get(key) ?? 0}`)).toEqual([]);
        }),
      ),
    ));

  it('counts a recall graded Again, held past its due while a tap plans, as done once it lands', () =>
    Effect.runPromise(
      zoned(
        Effect.gen(function* () {
          travel('UTC');
          const old: Recall = {
            ...recallOf(random(3), 'Probe 1:1', Date.UTC(2026, 0, 2, 12), 'UTC'),
            grade: 3,
          };
          const map = new Map([[keyOf(old), JSON.stringify(old)]]);
          const at = Date.UTC(2026, 0, 5, 12);
          const pending: Recall = { ...old, startedAt: at - MINUTE + 1, grade: 1 };
          const gate = yield* Deferred.make<void>();
          const faults = new Map([[keyOf(pending), { gate, refuse: false }]]);
          const live = yield* launchKept(
            [{ reference: 'Probe 1:1', words: 20, group: 'probe' }],
            map,
            faults,
            at,
          );
          yield* live.run(live.session.begin);
          const kept = yield* Effect.forkChild(live.run(live.recalls.keep(pending)), {
            startImmediately: true,
          });
          for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
          const tap = yield* Effect.forkChild(live.run(live.session.choose(10)), {
            startImmediately: true,
          });
          for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
          yield* live.run(TestClock.setTime(at + 2));
          yield* Deferred.succeed(gate, undefined);
          yield* Fiber.joinAll([kept, tap]);
          expect(yield* lineOf(live.session, live.garden)).toEqual(
            Option.some('Nothing to tend now'),
          );
          yield* Scope.close(live.scope, Exit.void);
        }),
      ),
    ));
});

type KeptOp = 'begin-held' | 'tap-held' | 'tap' | 'wait' | 'begin';

const KEPT_OPS: readonly [KeptOp, ...KeptOp[]] = [
  'begin-held',
  'begin-held',
  'tap-held',
  'tap-held',
  'tap-held',
  'tap',
  'wait',
  'begin',
];

const KEPT_FLOORS = {
  'begin-held:made': 40,
  'tap-held:remade': 120,
  'held:landed in plan': 60,
  'held:refused in plan': 20,
  'instant:its due': 40,
  'instant:the due before': 30,
  'instant:the morning': 40,
  'instant:now': 40,
  'zone:dst': 20,
} satisfies Record<string, number>;

/** One generated launch over the app's own garden: keeps held across due instants and mornings, with begins and Minutes taps while they are under way. */
const runKept = (seed: number, note: (key: string) => void) =>
  Effect.gen(function* () {
    const next = random(seed * 104_729);
    const zone = pickOf(next, ZONES);
    travel(zone);
    if (offsetIn(zone, 0) !== offsetIn(zone, 182 * DAY)) note('zone:dst');
    const pieces = piecesOf(next);
    let now =
      Date.UTC(2020 + below(next, 10), below(next, 12), 1 + below(next, 27)) + below(next, DAY);
    const map = new Map<string, string>();
    for (const recalls of fieldOf(next, pieces, now, zone).values())
      for (const recall of recalls) map.set(keyOf(recall), JSON.stringify(recall));
    const faults = new Map<string, KeepFault>();
    const live = yield* launchKept(pieces, map, faults, now);
    let minutes = (yield* live.session.view).minutes;
    let plan = Option.none<Items>();
    const trail: string[] = [zone];
    const where = () => `seed ${seed}: ${trail.join(' ')}`;
    const planAt = (plants: ReadonlyMap<string, readonly Recall[]>) =>
      planModel({ plants, pieces, at: now, offset: offsetIn(zone, now), minutes }).items.map(
        itemOf,
      );
    const check = Effect.gen(function* () {
      const view = yield* live.session.view;
      expect(view.minutes, where()).toBe(minutes);
      expect(
        Option.map(view.plan, (made) => made.items.map(itemOf)),
        where(),
      ).toEqual(plan);
      const plants = plantsIn(map);
      expect(yield* lineOf(live.session, live.garden), where()).toEqual(
        Option.map(plan, (items) =>
          countsModel(items, (reference) => plants.get(reference)?.length ?? 0),
        ),
      );
    });
    /** Runs `command` while a keep of a recall started a moment ago is held, at an instant by its due, the due before it or the next morning, then lets the keep land or refuses it. */
    const whileHeld = (command: Effect.Effect<void>, atInstant: () => void) =>
      Effect.gen(function* () {
        const reference = pickOf(next, ['Stray 1:1', ...pieces.map((piece) => piece.reference)]);
        let startedAt = now - pickOf(next, [1, 1000, MINUTE - 1, 5 * MINUTE]);
        while (map.has(keyOf({ reference, startedAt }))) startedAt -= 1;
        const recall = recallOf(next, reference, startedAt, zone);
        const before = plantsIn(map);
        const refuse = next() < 0.3;
        const gate = yield* Deferred.make<void>();
        faults.set(keyOf(recall), { gate, refuse });
        const kept = yield* Effect.forkChild(live.run(live.recalls.keep(recall)), {
          startImmediately: true,
        });
        for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
        const prior = before.get(reference) ?? [];
        const instants: [readonly [string, number], ...(readonly [string, number])[]] = [
          ['its due', dueModel([...prior, recall])],
          ['the morning', nextMorning(zone, now)],
          ['now', now],
        ];
        if (prior.length > 0) {
          instants.push(['the due before', dueModel(prior)], ['the due before', dueModel(prior)]);
        }
        const [kind, instant] = pickOf(next, instants);
        const at = Math.max(now, instant + pickOf(next, [-1, 0, 1]));
        if (at !== now) note(`instant:${kind}`);
        else if (kind === 'now') note('instant:now');
        now = at;
        yield* live.run(TestClock.setTime(now));
        trail.push(`held ${reference} ${kind} refuse=${refuse}`);
        atInstant();
        const commanded = yield* Effect.forkChild(command, { startImmediately: true });
        for (let turn = 0; turn < 8; turn++) yield* Effect.yieldNow;
        const view = yield* live.session.view;
        const got = Option.map(view.plan, (made) => made.items.map(itemOf));
        if (next() < 0.4) {
          now += pickOf(next, [1, MINUTE, HOUR]);
          yield* live.run(TestClock.setTime(now));
        }
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(kept);
        yield* Fiber.join(commanded);
        return { got, shown: view.minutes, reference, refuse };
      });
    /** A begin or a Minutes tap while a keep is held: planned from the view before the keep, at the command's instant. */
    const heldStep = (op: 'begin-held' | 'tap-held') =>
      Effect.gen(function* () {
        let tapped: Minutes = minutes;
        let command = live.run(live.session.begin);
        if (op === 'tap-held') {
          tapped = pickOf(next, MINUTES);
          command = live.run(live.session.choose(tapped));
        }
        let expected = plan;
        const held = yield* whileHeld(command, () => {
          minutes = tapped;
          if (op === 'begin-held' && Option.isNone(plan)) {
            expected = Option.some(planAt(plantsIn(map)));
            note('begin-held:made');
          }
          if (op === 'tap-held' && Option.isSome(plan)) {
            expected = Option.some(planAt(plantsIn(map)));
            note('tap-held:remade');
          }
        });
        plan = expected;
        expect(held.shown, `${where()} (while held)`).toBe(minutes);
        expect(held.got, `${where()} (while held)`).toEqual(plan);
        if (Option.isNone(plan) || plan.value.every((item) => item.reference !== held.reference))
          return;
        if (held.refuse) note('held:refused in plan');
        else note('held:landed in plan');
      });
    yield* check;
    for (let step = 0; step < 4; step++) {
      const op = pickOf(next, KEPT_OPS);
      trail.push(op);
      switch (op) {
        case 'begin-held':
        case 'tap-held': {
          yield* heldStep(op);
          break;
        }
        case 'tap': {
          minutes = pickOf(next, MINUTES);
          if (Option.isSome(plan)) plan = Option.some(planAt(plantsIn(map)));
          yield* live.run(live.session.choose(minutes));
          break;
        }
        case 'wait': {
          now += pickOf(next, [1, MINUTE, HOUR, DAY]);
          yield* live.run(TestClock.setTime(now));
          break;
        }
        case 'begin': {
          if (Option.isNone(plan)) plan = Option.some(planAt(plantsIn(map)));
          yield* live.run(live.session.begin);
          break;
        }
      }
      yield* check;
    }
    yield* Scope.close(live.scope, Exit.void);
  });
