/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the garden and the store stand-ins keep their recalls and keys in plain maps a case changes between steps, and the model's run is plain data over null; the zone is the host's, switched through `process.env.TZ` and put back when the case ends. */

/**
 * `Session.wake`, a return to the foreground (R8b, R8c), over generated
 * devices: pieces in groups, gardens of planted, due, evening-planted and
 * stray verses, every minutes choice, recitals that listen, finish and end
 * heard or not, holds, Next, Minutes taps, time passing from a minute to a
 * month, zones every side of UTC and unread launches. After each step the
 * service's plan and its held item are the model's: `src/test/wake-model.ts`
 * over `src/test/run-model.ts`'s run and `src/test/session-model.ts`'s plan,
 * never the service's helpers. A no-op is counted toward its floor only
 * where a wrong making would leave another plan or hold.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Context, Effect, Exit, Layer, Logger, Option, Scope, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as TestClock from 'effect/testing/TestClock';

import { Dictation } from '../dictation';
import { initial } from '../dictation/attempt';
import { Garden, plantOf, type GardenView } from '../garden';
import type { Grade, Recall } from '../sayit';
import { MINUTES, type Minutes } from '../session';
import { layer, MINUTES_KEY, Session } from '../session/service';
import { below, pickOf, random } from '../test/garden-model';
import {
  actionModel,
  nextModel,
  NO_RUN,
  madeModel,
  shownModel,
  startedModel,
  type RunModel,
} from '../test/run-model';
import {
  DAY,
  dueModel,
  HOUR,
  isEvening,
  MINUTE,
  planModel,
  type ModelItem,
  type ModelPiece,
} from '../test/session-model';
import { wakeModel } from '../test/wake-model';
import { hostZone, offsetIn, restore, travel } from '../test/zone';

/** Zones every side of UTC, Lord Howe's half-hour daylight saving among them. */
const ZONES = [
  'America/Los_Angeles',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'UTC',
  'Pacific/Kiritimati',
  'America/St_Johns',
] as const;

type Status = 'idle' | 'listening' | 'finishing';

/** An item as the service carries it. */
const itemOf = (item: ModelItem) => ({
  reference: item.reference,
  fresh: item.fresh,
  recalls: item.recalls,
  seconds: item.seconds,
});

/** The instant whose wall clock in `zone` reads `clock` (ms after midnight) on the local day after `at`'s. */
const nextLocal = (zone: string, at: number, clock: number) => {
  const wall = at + offsetIn(zone, at) * MINUTE;
  const target = Math.floor(wall / DAY) * DAY + DAY + clock;
  let guess = target - offsetIn(zone, at) * MINUTE;
  for (let turn = 0; turn < 3; turn++) guess = target - offsetIn(zone, guess) * MINUTE;
  return guess;
};

/** The instant whose wall clock in `zone` reads 21:00 on `at`'s local day. */
const eveningOf = (zone: string, at: number) => nextLocal(zone, at, 21 * HOUR) - DAY;

const recallOf = (
  next: () => number,
  reference: string,
  startedAt: number,
  zone: string,
): Recall => ({
  reference,
  startedAt,
  offset: offsetIn(zone, startedAt),
  grade: pickOf<Grade>(next, [1, 3, 3, 4]),
  suggested: pickOf<Recall['suggested']>(next, [1, 2, 3]),
  words: 1 + below(next, 60),
  missed: below(next, 3),
  peeked: below(next, 2),
  extra: 0,
});

const piecesOf = (next: () => number): ModelPiece[] => {
  const groups = 1 + below(next, 3);
  return Array.from({ length: 1 + below(next, 8) }, (_, index) => ({
    reference: `Book ${index + 1}:${1 + below(next, 3)}`,
    words: pickOf(next, [1, 60 + below(next, 31), 1 + below(next, 40)]),
    group: `group ${below(next, groups)}`,
  }));
};

/** The garden's view over `recalls`, read or not. */
const viewOf = (read: boolean, recalls: ReadonlyMap<string, readonly Recall[]>): GardenView => {
  if (!read) return { _tag: 'Unread' };
  const plants = new Map(
    [...recalls].flatMap(([reference, kept]) =>
      Arr.match(kept, {
        onEmpty: () => [],
        onNonEmpty: (some) => [[reference, plantOf(some)] as const],
      }),
    ),
  );
  return { _tag: 'Read', plants };
};

const reached = new Map<string, number>();
const bump = (key: string) => reached.set(key, (reached.get(key) ?? 0) + 1);

/** One generated device: its pieces, garden, minutes, recital, clock and zone, and the model's run. */
class Device {
  readonly next: () => number;
  readonly zone: string;
  readonly pieces: ModelPiece[];
  readonly recalls = new Map<string, Recall[]>();
  readonly disk = new Map<string, string>();
  readonly trail: string[] = [];
  now: number;
  read = true;
  status: Status = 'idle';
  minutes: Minutes = 5;
  run: RunModel = NO_RUN;
  /** The evening planting's piece, if this device was planted at 21:00 local. */
  evening: string | null = null;
  lastOp = '';

