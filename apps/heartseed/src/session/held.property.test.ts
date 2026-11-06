/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the walk plays each generated device's rounds one after another through promise-run calls, over a disk in a plain map, switches the host's zone through `process.env.TZ` and puts it back, writes expected values as plain branches, and compares values as JSON text. */

/**
 * The held verse (C10) at the session seam: generated devices, each the
 * promise and one to three passages (one held twice in half of them, one
 * over the promise's verse in some), recalls days back on the promise and
 * on some passage verses, in five zones. Each device plays two rounds: Say
 * it's hold on an item of the plan of a kind the round draws (new, a
 * review of a passage verse, or the promise's review), its recital
 * listening, finishing, or finished with its recall kept, then one change
 * through the app's own `addPassage` or `removePassage`: a remove of the
 * held verse's passage, of another passage, of a passage held twice that
 * holds it, or an add; then the recital ends and `Next`.
 *
 * After each step the walk holds the session to the models
 * (`test/passages-model.ts` for the passages and the pieces,
 * `test/session-model.ts` for the plan): the pieces, the plan and the hold
 * keep hskjv's meaning, and `shownOf` is, while an item is held, that item
 * with its own piece (its reference and text as the hold took them) and
 * `held`, never `Done`; with none held, the plan's first item not done, its
 * piece one of the pieces. After `Next`, Today never shows a verse the
 * change took out of the pieces, and no plan made after it holds one.
 */

import { describe, expect, it } from 'bun:test';
import { Clock, Context, Effect, Exit, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { readPassage } from '../../vite/passage';
import { addPassage, removePassage } from '../app';
import { Dictation } from '../dictation';
import { initial, type Status } from '../dictation/attempt';
import { Chime, Garden, layer as gardenLayer } from '../garden';
import { sourceWords } from '../matcher/words';
import { layer as passagesLayer, type Passages } from '../passages';
import { Recalls, type Grade, type Recall } from '../sayit';
import type { Item } from '../session';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
import {
  addRule,
  type Held,
  KEY,
  piecesRule,
  removeRule,
  type ModelTextPiece,
  type Span,
  storedText,
} from '../test/passages-model';
import { choosableOf, CORPUS } from '../test/passages-rig';
import { DAY, MINUTE, planModel } from '../test/session-model';
import { hostZone, offsetIn, restore, travel } from '../test/zone';
import { shownOf, type Shown } from './run';
import { layer as sessionLayer, Session, type SessionView } from './service';

const DEVICES = 140;
const ROUNDS = 2;

const ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
] as const;

const KINDS = ['new', 'review', 'promise'] as const;
type Kind = (typeof KINDS)[number];

const RECITALS = ['listening', 'finishing', 'finished'] as const;
type Recital = (typeof RECITALS)[number];

const CHANGES = ['its passage', 'another passage', 'held twice', 'an add'] as const;
type Change = (typeof CHANGES)[number];

const PROMISE_TEXT = readPassage();
const words = (text: string) => sourceWords(text).length;
const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: words(PROMISE_TEXT.text),
  group: PROMISE_TEXT.reference,
};
const OWN = [PROMISE];

const json = <A>(value: A) => JSON.stringify(value);

const equal = (a: Span, b: Span) => json(a) === json(b);

/** The device: its disk, Dictation's status and the clock's instant. */
interface Device {
  readonly disk: Map<string, string>;
  status: Status;
  now: number;
}

const storeOf = (device: Device) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => device.disk.get(key)),
    set: (key, value) => Effect.sync(() => void device.disk.set(key, value)),
    remove: (key) => Effect.sync(() => void device.disk.delete(key)),
    clear: Effect.sync(() => device.disk.clear()),
    size: Effect.sync(() => device.disk.size),
    keys: Effect.sync(() => [...device.disk.keys()]),
  });

