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

import { Garden, plantOf, type GardenView } from '../garden';
import type { Grade, Recall } from '../sayit';
import { MINUTES, type Minutes } from '../session';
import { below, pickOf, random } from '../test/garden-model';
import { DAY, HOUR, MINUTE, planModel, type ModelPiece } from '../test/session-model';
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
        const scripted = disk.script[disk.values.length - 1];
        const gate = Option.orElse(
          Option.flatMap(Option.fromNullishOr(scripted), (each) => each.gate),
          () => disk.hold,
        );
        disk.hold = Option.none();
        if (Option.isSome(gate)) yield* Deferred.await(gate.value);
        if (disk.failSet.has(key) || scripted?.refuse === true) return yield* failure('set');
        disk.map.set(key, value);
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

/** One launch of the service, at `at`, in its own scope and test clock. */
const launch = (pieces: readonly ModelPiece[], disk: Disk, field: Field, at: number) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      layer(pieces).pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(KeyValueStore.KeyValueStore, storeOf(disk)),
            Layer.succeed(Garden, gardenOf(field)),
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
        for (let seed = 1; seed <= 300; seed++) {
          const next = random(seed * 7919);
          const start = pickOf(next, STORED);
          const taps = Array.from({ length: 2 + below(next, 5) }, () => ({
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
          expect(Option.some((yield* live.session.view).minutes), where).toEqual(
            Option.map(Arr.last(taps), (tap) => tap.minutes),
          );
          for (const gate of shuffled(next, writes.gates)) {
            yield* Deferred.succeed(gate, undefined);
            if (next() < 0.5) yield* Effect.yieldNow;
          }
          yield* Fiber.joinAll(fibers);
          expect(writes.values, `${where} (each tap's own choice, in tap order)`).toEqual(
            taps.map((tap) => String(tap.minutes)),
          );
          const landed = taps.filter((tap) => tap.fault === 'ok' || tap.fault === 'held');
          const text = Option.match(Arr.last(landed), {
            onNone: () => start,
            onSome: (tap) => String(tap.minutes),
          });
          expect(writes.disk.map.get(MINUTES_KEY), where).toBe(text);
          yield* Scope.close(live.scope, Exit.void);
          const again = yield* launch([], writes.disk, emptyField(), 0);
          expect((yield* again.session.view).minutes, `${where} (relaunch)`).toBe(
            minutesRule(text),
          );
          yield* Scope.close(again.scope, Exit.void);
          if (landed.length === 0) note('none landed');
          if (taps.at(-1)?.fault.endsWith('refused') === true && landed.length > 0)
            note('last refused, an earlier landed');
          if (taps.some((tap, index) => tap.fault.startsWith('held') && index < taps.length - 1))
            note('an earlier write held');
        }
        expect(seen.get('none landed') ?? 0).toBeGreaterThanOrEqual(10);
        expect(seen.get('last refused, an earlier landed') ?? 0).toBeGreaterThanOrEqual(40);
        expect(seen.get('an earlier write held') ?? 0).toBeGreaterThanOrEqual(150);
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

  it('makes the plan from the garden once a keep under way has landed', () =>
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
          expect(Option.isNone((yield* live.session.view).plan)).toBe(true);
          field.recalls.set('Book 1:1', [recallOf(random(1), 'Book 1:1', at - MINUTE, 'UTC')]);
          field.pending = Option.none();
          yield* Deferred.succeed(gate, undefined);
          yield* Fiber.join(begun);
          const plan = (yield* live.session.view).plan;
          expect(Option.map(plan, (made) => made.items.length)).toEqual(Option.some(0));
          yield* Scope.close(live.scope, Exit.void);
        }),
      ),
    ));
});
