/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the walk plays each generated device's commands one after another through promise-run calls, over a disk in plain maps a launch's faults change between steps, switches the host's zone through `process.env.TZ`, writes expected values as plain branches, and compares values as JSON text. */

/**
 * The session over the reader's passages (hskjv P6-P10): the app's own
 * `addPassage` and `removePassage` over the session, the passages and the
 * garden as the app builds them, on a store whose every call yields first,
 * so two adds under way interleave at the store as on a slow device, with
 * Dictation's status set by the walk and the host's zone switched per
 * launch. Generated devices, each a stored value, recall histories, a
 * stray plant and a stored minutes choice, launch two or three times (some
 * with 1 to 4 failed reads of the key, an unread garden, the value garbled
 * between launches, or no `begin`: the first minute), and run adds, invalid
 * adds, removes of passages held twice, absent ones, refused writes, adds
 * at once, two removes or a remove and an add at once, Minutes taps, holds, recitals listening and finishing, waits
 * with a return and keeps. After every step the walk holds the service to
 * the model (`test/passages-model.ts` for the passages and the pieces,
 * `test/session-model.ts` for the plan): the passages' view, the whole
 * disk, the plan, the hold and the session's pieces.
 *
 * It catches an add or a remove that makes nothing, one that makes a plan
 * before the first or over unread passages or an unread garden, a making
 * after `Full`, `Invalid`, `Absent`, `Unread` or `Failed`, the hold kept
 * with no recital or dropped while one is listening or finishing, pieces
 * read once at the build or not set at a making, the passages read in
 * another step than the garden's, two adds at once past the cap, two
 * removes at once out of call order (one passage taken twice), a remove
 * of any equal passage but the first, a recall dropped by a remove, and a
 * write of any key but the start's, the recalls kept, the minutes and the
 * passages. The clocks case holds the new verse to the day: none on the
 * first minute's day, the first of a passage the next morning after 04:00
 * local, the second the day after, in five zones.
 */

import { describe, expect, it } from 'bun:test';
import { Clock, Context, Effect, Exit, Layer, Logger, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { readPassage } from '../../vite/passage';
import { addPassage, removePassage } from '../app';
import { Dictation } from '../dictation';
import { initial, type Status } from '../dictation/attempt';
import { Chime, layer as gardenLayer } from '../garden';
import { sourceWords } from '../matcher/words';
import { layer as passagesLayer, Passages } from '../passages';
import { Recalls, type Grade, type Recall } from '../sayit';
import { MINUTES, type Minutes } from '../session';
import { layer as sessionLayer, MINUTES_KEY, Session } from '../session/service';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
import {
  addRule,
  type Held,
  KEY,
  piecesRule,
  readRule,
  removeRule,
  type ModelTextPiece,
  type Span,
  storedText,
  verseRef,
} from '../test/passages-model';
import {
  chapterOf,
  choosableOf,
  CORPUS,
  GARBLED,
  INVALID,
  unchoosableOf,
} from '../test/passages-rig';
import { DAY, HOUR, localDay, MINUTE, planModel } from '../test/session-model';
import { hostZone, offsetIn, restore, travel } from '../test/zone';

const DEVICES = 120;

/** Eight zones: whole hours both sides, a half hour (St John's, Lord Howe's daylight saving), three quarters (Kathmandu, Chatham), UTC. */
const WALK_ZONES = [
  'UTC',
  'America/New_York',
  'Asia/Tokyo',
  'America/St_Johns',
  'Asia/Kathmandu',
  'Pacific/Chatham',
  'Australia/Lord_Howe',
  'Australia/Sydney',
] as const;

const PROMISE_TEXT = readPassage();

/** Each text's word count, kept once counted: the plan's model asks it of the same verses at every check. */
const WORDS = new Map<string, number>();

const words = (text: string) => {
  const kept = WORDS.get(text);
  if (kept !== undefined) return kept;
  const count = sourceWords(text).length;
  WORDS.set(text, count);
  return count;
};

/** The promise as the app's own piece. */
const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: words(PROMISE_TEXT.text),
  group: PROMISE_TEXT.reference,
};

const json = <A>(value: A) => JSON.stringify(value);

/** The device: its disk, the faults of the launch under way, Dictation's status and the clock's instant. */
interface Device {
  readonly disk: Map<string, string>;
  /** Failed `get`s of the passages' key left in this launch. */
  failGets: number;
  /** The garden's reads fail every attempt. */
  gardenUnread: boolean;
  /** Writes of the passages' key are refused. */
  refuse: boolean;
  status: Status;
  now: number;
}