const nanos = (millis: number) => BigInt(millis) * 1_000_000n;

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
const layerOf = (device: Device) =>
  sessionLayer(OWN).pipe(
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

const recallOf = (next: () => number, reference: string, startedAt: number, zone: string) =>
  ({
    reference,
    startedAt,
    offset: offsetIn(zone, startedAt),
    grade: pickOf<Grade>(next, [1, 3, 3, 4]),
    suggested: pickOf<Recall['suggested']>(next, [1, 2, 3]),
    words: 1 + below(next, 40),
    missed: below(next, 3),
    peeked: below(next, 2),
    extra: 0,
  }) satisfies Recall;

const plantsOf = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of disk)
    if (key.startsWith(PREFIX)) {
      const recall: Recall = JSON.parse(value);
      plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
    }
  return plants;
};

/** The verses of `span`, by reference. */
const versesOf = (span: Span) =>
  piecesRule(CORPUS, [], { tag: 'Read', passages: [span] }, words).map((each) => each.reference);

/** A device's first disk: the promise planted 2-40 days back, one to three passages (the first held twice in half, one over the promise's verse in a third), and recalls weeks back on some passage verses. */
const diskOf = (next: () => number, now: number, zone: string) => {
  const disk = new Map<string, string>();
  const stored: Span[] = [];
  for (let n = 1 + below(next, 3); n > 0; n--) stored.push(choosableOf(next, stored)[1]);
  if (below(next, 3) === 0)
    stored.push({ book: 23, chapter: 41, first: 8 + below(next, 3), last: 11 + below(next, 5) });
  if (below(next, 2) === 0 && stored[0] !== undefined)
    stored.splice(1 + below(next, stored.length), 0, { ...stored[0] });
  disk.set(KEY, storedText(stored));
  const promise = recallOf(next, PROMISE.reference, now - (2 + below(next, 38)) * DAY, zone);
  disk.set(keyOf(promise), json(promise));
  for (const piece of piecesRule(CORPUS, [], { tag: 'Read', passages: stored }, words)) {
    if (below(next, 3) > 0) continue;
    const recall = recallOf(next, piece.reference, now - (8 + below(next, 60)) * DAY, zone);
    disk.set(keyOf(recall), json(recall));
  }
  return { disk, stored };
};

/** The model's plan item: what the session's plan shows of one. */
interface ItemText {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
}

const kindOf = (item: ItemText): Kind => {
  if (item.fresh) return 'new';
  if (item.reference === PROMISE.reference) return 'promise';
  return 'review';
};

const textOf = (shown: Shown) => (shown._tag === 'Item' ? shown.piece.reference : shown._tag);

const planText = (view: SessionView) =>
  Option.match(view.plan, {
    onNone: () => null,
    onSome: (made) =>
      made.items.map((item) => ({
        reference: item.reference,
        fresh: item.fresh,
        recalls: item.recalls,
      })),
  });

/** One device's walk: the device, the live launch and the models beside it. */
class Walk {
  readonly failures: string[] = [];
  readonly trail: string[] = [];
  readonly seed: number;
  readonly next: () => number;
  readonly tally: Map<string, number>;
  readonly zone: string;
  readonly device: Device;
  readonly services: Context.Context<Session | Passages | Recalls | Garden>;
  held: Held;
  pieces: ModelTextPiece[];
  plan: ItemText[];
  holding: ModelTextPiece | null = null;

  constructor(
    seed: number,
    next: () => number,
    tally: Map<string, number>,
    zone: string,
    device: Device,
    stored: Span[],
    services: Context.Context<Session | Passages | Recalls | Garden>,
  ) {
    this.seed = seed;
    this.next = next;
    this.tally = tally;
    this.zone = zone;
    this.device = device;
    this.services = services;
    this.held = { tag: 'Read', passages: stored };
    this.pieces = piecesRule(CORPUS, OWN, this.held, words);
    this.plan = this.modelPlan();
    this.trail.push(`launch(${zone},${new Date(device.now).toISOString()},${json(stored)})`);
  }