  constructor(readonly seed: number) {
    this.next = random(seed);
    this.zone = pickOf(this.next, ZONES);
    this.pieces = piecesOf(this.next);
    this.now =
      Date.UTC(2021 + below(this.next, 5), below(this.next, 12), 1 + below(this.next, 27)) +
      below(this.next, DAY);
    if (this.next() < 0.2) {
      this.now = eveningOf(this.zone, this.now);
      const first = this.pieces[0];
      if (first !== undefined) {
        this.recalls.set(first.reference, [
          recallOf(this.next, first.reference, this.now, this.zone),
        ]);
        this.evening = first.reference;
        this.now += MINUTE;
      }
    } else {
      for (const piece of this.pieces) {
        if (this.recalls.has(piece.reference) || this.next() < 0.4) continue;
        this.plant(piece.reference);
      }
      if (this.next() < 0.3) this.plant('Stray 1:1');
    }
    const stored = pickOf(this.next, [undefined, '2', '5', '10', '20']);
    if (stored !== undefined) this.disk.set(MINUTES_KEY, stored);
    this.minutes = MINUTES.find((each) => String(each) === stored) ?? 5;
    this.trail.push(`zone=${this.zone} minutes=${this.minutes} evening=${this.evening}`);
  }

  /** Some recalls of `reference`, the last before now. */
  plant(reference: string) {
    let t = this.now - pickOf(this.next, [HOUR, DAY, 9 * DAY, 40 * DAY]) * (0.2 + this.next());
    const kept: Recall[] = [];
    for (let i = 0, n = 1 + below(this.next, 4); i < n && t < this.now; i++) {
      kept.push(recallOf(this.next, reference, Math.round(t), this.zone));
      t += pickOf(this.next, [10 * MINUTE, 6 * HOUR, 2 * DAY]);
    }
    if (kept.length > 0) this.recalls.set(reference, kept);
  }

  where() {
    return `seed ${this.seed}: ${this.trail.join(' ')}`;
  }

  recallsNow = (reference: string) => this.recalls.get(reference)?.length ?? 0;

  expected(): readonly ModelItem[] {
    return planModel({
      plants: this.recalls,
      pieces: this.pieces,
      at: this.now,
      offset: offsetIn(this.zone, this.now),
      minutes: this.minutes,
    }).items;
  }
}

/** One launch of the session over `device`'s disk, garden, recital and clock, in its own scope. */
const launchOf = (device: Device) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      layer(device.pieces.map((piece) => ({ ...piece, text: '' }))).pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(
              KeyValueStore.KeyValueStore,
              KeyValueStore.makeStringOnly({
                get: (key) => Effect.sync(() => device.disk.get(key)),
                set: (key, value) => Effect.sync(() => void device.disk.set(key, value)),
                remove: (key) => Effect.sync(() => void device.disk.delete(key)),
                clear: Effect.sync(() => device.disk.clear()),
                size: Effect.sync(() => device.disk.size),
                keys: Effect.sync(() => [...device.disk.keys()]),
              }),
            ),
            Layer.succeed(
              Garden,
              Garden.of({
                view: Effect.sync(() => viewOf(device.read, device.recalls)),
                settled: Effect.sync(() => viewOf(device.read, device.recalls)),
                changes: Stream.never,
              }),
            ),
            Layer.mock(Dictation)({
              view: Effect.sync(() => ({ ...initial.view, status: device.status })),
            }),
          ),
        ),
        Layer.provideMerge(Layer.merge(TestClock.layer(), Logger.layer([]))),
      ),
      scope,
    );
    const session = Context.get(services, Session);
    const run = <A>(effect: Effect.Effect<A>) => Effect.provideContext(effect, services);
    yield* run(TestClock.setTime(device.now));
    return { scope, session, run };
  });

type Live = Effect.Success<ReturnType<typeof launchOf>>;

const sameItems = (a: readonly ModelItem[] | null, b: readonly ModelItem[] | null) =>
  JSON.stringify(a?.map(itemOf) ?? null) === JSON.stringify(b?.map(itemOf) ?? null);

/** The floors a return that changes nothing reaches; `differs`, a making here would show another plan or hold. */
const noteKept = (device: Device, before: RunModel, differs: boolean) => {
  if (!device.read) bump('wake:unread');
  else if (before.plan === null) bump(differs ? 'wake:no-plan:differs' : 'wake:no-plan');
  else bump(`wake:under-way:${device.status}${differs ? ':differs' : ''}`);
};