const failure = (method: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method });

/** A store over the device's disk whose every read and write yields first, so calls under way interleave at the store. */
const storeOf = (device: Device) =>
  KeyValueStore.makeStringOnly({
    get: (key) =>
      Effect.andThen(
        Effect.yieldNow,
        Effect.suspend(() => {
          if (key === KEY && device.failGets > 0) {
            device.failGets -= 1;
            return Effect.fail(failure('get'));
          }
          return Effect.succeed(device.disk.get(key));
        }),
      ),
    set: (key, value) =>
      Effect.andThen(
        Effect.yieldNow,
        Effect.suspend(() => {
          if (key === KEY && device.refuse) return Effect.fail(failure('set'));
          device.disk.set(key, value);
          return Effect.void;
        }),
      ),
    remove: (key) => Effect.sync(() => void device.disk.delete(key)),
    clear: Effect.sync(() => device.disk.clear()),
    size: Effect.sync(() => device.disk.size),
    keys: Effect.andThen(
      Effect.yieldNow,
      Effect.suspend(() => {
        if (device.gardenUnread) return Effect.fail(failure('keys'));
        return Effect.succeed([...device.disk.keys()]);
      }),
    ),
  });

const nanos = (millis: number) => BigInt(millis) * 1_000_000n;

/** A clock at the device's instant, whose sleeps end at once. */
const clockOf = (device: Device): Clock.Clock => ({
  currentTimeMillisUnsafe: () => device.now,
  currentTimeMillis: Effect.sync(() => device.now),
  currentTimeNanosUnsafe: () => nanos(device.now),
  currentTimeNanos: Effect.sync(() => nanos(device.now)),
  monotonicTimeNanosUnsafe: () => nanos(device.now),
  monotonicTimeNanos: Effect.sync(() => nanos(device.now)),
  sleep: () => Effect.void,
});

/** The session, the passages and the garden over the device, as `appLayer` builds them, with Dictation at the device's status. */
const layerOf = (device: Device, own: readonly ModelTextPiece[]) =>
  sessionLayer(own).pipe(
    Layer.provideMerge(passagesLayer),
    Layer.provideMerge(
      gardenLayer.pipe(Layer.provide(Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })))),
    ),
    Layer.provide(
      Layer.mock(Dictation)({
        view: Effect.sync(() => ({ ...initial.view, status: device.status })),
      }),
    ),
    Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, storeOf(device))),
    Layer.provideMerge(Layer.merge(Layer.succeed(Clock.Clock, clockOf(device)), Logger.layer([]))),
  );

/** One launch over the device: a runner for the app's calls, and its close. */
const launchOf = async (device: Device, own: readonly ModelTextPiece[]) => {
  const scope = Scope.makeUnsafe();
  const services = await Effect.runPromise(Layer.buildWithScope(layerOf(device, own), scope));
  const run = <A>(effect: Effect.Effect<A, never, Session | Passages | Recalls>) =>
    Effect.runPromise(Effect.provideContext(effect, services));
  return {
    run,
    session: Context.get(services, Session),
    passages: Context.get(services, Passages),
    recalls: Context.get(services, Recalls),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

type Live = Awaited<ReturnType<typeof launchOf>>;

const recallOf = (
  next: () => number,
  reference: string,
  startedAt: number,
  zone: string,
): Recall => ({
  reference,
  startedAt,
  offset: offsetIn(zone, startedAt),
  grade: pickOf<Grade>(next, [1, 2, 3, 3, 4]),
  suggested: pickOf<Recall['suggested']>(next, [1, 2, 3]),
  words: 1 + below(next, 40),
  missed: below(next, 3),
  peeked: below(next, 2),
  extra: 0,
});

/** The recalls a disk holds, by reference. */
const plantsOf = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of disk)
    if (key.startsWith(PREFIX)) {
      const recall: Recall = JSON.parse(value);
      plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
    }
  return plants;
};

const isUnderWay = (status: Status) => status !== 'idle';