  run<A>(effect: Effect.Effect<A, never, Session | Passages | Recalls | Garden>) {
    return Effect.runPromise(Effect.provideContext(effect, this.services));
  }

  get session() {
    return Context.get(this.services, Session);
  }

  bump(kind: string) {
    this.tally.set(kind, (this.tally.get(kind) ?? 0) + 1);
  }

  fail(message: string) {
    this.failures.push(
      `seed ${this.seed}: ${message}\n  after: ${this.trail.slice(-6).join(' | ')}`,
    );
  }

  modelPlan(): ItemText[] {
    return planModel({
      plants: plantsOf(this.device.disk),
      pieces: this.pieces,
      at: this.device.now,
      offset: offsetIn(this.zone, this.device.now),
      minutes: 5,
    }).items.map((item) => ({
      reference: item.reference,
      fresh: item.fresh,
      recalls: item.recalls,
    }));
  }

  /** The plan's items no recall since its making has done. */
  open() {
    const plants = plantsOf(this.device.disk);
    return this.plan.filter((item) => (plants.get(item.reference)?.length ?? 0) <= item.recalls);
  }

  async keep(reference: string) {
    this.device.now += MINUTE;
    const recalls = Context.get(this.services, Recalls);
    await this.run(recalls.keep(recallOf(this.next, reference, this.device.now, this.zone)));
    this.device.now += MINUTE;
  }

  async shown() {
    const view = await this.run(this.session.view);
    const garden = await this.run(Effect.flatMap(Garden, (each) => each.view));
    if (garden._tag === 'Unread') return { view, shown: null };
    return { view, shown: shownOf(view, Option.some(garden)) };
  }

  /** The plan, the pieces and the hold against the models. */
  checkSession(step: string, view: SessionView) {
    const plan = planText(view);
    if (json(plan) !== json(this.plan))
      this.fail(`${step}: plan ${json(plan)}, model ${json(this.plan)}`);
    const references = view.pieces.map((piece) => piece.reference);
    if (json(references) !== json(this.pieces.map((piece) => piece.reference)))
      this.fail(`${step}: pieces ${references.length}, model ${this.pieces.length}`);
    const heldNow = Option.match(view.held, {
      onNone: () => null,
      onSome: (item) => item.reference,
    });
    const want = this.holding?.reference ?? null;
    if (heldNow !== want) this.fail(`${step}: held ${heldNow}, model ${want}`);
  }

  /** What Today shows while `holding` is held: that item with its own piece, never `Done`. */
  checkHeld(step: string, shown: Shown, holding: ModelTextPiece) {
    if (shown._tag !== 'Item' || !shown.held)
      return this.fail(`${step}: holding ${holding.reference}, Today shows ${shown._tag}`);
    if (shown.item.reference !== holding.reference || shown.piece.reference !== holding.reference)
      return this.fail(`${step}: holding ${holding.reference}, Today shows ${textOf(shown)}`);
    if (shown.piece.text !== holding.text)
      this.fail(`${step}: ${holding.reference} shown with another text`);
  }

  /** What Today shows with none held: the plan's first item not done, else `Done`. */
  checkOpen(step: string, shown: Shown) {
    const first = this.open()[0];
    if (first === undefined) {
      if (shown._tag !== 'Done') this.fail(`${step}: the plan done, Today shows ${textOf(shown)}`);
      return;
    }
    if (shown._tag !== 'Item' || shown.held || shown.piece.reference !== first.reference)
      this.fail(`${step}: Today shows ${textOf(shown)}, model ${first.reference}`);
  }

  async check(step: string) {
    this.trail.push(step);
    const { view, shown } = await this.shown();
    this.checkSession(step, view);
    if (shown === null) return this.fail(`${step}: the garden unread`);
    if (this.holding === null) this.checkOpen(step, shown);
    else this.checkHeld(step, shown, this.holding);
  }