/** The run state a making left: a result or an unheard recital held, else the item shown. */
const noteLeft = (device: Device, before: RunModel) => {
  const shown = shownModel(before, device.recallsNow);
  if (before.hold !== null) {
    bump('wake:drops-hold');
    bump(
      actionModel(before, device.recallsNow) === 'Next'
        ? 'wake:drops-result'
        : 'wake:drops-unheard',
    );
  } else if (shown !== null) bump(shown.fresh ? 'wake:from-fresh' : 'wake:from-review');
  else bump('wake:from-done');
};

/** The floors a return that makes the plan reaches. */
const noteMade = (device: Device, before: RunModel, after: RunModel, differs: boolean) => {
  bump('wake:made');
  bump(`wake:made:min:${device.minutes}`);
  if (differs) bump('wake:made:differs');
  noteLeft(device, before);
  if (
    shownModel(before, device.recallsNow) === null &&
    shownModel(after, device.recallsNow) !== null
  )
    bump('wake:done-to-item');
  if (device.lastOp === 'tap') bump('wake:after-tap');
  if (device.lastOp === 'wake') bump('wake:again');
};

/** An evening planting's lone recall, once the run has a plan and no recital is under way. */
const noteEvening = (device: Device, before: RunModel) => {
  if (device.evening === null || before.plan === null || device.status !== 'idle') return;
  const recalls = device.recalls.get(device.evening) ?? [];
  const only = recalls[0];
  if (recalls.length !== 1 || only === undefined || !isEvening(only)) return;
  bump(dueModel(recalls) <= device.now ? 'wake:evening:due' : 'wake:evening:not-due');
};

/** A return: the model's run after it, the floors it reaches, and the service woken. */
const wake = (device: Device, live: Live) => {
  const before = device.run;
  const fresh = device.expected();
  const after = wakeModel(before, () => fresh, {
    unread: !device.read,
    underWay: device.status !== 'idle',
  });
  const differs = before.hold !== null || !sameItems(before.plan, fresh);
  if (after === before) noteKept(device, before, differs);
  else noteMade(device, before, after, differs);
  noteEvening(device, before);
  device.run = after;
  return live.run(live.session.wake);
};

type Op =
  | 'begin'
  | 'wait'
  | 'wake'
  | 'tap'
  | 'start'
  | 'finish'
  | 'end'
  | 'next'
  | 'morning'
  | 'relaunch';

/** The runs of steps a device draws from, each leaning a return toward a state of the run: after time passes, with a result shown, while a recital listens or finishes, after a tap, twice, before the first plan. */
const CHAINS: readonly [readonly Op[], ...(readonly Op[])[]] = [
  ['wait', 'wake'],
  ['wait', 'wake'],
  ['wake'],
  ['start', 'end', 'wake'],
  ['start', 'end', 'wake'],
  ['start', 'wake', 'end'],
  ['start', 'finish', 'wait', 'wake', 'end'],
  ['tap', 'wake'],
  ['wait', 'wake', 'wake'],
  ['start', 'end', 'next'],
  ['begin'],
  ['tap'],
  ['wait'],
  ['relaunch', 'wake', 'begin'],
];

/** A making by `begin` or a tap, as the model runs it, when `made` holds. */
const made = (device: Device, when: boolean) => {
  if (when) device.run = madeModel(device.run, device.expected(), device.status !== 'idle');
};

/** The clock moved to `device.now`. */
const tick = (device: Device, live: Live) => live.run(TestClock.setTime(device.now));

/** A press of Say it: a recital starts listening and holds the item shown (none with no plan, no press in the done state). */
const start = (device: Device, live: Live): Effect.Effect<void> => {
  if (device.status !== 'idle') return Effect.void;
  const shown = device.run.plan === null ? null : shownModel(device.run, device.recallsNow);
  if (device.run.plan !== null && shown === null) return Effect.void;
  device.status = 'listening';
  device.run = startedModel(device.run, device.recallsNow);
  if (shown === null) return Effect.void;
  return live.run(live.session.hold(itemOf(shown)));
};

/** A recital's end: heard and kept for the held item, or not. */
const end = (device: Device, live: Live): Effect.Effect<void> => {
  if (device.status === 'idle') return Effect.void;
  device.status = 'idle';
  const held = device.run.hold;
  if (held === null || device.next() >= 0.7) return Effect.void;
  device.recalls.set(held.reference, [
    ...(device.recalls.get(held.reference) ?? []),
    recallOf(device.next, held.reference, device.now, device.zone),
  ]);
  device.now += 1;
  return tick(device, live);
};

/** A tap on Next, offered only on a done item with no recital under way. */
const next = (device: Device, live: Live): Effect.Effect<void> => {
  if (device.status !== 'idle' || device.run.hold === null) return Effect.void;
  if (actionModel(device.run, device.recallsNow) !== 'Next') return Effect.void;
  device.run = nextModel(device.run);
  return live.run(live.session.next);
};