const sortedDisk = (disk: ReadonlyMap<string, string>) =>
  json([...disk].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** The model's items as the plan's: the four fields the session shows. */
interface ItemText {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
}

/** One call of the app's started beside others. */
interface Call {
  readonly kind: 'add' | 'remove';
  readonly range: Span;
}

/** One device's walk: the device, the live launch and the model beside it. */
class Walk {
  readonly device: Device;
  readonly own: readonly ModelTextPiece[];
  readonly next: () => number;
  readonly tally: Map<string, number>;
  readonly failures: string[] = [];
  readonly trail: string[] = [];
  live: Live | undefined = undefined;
  zone = 'UTC';
  /** The disk the model expects. */
  readonly disk: Map<string, string>;
  held: Held = { tag: 'Read', passages: [] };
  plan: ItemText[] | null = null;
  pieces: ModelTextPiece[] = [];
  holding: string | null = null;
  gardenRead = true;
  makings = 0;
  /** The command whose making the last step was, if it was one. */
  madeBy: string | null = null;

  constructor(
    device: Device,
    own: readonly ModelTextPiece[],
    next: () => number,
    tally: Map<string, number>,
  ) {
    this.device = device;
    this.own = own;
    this.next = next;
    this.tally = tally;
    this.disk = new Map(device.disk);
  }

  bump(kind: string) {
    this.tally.set(kind, (this.tally.get(kind) ?? 0) + 1);
  }

  fail(message: string) {
    this.failures.push(`${message}\n  after: ${this.trail.slice(-8).join(' | ')}`);
  }

  /** The launch under way; every command runs between `launch` and `close`. */
  get running() {
    return this.live as Live;
  }

  canMake() {
    return this.gardenRead && this.held.tag === 'Read';
  }

  minutes(): Minutes {
    return MINUTES.find((each) => String(each) === this.disk.get(MINUTES_KEY)) ?? 5;
  }

  modelPlan(): ItemText[] {
    const plants = plantsOf(this.disk);
    return planModel({
      plants,
      pieces: this.pieces,
      at: this.device.now,
      offset: offsetIn(this.zone, this.device.now),
      minutes: this.minutes(),
    }).items.map((item) => ({
      reference: item.reference,
      fresh: item.fresh,
      recalls: item.recalls,
      seconds: item.seconds,
    }));
  }

  /** A making in the model: the pieces over the passages now, the plan at this instant, the hold kept only when `keeps`. */
  made(keeps: boolean, why: string) {
    this.pieces = piecesRule(CORPUS, this.own, this.held, words);
    this.plan = this.modelPlan();
    this.makings += 1;
    if (this.holding !== null) {
      if (keeps) this.bump(`${why}:hold kept:${this.device.status}`);
      else this.bump(`${why}:hold dropped`);
    }
    if (!keeps) this.holding = null;
  }

  /** A making of a plan made in this launch, as an add, a remove or a tap makes one; nothing before the first or when either is unread. */
  again(why: string) {
    if (this.plan === null) {
      this.bump(`${why}:no plan:${this.gardenRead ? 'first minute' : 'unread garden'}`);
      return;
    }
    if (!this.canMake()) {
      this.bump(`${why}:unread`);
      return;
    }
    this.bump(`made:${why}`);
    this.made(isUnderWay(this.device.status), why);
    this.madeBy = why;
  }

  async check(step: string) {
    const { run } = this.running;
    this.trail.push(step);
    const view = await run(Effect.flatMap(Passages, (passages) => passages.view));
    const shown =
      view._tag === 'Read' ? { tag: 'Read', passages: view.passages } : { tag: view._tag };
    if (json(shown) !== json(this.held))
      this.fail(`${step}: passages ${json(shown)}, model ${json(this.held)}`);
    if (sortedDisk(this.device.disk) !== sortedDisk(this.disk))
      this.fail(`${step}: disk ${sortedDisk(this.device.disk)}, model ${sortedDisk(this.disk)}`);
    const session = await run(Effect.flatMap(Session, (each) => each.view));
    const plan =
      session.plan._tag === 'Some'
        ? session.plan.value.items.map((item) => ({
            reference: item.reference,
            fresh: item.fresh,
            recalls: item.recalls,
            seconds: item.seconds,
          }))
        : null;
    if (json(plan) !== json(this.plan))
      this.fail(`${step}: plan ${json(plan)}, model ${json(this.plan)}`);
    const pieces = session.pieces;
    if (json(pieces) !== json(this.pieces))
      this.fail(
        `${step}: pieces ${json(pieces.map((p) => [p.reference, p.group]))}, model ${json(this.pieces.map((p) => [p.reference, p.group]))}`,
      );
    const holding = session.held._tag === 'Some' ? session.held.value.reference : null;
    if (holding !== this.holding) this.fail(`${step}: held ${holding}, model ${this.holding}`);
    if (session.minutes !== this.minutes()) this.fail(`${step}: minutes ${session.minutes}`);
  }

  async launch(zone: string, failGets: number, gardenUnread: boolean, begins: boolean) {
    this.zone = zone;
    travel(zone);
    this.device.failGets = failGets;
    this.device.gardenUnread = gardenUnread;
    this.device.status = 'idle';
    this.gardenRead = !gardenUnread;
    const raw = this.disk.get(KEY);
    this.held = readRule(CORPUS, raw, failGets);
    this.plan = null;
    this.holding = null;
    this.makings = 0;
    this.pieces = piecesRule(CORPUS, this.own, this.held, words);
    this.bump(`launch:${this.held.tag}`);
    if (failGets > 0) this.bump(`read:faults:${Math.min(failGets, 3)}`);
    if (gardenUnread) this.bump('launch:unread garden');
    this.live = await launchOf(this.device, this.own);
    this.trail.push(
      `launch(${zone},${new Date(this.device.now).toISOString()},faults ${failGets},garden ${gardenUnread ? 'unread' : 'read'},${begins ? 'begin' : 'first minute'})`,
    );
    if (begins) await this.begin();
    else await this.check('launch');
  }

  async close() {
    if (this.makings >= 5) this.bump('launch:5+ makings');
    await this.running.close();
    this.live = undefined;
  }

  async begin() {
    this.madeBy = null;
    await this.running.run(this.running.session.begin);
    if (this.held.tag === 'Unread') this.bump('begin:unread passages');
    if (this.plan === null && this.canMake()) {
      this.bump('made:begin');
      this.made(isUnderWay(this.device.status), 'begin');
    }
    await this.check('begin');
  }

  async add(range: Span, refused: boolean, kind: string) {
    this.madeBy = null;
    const before = this.held;
    this.device.refuse = refused;
    const answer = await this.running.run(addPassage(range));
    this.device.refuse = false;
    const want = addRule(CORPUS, this.held, range, refused);
    this.bump(`add:${want.outcome}`);
    if (kind.endsWith(', again')) this.bump(`add again:${want.outcome}`);
    else this.bump(`add kind:${kind}`);
    if (before.tag === 'Read' && before.passages.length >= 3 && want.outcome === 'Invalid')
      this.bump('clash:invalid on a full list');
    if (before.tag === 'Unread' && kind.startsWith('invalid')) this.bump('clash:invalid on unread');
    if (answer !== want.outcome) this.fail(`add ${json(range)}: ${answer}, model ${want.outcome}`);
    this.held = want.held;
    if (want.outcome === 'Added') {
      this.disk.set(KEY, storedText(this.held.tag === 'Read' ? this.held.passages : []));
      this.again('add');
    } else if (this.plan !== null) this.bump(`no making:add:${want.outcome}`);
    await this.check(`add ${json(range)}${refused ? ' refused' : ''} = ${answer}`);
    return want.outcome;
  }

  async remove(range: Span, refused: boolean) {
    this.madeBy = null;
    const before = this.held;
    this.device.refuse = refused;
    const answer = await this.running.run(removePassage(range));
    this.device.refuse = false;
    const want = removeRule(this.held, range, refused);
    this.bump(`remove:${want.outcome}`);
    if (answer !== want.outcome)
      this.fail(`remove ${json(range)}: ${answer}, model ${want.outcome}`);
    this.held = want.held;
    if (want.outcome === 'Removed' && before.tag === 'Read' && this.held.tag === 'Read') {
      const lastAt = before.passages.findLastIndex((each) => json(each) === json(range));
      const lastGone = before.passages.filter((_, index) => index !== lastAt);
      if (json(lastGone) !== json(this.held.passages))
        this.bump('remove:first and last equal differ');
      this.disk.set(KEY, storedText(this.held.passages));
      const plants = plantsOf(this.disk);
      const leaving = piecesRule(CORPUS, [], { tag: 'Read', passages: [range] }, words).filter(
        (piece) =>
          plants.has(piece.reference) &&
          piecesRule(CORPUS, this.own, this.held, words).every(
            (each) => each.reference !== piece.reference,
          ),
      );
      if (leaving.length > 0) this.bump('remove:a planted verse leaves the pieces');
      this.again('remove');
    } else if (this.plan !== null) this.bump(`no making:remove:${want.outcome}`);
    await this.check(`remove ${json(range)}${refused ? ' refused' : ''} = ${answer}`);
  }

  /** Adds and removes started at once, answered and applied in call order. */
  async atOnce(calls: readonly Call[]) {
    this.madeBy = null;
    const answers = await this.running.run(
      Effect.forEach(
        calls,
        (call): Effect.Effect<string, never, Session | Passages> =>
          call.kind === 'add' ? addPassage(call.range) : removePassage(call.range),
        { concurrency: calls.length },
      ),
    );
    const wanted: string[] = [];
    let changed = false;
    for (const call of calls) {
      const want =
        call.kind === 'add'
          ? addRule(CORPUS, this.held, call.range, false)
          : removeRule(this.held, call.range, false);
      wanted.push(`${call.kind}:${want.outcome}`);
      this.held = want.held;
      if (want.outcome === 'Added' || want.outcome === 'Removed') changed = true;
    }
    const removesOnly = calls.every((call) => call.kind === 'remove');
    this.bump(`at once:${wanted.join(',')}`);
    if (wanted.includes('add:Full') && wanted.includes('add:Added'))
      this.bump('at once:the cap met');
    if (removesOnly && wanted.every((each) => each === 'remove:Removed'))
      this.bump('at once:two removes landed');
    if (removesOnly && json(calls[0]?.range) === json(calls[1]?.range))
      this.bump(`at once:the same remove twice:${wanted[1]}`);
    if (!removesOnly && wanted.includes('remove:Removed'))
      this.bump('at once:a remove beside an add');
    const said = answers.map((answer, index) => `${calls[index]?.kind}:${answer}`);
    if (json(said) !== json(wanted))
      this.fail(`calls at once: ${json(said)}, model ${json(wanted)}`);
    if (changed) {
      this.disk.set(KEY, storedText(this.held.tag === 'Read' ? this.held.passages : []));
      this.again(calls.some((call) => call.kind === 'add') ? 'add' : 'remove');
    }
    await this.check(`at once ${json(calls)} = ${json(said)}`);
  }

  async choose(minutes: Minutes) {
    const after = this.madeBy;
    this.madeBy = null;
    await this.running.run(this.running.session.choose(minutes));
    this.disk.set(MINUTES_KEY, String(minutes));
    if (this.held.tag === 'Unread') this.bump('Minutes:unread passages');
    if (after === 'add' || after === 'remove') this.bump('a making, then Minutes');
    this.again('Minutes');
    await this.check(`choose(${minutes})`);
  }

  async wake(wait: number) {
    const after = this.madeBy;
    this.madeBy = null;
    this.device.now += wait;
    await this.running.run(this.running.session.wake);
    if (this.held.tag === 'Unread') this.bump('return:unread passages');
    if (after === 'add' || after === 'remove') this.bump('a making, then a return');
    if (isUnderWay(this.device.status)) this.bump('return:recital under way');
    else this.again('return');
    await this.check(`wake(+${Math.round(wait / MINUTE)} min)`);
  }

  async hold() {
    this.madeBy = null;
    const session = await this.running.run(this.running.session.view);
    if (session.plan._tag === 'None') return;
    const items = session.plan.value.items;
    const item = items[below(this.next, items.length)];
    if (item === undefined) return;
    await this.running.run(this.running.session.hold(item));
    this.holding = item.reference;
    if (below(this.next, 2) === 0) {
      this.device.status = pickOf<Status>(this.next, ['listening', 'finishing']);
      this.trail.push(`status(${this.device.status})`);
    }
    await this.check(`hold(${item.reference})`);
  }

  async recital(status: Status) {
    this.device.status = status;
    this.trail.push(`status(${status})`);
  }

  async keep() {
    this.madeBy = null;
    const own = new Set(this.own.map((piece) => piece.reference));
    const choices = (this.plan ?? []).filter((item) => !own.has(item.reference));
    const item = choices[below(this.next, choices.length)] ?? this.plan?.[0];
    if (item === undefined || !this.gardenRead) return;
    const recall = recallOf(this.next, item.reference, this.device.now, this.zone);
    await this.running.run(this.running.recalls.keep(recall));
    const key = keyOf(recall);
    const kept = this.device.disk.get(key);
    if (kept === undefined || this.disk.has(key)) this.fail(`keep ${key}: not one new key`);
    else this.disk.set(key, kept);
    this.device.now += 1000;
    await this.check(`keep(${item.reference})`);
  }
}

/** A device's first disk: a stored value from `stored`, recall histories on some of the pieces it may plan over, a stray plant and a stored minutes choice. */
const diskOf = (
  next: () => number,
  own: readonly ModelTextPiece[],
  now: number,
  zone: string,
  tally: Map<string, number>,
) => {
  const disk = new Map<string, string>();
  const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
  const roll = below(next, 20);
  let stored: Span[] = [];
  if (roll < 2) bump('disk:no key');
  else if (roll < 4) {
    const [name, text] = GARBLED[below(next, GARBLED.length)] ?? GARBLED[0];
    disk.set(KEY, text);
    bump(`disk:garbled:${name}`);
  } else {
    for (let n = below(next, 6); n > 0; n--) stored.push(choosableOf(next, stored)[1]);
    if (below(next, 4) === 0) {
      const first = 1 + below(next, 120);
      stored.push({ book: 19, chapter: 119, first, last: first + 20 + below(next, 36) });
      bump('disk:past 20 verses');
    }
    if (stored.length > 1 && below(next, 2) === 0) {
      stored.splice(1 + below(next, stored.length), 0, { ...stored[0] } as Span);
      bump('disk:a passage twice');
    }
    stored = stored.slice(0, 6);
    disk.set(KEY, storedText(stored));
    bump(`disk:stored:${Math.min(stored.length, 4)}`);
  }
  const pieces = piecesRule(CORPUS, own, { tag: 'Read', passages: stored }, words);
  for (const piece of pieces) {
    if (below(next, 2) === 0) continue;
    let at = now - (1 + below(next, 40)) * DAY - below(next, 20) * HOUR;
    for (let n = 1 + below(next, 3); n > 0 && at < now; n--) {
      const recall = recallOf(next, piece.reference, at, zone);
      disk.set(keyOf(recall), json(recall));
      at += pickOf(next, [HOUR, DAY, 3 * DAY, 9 * DAY]);
    }
  }
  const stray = recallOf(next, 'Stray 1:1', now - 30 * DAY, zone);
  disk.set(keyOf(stray), json(stray));
  if (below(next, 2) === 0) disk.set(MINUTES_KEY, String(pickOf(next, [2, 5, 10, 20] as const)));
  return disk;
};

/** The app's own pieces for a device: the promise in most, else one to three made up, one of them naming a real verse. */
const ownOf = (next: () => number): ModelTextPiece[] => {
  if (below(next, 10) < 7) return [PROMISE];
  return Array.from({ length: 1 + below(next, 3) }, (_, index) => {
    const text = `made up ${index}`;
    if (index > 0)
      return { reference: `Made ${index}:1`, text, words: words(text), group: `Made ${index}` };
    const { book, chapter, count } = chapterOf(next);
    return {
      reference: verseRef(book, chapter, 1 + below(next, count)),
      text,
      words: words(text),
      group: 'own',
    };
  });
};

const COMMANDS = [
  'add',
  'add',
  'add',
  'add',
  'invalid',
  'remove held',
  'remove held',
  'remove absent',
  'at once',
  'removes at once',
  'minutes',
  'hold',
  'hold',
  'recital',
  'wake',
  'keep',
  'keep',
  'begin',
] as const;

/** A held passage to remove, a twice-held one first when there is one. */
const heldPick = (next: () => number, passages: ReadonlyArray<Span>) => {
  const twice = passages.filter(
    (span, index) => passages.findIndex((each) => json(each) === json(span)) !== index,
  );
  if (twice.length > 0 && below(next, 3) > 0) return twice[below(next, twice.length)];
  return passages[below(next, passages.length)];
};

const heldBy = (walk: Walk) => (walk.held.tag === 'Read' ? walk.held.passages : []);

/** What each command does to the walk, its inputs drawn from `next`. */
const STEPS: Record<(typeof COMMANDS)[number], (walk: Walk, next: () => number) => Promise<void>> =
  {
    add: async (walk, next) => {
      const [kind, range] = choosableOf(next, heldBy(walk));
      const answer = await walk.add(range, below(next, 8) === 0, kind);
      if (answer === 'Failed') await walk.add(range, false, `${kind}, again`);
    },
    invalid: async (walk, next) => {
      const kind = INVALID[below(next, INVALID.length)] ?? INVALID[0];
      await walk.add(unchoosableOf(next, kind), false, `invalid:${kind}`);
    },
    'remove held': async (walk, next) => {
      const range = heldPick(next, heldBy(walk));
      if (range === undefined) return STEPS['remove absent'](walk, next);
      const refused = below(next, 4) === 0;
      await walk.remove(range, refused);
      if (refused) await walk.remove(range, false);
    },
    'remove absent': async (walk, next) => {
      const [, range] = choosableOf(next, []);
      await walk.remove(range, below(next, 6) === 0);
    },
    'at once': (walk, next) =>
      walk.atOnce(
        Array.from({ length: 2 + below(next, 2) }, () => ({
          kind: 'add' as const,
          range: choosableOf(next, heldBy(walk))[1],
        })),
      ),
    'removes at once': (walk, next) => {
      const held = heldBy(walk);
      const removal = (): Call => ({
        kind: 'remove',
        range: heldPick(next, held) ?? choosableOf(next, [])[1],
      });
      const roll = below(next, 3);
      if (roll === 0) return walk.atOnce([removal(), removal()]);
      const addition: Call = { kind: 'add', range: choosableOf(next, held)[1] };
      return walk.atOnce(roll === 1 ? [removal(), addition] : [addition, removal()]);
    },
    minutes: (walk, next) => walk.choose(pickOf(next, [2, 5, 10, 20] as const)),
    hold: (walk) => walk.hold(),
    recital: (walk, next) =>
      walk.recital(pickOf<Status>(next, ['listening', 'finishing', 'idle', 'idle'])),
    wake: (walk, next) => walk.wake(pickOf(next, [7 * MINUTE, 3 * HOUR, DAY, 2 * DAY, 9 * DAY])),
    keep: (walk) => walk.keep(),
    begin: (walk) => walk.begin(),
  };

const playDevice = async (seed: number, tally: Map<string, number>) => {
  const next = random(seed);
  const own = ownOf(next);
  const zone0 = pickOf(next, [...WALK_ZONES] as [string, ...string[]]);
  const now = Date.UTC(
    2026,
    below(next, 12),
    1 + below(next, 28),
    below(next, 24),
    below(next, 60),
  );
  const device: Device = {
    disk: diskOf(next, own, now, zone0, tally),
    failGets: 0,
    gardenUnread: false,
    refuse: false,
    status: 'idle',
    now,
  };
  const walk = new Walk(device, own, next, tally);
  const launches = 2 + below(next, 2);
  for (let launch = 0; launch < launches; launch++) {
    if (launch > 0) {
      device.now += pickOf(next, [10 * MINUTE, 7 * HOUR, DAY, 3 * DAY]);
      if (below(next, 20) === 0) {
        const [, text] = GARBLED[below(next, GARBLED.length)] ?? GARBLED[0];
        device.disk.set(KEY, text);
        walk.disk.set(KEY, text);
        tally.set('garbled between launches', (tally.get('garbled between launches') ?? 0) + 1);
      }
    }
    const zone = launch === 0 ? zone0 : pickOf(next, [...WALK_ZONES] as [string, ...string[]]);
    const failGets = below(next, 10) < 2 ? 1 + below(next, 4) : 0;
    const gardenUnread = below(next, 10) === 0;
    await walk.launch(zone, failGets, gardenUnread, below(next, 7) > 0);
    for (let step = 6 + below(next, 8); step > 0; step--)
      await STEPS[pickOf(next, COMMANDS)](walk, next);
    await walk.close();
  }
  return walk.failures;
};

/** Each kind the walk must reach, and how many times at least. */
const FLOORS: ReadonlyArray<readonly [string, number]> = [
  ['made:add', 60],
  ['made:remove', 20],
  ['add:hold dropped', 5],
  ['add:hold kept:listening', 3],
  ['add:hold kept:finishing', 3],
  ['remove:hold dropped', 2],
  ['no making:add:Full', 20],
  ['no making:add:Invalid', 10],
  ['no making:add:Failed', 5],
  ['no making:remove:Absent', 5],
  ['no making:remove:Failed', 5],
  ['add:no plan:first minute', 10],
  ['add:no plan:unread garden', 3],
  ['add:Unread', 10],
  ['remove:Unread', 3],
  ['remove:first and last equal differ', 5],
  ['remove:a planted verse leaves the pieces', 5],
  ['a making, then Minutes', 5],
  ['a making, then a return', 5],
  ['begin:unread passages', 5],
  ['Minutes:unread passages', 3],
  ['return:unread passages', 3],
  ['return:recital under way', 5],
  ['at once:the cap met', 3],
  ['at once:two removes landed', 10],
  ['at once:the same remove twice:remove:Removed', 3],
  ['at once:the same remove twice:remove:Absent', 5],
  ['at once:a remove beside an add', 30],
  ['launch:Unread', 10],
  ['read:faults:1', 3],
  ['read:faults:3', 3],
  ['launch:unread garden', 5],
  ['launch:5+ makings', 10],
  ['clash:invalid on a full list', 5],
  ['clash:invalid on unread', 2],
  ['add again:Added', 5],
  ['add kind:over the promise', 20],
  ['add kind:a passage held', 10],
  ['add kind:an overlap', 10],
];

/** Runs `work`, the host's zone put back once it ends, however it ends. */
const zoneKept = (work: () => Promise<void>) => {
  const before = hostZone();
  return work().finally(() => restore(before));
};

describe('the session over the reader’s passages', () => {
  it('makes the plan again at each landed add or remove, and nowhere else, as the rules make it, over generated devices', async () => {
    const tally = new Map<string, number>();
    const failures: string[] = [];
    await zoneKept(async () => {
      for (let seed = 1; seed <= DEVICES && failures.length === 0; seed++)
        failures.push(
          ...(await playDevice(seed * 7919, tally)).map((each) => `seed ${seed}: ${each}`),
        );
    });
    expect(failures.slice(0, 2)).toEqual([]);
    console.log(`coverage ${FLOORS.map(([kind]) => `${kind}=${tally.get(kind) ?? 0}`).join(' ')}`);
    const short = FLOORS.filter(([kind, floor]) => (tally.get(kind) ?? 0) < floor).map(
      ([kind, floor]) => `${kind} ${tally.get(kind) ?? 0} < ${floor}`,
    );
    expect(short).toEqual([]);
  });

  it('offers nothing new on the first minute’s day, the passage’s first verse, whole, the next morning after 04:00 local, its next the day after, in five zones', async () => {
    const failures: string[] = [];
    await zoneKept(async () => {
      for (const where of [
        'Australia/Lord_Howe',
        'Pacific/Chatham',
        'Asia/Kathmandu',
        'America/New_York',
        'America/St_Johns',
      ])
        for (let seed = 1; seed <= 4; seed++) failures.push(...(await playDays(where, seed)));
    });
    expect(failures).toEqual([]);
  });
});

/** The first instant after `at` that falls on a later local day in `zone`, by the model's day. */
const nextMorning = (zone: string, at: number) => {
  const today = localDay(at, offsetIn(zone, at));
  let t = at;
  while (localDay(t, offsetIn(zone, t)) === today) t += 15 * MINUTE;
  return t;
};

/** A passage of three or more verses that misses the promise's verse, from `next`. */
const longerOf = (next: () => number): Span => {
  for (;;) {
    const { book, chapter, count } = chapterOf(next);
    if (count < 3 || (book === 23 && chapter === 41)) continue;
    const first = 1 + below(next, count - 2);
    return { book, chapter, first, last: Math.min(count, first + 2 + below(next, 18)) };
  }
};

/** One reader's three days in `zone`: the first minute's recall, an add that day, then a return each morning. */
const playDays = async (zone: string, seed: number) => {
  const next = random(seed * 104_729 + zone.length);
  const tally = new Map<string, number>();
  let first = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24));
  for (let hour = 0; hour < 48; hour++) {
    const wall = (((first + offsetIn(zone, first) * MINUTE) % DAY) + DAY) % DAY;
    if (wall >= 5 * HOUR && wall <= 17 * HOUR) break;
    first += HOUR;
  }
  const recall = recallOf(next, PROMISE.reference, first, zone);
  const device: Device = {
    disk: new Map([[keyOf(recall), json(recall)]]),
    failGets: 0,
    gardenUnread: false,
    refuse: false,
    status: 'idle',
    now: first + (1 + below(next, 30)) * MINUTE,
  };
  const walk = new Walk(device, [PROMISE], next, tally);
  const range = longerOf(next);
  const fresh = () => (walk.plan ?? []).filter((item) => item.fresh).map((item) => item.reference);
  const say = (message: string) => walk.failures.push(`${zone} seed ${seed}: ${message}`);
  await walk.launch(zone, 0, false, true);
  if (json(fresh()) !== '[]') say(`the first minute's day offers ${json(fresh())}`);
  await walk.add(range, false, 'a passage');
  if (json(fresh()) !== '[]') say(`an add on the first minute's day offers ${json(fresh())}`);
  const [firstVerse = '', secondVerse = ''] = piecesRule(
    CORPUS,
    [],
    { tag: 'Read', passages: [range] },
    words,
  ).map((piece) => piece.reference);
  await walk.wake(nextMorning(zone, device.now) + below(next, 5 * 60) * MINUTE - device.now);
  if (json(fresh()) !== json([firstVerse]))
    say(`the next morning offers ${json(fresh())}, not ${firstVerse}`);
  const kept = recallOf(next, firstVerse, device.now, zone);
  await walk.running.run(walk.running.recalls.keep(kept));
  walk.disk.set(keyOf(kept), device.disk.get(keyOf(kept)) ?? '');
  await walk.wake(MINUTE);
  if (json(fresh()) !== '[]') say(`the day the first is planted offers ${json(fresh())}`);
  await walk.wake(nextMorning(zone, device.now) + below(next, 5 * 60) * MINUTE - device.now);
  if (json(fresh()) !== json([secondVerse]))
    say(`the day after offers ${json(fresh())}, not ${secondVerse}`);
  await walk.close();
  return walk.failures;
};