  /** Say it's hold on an open item of the kind drawn (else any open item), and its recital: listening, finishing, or finished with its recall kept. */
  async hold(): Promise<readonly [ItemText, Recital] | null> {
    const wanted = pickOf<Kind>(this.next, [...KINDS]);
    const open = this.open();
    const item =
      open.find((each) => kindOf(each) === wanted) ?? open[below(this.next, open.length)];
    if (item === undefined) {
      this.bump('round:plan done');
      return null;
    }
    const view = await this.run(this.session.view);
    const planned = Option.flatMap(view.plan, (made) =>
      Option.fromNullishOr(made.items.find((each) => each.reference === item.reference)),
    );
    const piece = this.pieces.find((each) => each.reference === item.reference);
    if (Option.isNone(planned) || piece === undefined) {
      this.fail(`hold: ${item.reference} not in the session's plan`);
      return null;
    }
    await this.run(this.session.hold(planned.value satisfies Item));
    this.holding = piece;
    const recital = pickOf<Recital>(this.next, [...RECITALS]);
    if (recital === 'finished') await this.keep(item.reference);
    else this.device.status = recital;
    await this.check(`hold(${kindOf(item)} ${item.reference}, ${recital})`);
    return [item, recital];
  }

  /** The change drawn for the held `reference`, its passage three times as likely, else whichever the list allows. */
  changeOf(reference: string): readonly [Change, Span] {
    const passages = this.held.tag === 'Read' ? this.held.passages : [];
    const holds = (span: Span) => versesOf(span).includes(reference);
    const its = passages.filter(holds);
    const twice = its.filter((span) => passages.filter((each) => equal(each, span)).length > 1);
    const pick = (list: ReadonlyArray<Span>) => list[below(this.next, list.length)];
    const add = choosableOf(this.next, passages)[1];
    const byChange: Record<Change, Span | undefined> = {
      'its passage': pick(its.filter((span) => !twice.some((each) => equal(each, span)))),
      'another passage': pick(passages.filter((span) => !holds(span))),
      'held twice': pick(twice),
      'an add': add,
    };
    const wanted = pickOf<Change>(this.next, [...CHANGES, 'its passage', 'its passage']);
    const options = CHANGES.flatMap((change): Array<readonly [Change, Span]> => {
      const span = byChange[change];
      return span === undefined ? [] : [[change, span]];
    });
    return (
      options.find(([each]) => each === wanted) ??
      options[below(this.next, options.length)] ?? ['an add', add]
    );
  }

  /** The change through the app's own call, and the model's making when it lands: the hold kept only while the recital is under way. Answers the pieces it took out. */
  async change(item: ItemText, recital: Recital) {
    const [change, span] = this.changeOf(item.reference);
    const before = this.pieces;
    const want =
      change === 'an add'
        ? addRule(CORPUS, this.held, span, false)
        : removeRule(this.held, span, false);
    const answer = await this.run(change === 'an add' ? addPassage(span) : removePassage(span));
    if (answer !== want.outcome)
      this.fail(`${change} ${json(span)}: ${answer}, model ${want.outcome}`);
    this.held = want.held;
    if (want.outcome === 'Added' || want.outcome === 'Removed') {
      this.device.disk.set(KEY, storedText(this.held.tag === 'Read' ? this.held.passages : []));
      this.pieces = piecesRule(CORPUS, OWN, this.held, words);
      this.plan = this.modelPlan();
      if (recital === 'finished') this.holding = null;
    }
    const gone = before.filter((each) =>
      this.pieces.every((now) => now.reference !== each.reference),
    );
    const left = gone.some((each) => each.reference === item.reference);
    this.bump(`kind:${kindOf(item)}`);
    this.bump(`recital:${recital}`);
    this.bump(`change:${change}:${want.outcome}`);
    if (left) this.bump(`left the pieces:${recital}`);
    if (left && recital !== 'finished') this.bump(`left the pieces:${kindOf(item)}`);
    await this.check(`${change} ${json(span)} = ${answer}`);
    return new Set(gone.map((each) => each.reference));
  }