const STEPS: Readonly<
  Record<Exclude<Op, 'relaunch'>, (device: Device, live: Live) => Effect.Effect<void>>
> = {
  begin: (device, live) => {
    made(device, device.run.plan === null && device.read);
    return live.run(live.session.begin);
  },
  wait: (device, live) => {
    device.now += pickOf(device.next, [MINUTE, 7 * MINUTE, HOUR, 5 * HOUR, DAY, 31 * DAY]);
    return tick(device, live);
  },
  morning: (device, live) => {
    const clock = pickOf(device.next, [3 * HOUR + 50 * MINUTE, 4 * HOUR + 10 * MINUTE]);
    device.now = Math.max(device.now + 1, nextLocal(device.zone, device.now - 6 * HOUR, clock));
    return tick(device, live);
  },
  wake,
  tap: (device, live) => {
    device.minutes = pickOf(device.next, MINUTES);
    device.trail.push(String(device.minutes));
    made(device, device.run.plan !== null && device.read);
    return live.run(live.session.choose(device.minutes));
  },
  start,
  finish: (device) =>
    Effect.sync(() => {
      if (device.status === 'listening') device.status = 'finishing';
    }),
  end,
  next,
};

/** A new launch over the same disk and garden, read or not: no plan, nothing held, the stored minutes. */
const relaunch = (device: Device, live: Live) =>
  Scope.close(live.scope, Exit.void).pipe(
    Effect.andThen(() => {
      device.read = device.next() > 0.15;
      device.status = 'idle';
      device.run = NO_RUN;
      device.minutes = MINUTES.find((each) => String(each) === device.disk.get(MINUTES_KEY)) ?? 5;
      return launchOf(device);
    }),
  );

const step = (device: Device, live: Live, op: Op): Effect.Effect<Live> => {
  if (op === 'relaunch') return relaunch(device, live);
  return Effect.as(STEPS[op](device, live), live);
};

/** The service's view, and the last one it published (what Today reads), held to the model. */
const check = (device: Device, live: Live) =>
  Effect.gen(function* () {
    const where = device.where();
    const published = yield* Stream.runHead(live.session.changes);
    for (const view of [yield* live.session.view, ...Option.toArray(published)]) {
      expect(view.minutes, where).toBe(device.minutes);
      expect(Option.getOrNull(Option.map(view.plan, (plan) => plan.items)), where).toEqual(
        device.run.plan?.map(itemOf) ?? null,
      );
      expect(Option.getOrNull(view.held), where).toEqual(
        device.run.hold === null ? null : itemOf(device.run.hold),
      );
    }
    expect(Option.isSome(published), `${where} (a view published)`).toBe(true);
  });

const runDevice = (seed: number) =>
  Effect.gen(function* () {
    const device = new Device(seed);
    travel(device.zone);
    let live = yield* launchOf(device);
    const script: Op[] =
      device.evening === null
        ? ['begin', ...Array.from({ length: 8 }, () => pickOf(device.next, CHAINS)).flat()]
        : ['begin', 'morning', 'wake', 'morning', 'wake', 'wait', 'wake'];
    if (device.evening !== null) device.trail.push('evening');
    for (const op of script) {
      device.trail.push(op);
      live = yield* step(device, live, op);
      device.lastOp = op;
      yield* check(device, live);
    }
    yield* Scope.close(live.scope, Exit.void);
  });

const FLOORS = {
  'wake:made': 800,
  'wake:made:differs': 300,
  'wake:made:min:2': 150,
  'wake:made:min:5': 150,
  'wake:made:min:10': 150,
  'wake:made:min:20': 150,
  'wake:drops-hold': 150,
  'wake:drops-result': 100,
  'wake:drops-unheard': 30,
  'wake:from-fresh': 30,
  'wake:from-review': 100,
  'wake:done-to-item': 60,
  'wake:after-tap': 80,
  'wake:again': 100,
  'wake:under-way:listening:differs': 60,
  'wake:under-way:finishing:differs': 60,
  'wake:no-plan:differs': 60,
  'wake:unread': 30,
  'wake:evening:not-due': 50,
  'wake:evening:due': 50,
} satisfies Record<string, number>;

describe('Session.wake', () => {
  it('makes the plan again at a return, or leaves it, by the model over 400 generated devices', () =>
    Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.sync(hostZone),
        () =>
          Effect.gen(function* () {
            for (let seed = 1; seed <= 400; seed++) yield* runDevice(seed);
            const low = Object.entries(FLOORS).filter(
              ([key, floor]) => (reached.get(key) ?? 0) < floor,
            );
            expect(low.map(([key]) => `${key} ${reached.get(key) ?? 0}`)).toEqual([]);
          }),
        (before) => Effect.sync(() => restore(before)),
      ),
    ));
});