  /** The recital ends (its recall kept in half), then `Next`: Today never shows, and the plan never holds, a verse that left. */
  async end(item: ItemText, recital: Recital, gone: ReadonlySet<string>) {
    if (recital !== 'finished') {
      this.device.status = 'idle';
      if (below(this.next, 2) === 0) await this.keep(item.reference);
      await this.check(`recital ended (${item.reference})`);
    }
    await this.run(this.session.next);
    this.holding = null;
    await this.check('next');
    const { view, shown } = await this.shown();
    if (shown !== null && shown._tag === 'Item' && gone.has(shown.piece.reference))
      this.fail(`next: Today shows ${shown.piece.reference}, which left the pieces`);
    for (const each of Option.match(view.plan, { onNone: () => [], onSome: (made) => made.items }))
      if (gone.has(each.reference))
        this.fail(`next: the plan holds ${each.reference}, which left the pieces`);
  }
}

const playDevice = async (seed: number, tally: Map<string, number>) => {
  const next = random(seed);
  const zone = pickOf(next, [...ZONES] as [string, ...string[]]);
  travel(zone);
  const now = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24));
  const { disk, stored } = diskOf(next, now, zone);
  const device: Device = { disk, status: 'idle', now };
  const scope = Scope.makeUnsafe();
  const services = await Effect.runPromise(Layer.buildWithScope(layerOf(device), scope));
  const walk = new Walk(seed, next, tally, zone, device, stored, services);
  await walk.run(walk.session.begin);
  await walk.check('begin');
  for (let round = 0; round < ROUNDS && walk.failures.length === 0; round++) {
    const held = await walk.hold();
    if (held === null) break;
    const [item, recital] = held;
    await walk.end(item, recital, await walk.change(item, recital));
  }
  await Effect.runPromise(Scope.close(scope, Exit.void));
  return walk.failures;
};

/** Each case the walk must reach, and how many times at least. */
const FLOORS: ReadonlyArray<readonly [string, number]> = [
  ['kind:new', 40],
  ['kind:review', 40],
  ['kind:promise', 40],
  ['recital:listening', 40],
  ['recital:finishing', 40],
  ['recital:finished', 40],
  ['change:its passage:Removed', 40],
  ['change:another passage:Removed', 25],
  ['change:held twice:Removed', 10],
  ['change:an add:Added', 20],
  ['change:an add:Full', 15],
  ['left the pieces:listening', 8],
  ['left the pieces:finishing', 8],
  ['left the pieces:finished', 8],
  ['left the pieces:new', 8],
  ['left the pieces:review', 6],
];

/** Plays every device, the host's zone put back once they end, however they end. */
const playAll = (tally: Map<string, number>) => {
  const before = hostZone();
  const play = async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= DEVICES && failures.length === 0; seed++)
      failures.push(...(await playDevice(seed * 6151, tally)));
    return failures;
  };
  return play().finally(() => restore(before));
};

describe('the held verse', () => {
  it('stays shown with its own piece until Next, whatever change lands under way, and never shows after Next once its passage left, over generated devices', async () => {
    const tally = new Map<string, number>();
    const failures = await playAll(tally);
    expect(failures.slice(0, 2)).toEqual([]);
    console.log(`coverage ${FLOORS.map(([kind]) => `${kind}=${tally.get(kind) ?? 0}`).join(' ')}`);
    const short = FLOORS.filter(([kind, floor]) => (tally.get(kind) ?? 0) < floor).map(
      ([kind, floor]) => `${kind} ${tally.get(kind) ?? 0} < ${floor}`,
    );
    expect(short).toEqual([]);
  });
});
