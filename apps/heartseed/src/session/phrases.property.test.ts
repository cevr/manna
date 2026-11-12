/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the walk plays each generated device's steps one after another through promise-run calls, over a disk in a plain map, switches the host's zone through `process.env.TZ` and puts it back, writes expected values as plain branches, and compares values as JSON text. */

/**
 * The migration, rule M (hspiece), at the session seam: generated stores
 * written as main wrote them, recalls under verses and under the pieces of
 * verses main cut (`<verse> [<first>-<last>]`), at any stage and date,
 * some joined (the verse planted beside its pieces), some a piece first
 * recalled today, some a piece of a verse no list holds; then generated
 * launches, Minutes taps, taps on a verse (`Session.start`), recitals of
 * what Today shows and days passing, on this build, in five zones.
 *
 * After every step: every record of the first disk is still stored, byte
 * for byte; every new record is under a verse's own reference; no plan
 * item, visit verse or its piece, hold, held piece or shown item names a
 * piece; a fresh item is cued with the full text; at each making the plan
 * equals `planModel` over whole verses (so no old piece is planned, and a
 * piece first recalled today still spends the day's one new piece); each
 * verse's field stage is its own plant's, else `not planted` whatever
 * pieces of it are stored (the owner's q87 (b), by `fieldFoldRule`); and
 * days sown never fall.
 */

import { describe, expect, it } from 'bun:test';
import { Clock, Context, Effect, Exit, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { readPassage } from '../../vite/passage';
import { Dictation } from '../dictation';
import { initial } from '../dictation/attempt';
import { fieldOf } from '../field';
import { Chime, cueIn, Garden, layer as gardenLayer, type ReadGarden } from '../garden';
import { sourceWords } from '../matcher/words';
import { layer as passagesLayer, type Passages } from '../passages';
import { COLLECTIONS } from '../promises';
import { collectionsOf } from '../promises/taught';
import { Recalls, type Grade, type Recall } from '../sayit';
import { MINUTES, type Minutes } from '../session';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
import { KEY, type Held, type ModelTextPiece, type Span, storedText } from '../test/passages-model';
import { CORPUS } from '../test/passages-rig';
import { fieldFoldRule, oldPiecesRule, phraseOfRule, verseOfRule } from '../test/phrase-model';
import { fieldPassagesModel, piecesModel, promiseVerses } from '../test/promise-model';
import { DAY, HOUR, localDay, MINUTE, planModel } from '../test/session-model';
import { hostZone, offsetIn, restore, travel } from '../test/zone';
import { shownOf } from './run';
import { layer as sessionLayer, Session, type SessionView } from './service';

const DEVICES = 28;
const STEPS = 18;
const TAUGHT_IDS = ['protection'];
const ZONES = ['UTC', 'America/Los_Angeles', 'Asia/Kathmandu', 'Pacific/Chatham', 'Europe/Berlin'];

const PROMISE_TEXT = readPassage();
const words = (text: string) => sourceWords(text).length;
const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: words(PROMISE_TEXT.text),
  group: PROMISE_TEXT.reference,
};
const OWN = [PROMISE];

/** A verse no list holds, and its words, for a loose old piece. */
const LOOSE = { reference: 'Psalms 23:4', words: 20 };

/** Passages a device may hold: over Fear's verses, or another chapter. */
const OVER: readonly [Span, ...Span[]] = [
  { book: 19, chapter: 91, first: 1, last: 4 },
  { book: 23, chapter: 43, first: 1, last: 3 },
];

const FEAR_PIECES = piecesModel(CORPUS, [], { tag: 'Read', passages: [] }, TAUGHT_IDS, words);
const FEAR = (COLLECTIONS.find((each) => each.id === 'protection')?.promises ?? []).flatMap(
  promiseVerses,
);

const json = <A>(value: A) => JSON.stringify(value);

const HISTORIES = ['none', 'pieces', 'joined', 'whole', 'piece today'] as const;

interface Device {
  readonly disk: Map<string, string>;
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

/** The session teaching Fear, the passages and the garden over the device, as `appLayer` builds them. */
const layerOf = (device: Device) =>
  sessionLayer(OWN, collectionsOf(TAUGHT_IDS)).pipe(
    Layer.provideMerge(passagesLayer),
    Layer.provideMerge(
      gardenLayer.pipe(Layer.provide(Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })))),
    ),
    Layer.provide(Layer.mock(Dictation)({ view: Effect.succeed(initial.view) })),
    Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, storeOf(device))),
    Layer.provideMerge(Layer.merge(Layer.succeed(Clock.Clock, clockOf(device)), Logger.layer([]))),
  );

const recallOf = (next: () => number, reference: string, startedAt: number, zone: string) =>
  ({
    reference,
    startedAt,
    offset: offsetIn(zone, startedAt),
    grade: pickOf<Grade>(next, [1, 3, 3, 4, 4]),
    suggested: pickOf<Recall['suggested']>(next, [1, 2, 3]),
    words: 1 + below(next, 40),
    missed: below(next, 3),
    peeked: below(next, 2),
    extra: 0,
  }) satisfies Recall;

const recordsOf = (disk: ReadonlyMap<string, string>): Recall[] =>
  [...disk]
    .filter(([key]) => key.startsWith(PREFIX))
    .map(([, value]) => JSON.parse(value) as Recall);

const plantsOf = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const recall of recordsOf(disk))
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  return plants;
};

/** Plants `reference` with one to four recalls, the first `back` days before `now`, a few days apart. */
const plant = (
  next: () => number,
  disk: Map<string, string>,
  reference: string,
  at: { readonly now: number; readonly back: number; readonly zone: string },
) => {
  const count = 1 + below(next, 4);
  for (let n = 0; n < count; n++) {
    const recall = recallOf(
      next,
      reference,
      at.now - at.back * DAY + n * Math.floor((at.back * DAY) / (count + 1)),
      at.zone,
    );
    disk.set(keyOf(recall), json(recall));
  }
};

/** Main's records of one Fear verse, by `history`: none, the verse whole, some of its old pieces, both, or its first piece today. */
const plantHistory = (
  next: () => number,
  disk: Map<string, string>,
  piece: { readonly reference: string; readonly words: number },
  history: string,
  at: { readonly now: number; readonly zone: string },
) => {
  const { now, zone } = at;
  const old = oldPiecesRule(piece.reference, piece.words);
  const some = old.slice(0, 1 + below(next, old.length));
  if (history === 'whole' || history === 'joined')
    plant(next, disk, piece.reference, { now, back: 1 + below(next, 20), zone });
  if (history === 'pieces' || history === 'joined')
    for (const reference of some)
      plant(next, disk, reference, { now, back: 21 + below(next, 40), zone });
  if (history !== 'piece today') return;
  const recall = recallOf(next, old[0] ?? piece.reference, now - below(next, 3) * HOUR, zone);
  if (localDay(recall.startedAt, recall.offset) === localDay(now, offsetIn(zone, now)))
    disk.set(keyOf(recall), json(recall));
};

/** A device's first disk as main wrote it: each Fear verse with one history, sometimes a loose old piece, and the passages. */
const diskOf = (next: () => number, now: number, zone: string, bump: (kind: string) => void) => {
  const disk = new Map<string, string>();
  plant(next, disk, PROMISE.reference, { now, back: 1 + below(next, 20), zone });
  for (const piece of FEAR_PIECES) {
    const old = oldPiecesRule(piece.reference, piece.words);
    const history = old.length === 0 ? pickOf(next, ['none', 'whole']) : pickOf(next, HISTORIES);
    bump(`gen:${history}`);
    plantHistory(next, disk, piece, history, { now, zone });
  }
  if (below(next, 3) === 0) {
    const [first] = oldPiecesRule(LOOSE.reference, LOOSE.words);
    if (first !== undefined) plant(next, disk, first, { now, back: 3 + below(next, 30), zone });
    bump('gen:loose');
  }
  const stored = below(next, 2) === 0 ? [pickOf(next, [...OVER])] : [];
  disk.set(KEY, storedText(stored));
  return { disk, stored };
};

const isPiece = (reference: string) => phraseOfRule(reference) !== undefined;

/** Whether `verse` has an old piece stored. */
const begunIn = (plants: ReadonlyMap<string, readonly Recall[]>, verse: string) =>
  [...plants.keys()].some((key) => key !== verse && verseOfRule(key) === verse);

/** One device's walk: the device, the live launch and the models beside it. */
class Walk {
  readonly failures: string[] = [];
  readonly trail: string[] = [];
  readonly first: ReadonlyMap<string, string>;
  scope = Scope.makeUnsafe();
  services!: Context.Context<Session | Passages | Recalls | Garden>;
  minutes: Minutes = 5;
  sown = 0;

  constructor(
    readonly seed: number,
    readonly next: () => number,
    readonly tally: Map<string, number>,
    readonly zone: string,
    readonly device: Device,
    readonly held: Held,
  ) {
    this.first = new Map(device.disk);
  }

  bump(kind: string) {
    this.tally.set(kind, (this.tally.get(kind) ?? 0) + 1);
  }

  fail(message: string) {
    this.failures.push(
      `seed ${this.seed}: ${message}\n  after: ${this.trail.slice(-6).join(' | ')}`,
    );
  }

  run<A>(effect: Effect.Effect<A, never, Session | Passages | Recalls | Garden>) {
    return Effect.runPromise(Effect.provideContext(effect, this.services));
  }

  get session() {
    return Context.get(this.services, Session);
  }

  /** A launch over the device's disk as it is now, the old launch closed. */
  async launch() {
    await Effect.runPromise(Scope.close(this.scope, Exit.void));
    this.scope = Scope.makeUnsafe();
    this.services = await Effect.runPromise(Layer.buildWithScope(layerOf(this.device), this.scope));
    await this.run(this.session.begin);
    this.minutes = (await this.run(this.session.view)).minutes;
    await this.making('launch');
  }

  async close() {
    await Effect.runPromise(Scope.close(this.scope, Exit.void));
  }

  async garden(): Promise<ReadGarden | null> {
    const garden = await this.run(Effect.flatMap(Garden, (each) => each.view));
    return garden._tag === 'Unread' ? null : garden;
  }

  /** The plan just made, against the model over whole verses. */
  async making(step: string) {
    const view = await this.run(this.session.view);
    const plants = plantsOf(this.device.disk);
    const pieces = piecesModel(CORPUS, OWN, this.held, TAUGHT_IDS, words);
    const want = planModel({
      plants,
      pieces,
      at: this.device.now,
      offset: offsetIn(this.zone, this.device.now),
      minutes: this.minutes,
    });
    const got = Option.match(view.plan, {
      onNone: () => null,
      onSome: (plan) => plan.items.map((item) => [item.reference, item.fresh, item.recalls]),
    });
    const items = want.items.map((item) => [item.reference, item.fresh, item.recalls]);
    if (json(got) !== json(items)) this.fail(`${step}: plan ${json(got)}, model ${json(items)}`);
    const today = localDay(this.device.now, offsetIn(this.zone, this.device.now));
    const pieceToday = [...plants].some(
      ([reference, recalls]) =>
        isPiece(reference) &&
        recalls.every((recall) => localDay(recall.startedAt, recall.offset) === today),
    );
    if (want.fresh === 'planted today' && pieceToday) this.bump('plan:held back by a piece today');
    for (const item of want.items)
      if (item.fresh && begunIn(plants, item.reference))
        this.bump('plan:new verse begun in pieces');
    for (const item of want.items)
      if (!item.fresh && begunIn(plants, item.reference))
        this.bump('plan:review beside old pieces');
    await this.check(step);
  }

  async check(step: string) {
    this.trail.push(step);
    const view: SessionView = await this.run(this.session.view);
    this.checkNames(step, view);
    this.checkDisk(step);
    const garden = await this.garden();
    if (garden === null) return this.fail(`${step}: the garden unread`);
    this.checkShown(step, view, garden);
    this.checkField(step, garden);
  }

  /** The session names verses alone, and no piece carries pieces. */
  checkNames(step: string, view: SessionView) {
    const named = [
      ...Option.match(view.plan, { onNone: () => [], onSome: (plan) => plan.items }).map(
        (item) => item.reference,
      ),
      ...view.visit.flatMap((verse) => [verse.item.reference, verse.piece.reference]),
      ...Option.toArray(view.held).map((item) => item.reference),
      ...Option.toArray(view.heldPiece).map((piece) => piece.reference),
      ...view.pieces.map((piece) => piece.reference),
    ];
    const pieces = named.filter(isPiece);
    if (pieces.length > 0) this.fail(`${step}: the session names old pieces ${json(pieces)}`);
    if (view.pieces.some((piece) => 'phrases' in piece))
      this.fail(`${step}: a piece carries pieces`);
  }

  /** Every stored record is kept as main wrote it, and each new one is under a verse's own reference. */
  checkDisk(step: string) {
    for (const [key, value] of this.first)
      if (this.device.disk.get(key) !== value) this.fail(`${step}: the stored ${key} changed`);
    for (const [key, value] of this.device.disk)
      if (key.startsWith(PREFIX) && !this.first.has(key)) {
        const { reference } = JSON.parse(value) as Recall;
        if (verseOfRule(reference) !== reference || isPiece(reference))
          this.fail(`${step}: a new record under ${reference}`);
      }
  }

  /** Today shows a verse, and a verse not planted under its full text. */
  checkShown(step: string, view: SessionView, garden: ReadGarden) {
    const shown = shownOf(view, Option.some(garden));
    if (shown._tag !== 'Item') return;
    if (isPiece(shown.item.reference) || isPiece(shown.piece.reference))
      this.fail(`${step}: Today shows ${shown.piece.reference}`);
    const cue = cueIn(garden, shown.item.reference);
    if (!garden.plants.has(shown.item.reference) && cue !== 'full')
      this.fail(`${step}: a fresh ${shown.item.reference} cued ${cue}`);
  }

  /** The field as the fold rule gives it, a verse by its own plant alone, and the days sown never falling. */
  checkField(step: string, garden: ReadGarden) {
    const passages = fieldPassagesModel(
      [{ title: PROMISE.reference, verses: [PROMISE.reference] }],
      this.held,
      TAUGHT_IDS,
    );
    const field = fieldOf(garden, passages);
    const want = fieldFoldRule(recordsOf(this.device.disk), passages);
    const rowsOf = (rows: typeof want.rows) =>
      json(rows.map((row) => [row.title, row.plants.map((each) => [each.reference, each.stage])]));
    if (rowsOf(field.rows) !== rowsOf(want.rows) || field.sown !== want.sown)
      this.fail(
        `${step}: field ${rowsOf(field.rows)} ${field.sown}, model ${rowsOf(want.rows)} ${want.sown}`,
      );
    const plants = plantsOf(this.device.disk);
    for (const row of field.rows)
      for (const each of row.plants) {
        if (!begunIn(plants, each.reference)) continue;
        this.bump(
          plants.has(each.reference)
            ? 'field:begun verse at its own stage'
            : 'field:begun verse not planted',
        );
        if (!plants.has(each.reference) && each.stage !== 'not planted')
          this.fail(`${step}: ${each.reference} shows ${each.stage} by its old pieces`);
      }
    if (field.sown < this.sown)
      this.fail(`${step}: days sown fell from ${this.sown} to ${field.sown}`);
    this.sown = field.sown;
  }

  /** A tap on a Fear verse, a begun one first in half. */
  async tap() {
    const plants = plantsOf(this.device.disk);
    const begun = FEAR.filter((verse) => begunIn(plants, verse));
    const pool = begun.length > 0 && below(this.next, 2) === 0 ? begun : FEAR;
    const verse = pool[below(this.next, pool.length)] ?? '';
    await this.run(this.session.start(verse));
    const view = await this.run(this.session.view);
    const [started] = view.visit;
    if (started !== undefined && started.item.reference !== verse)
      this.fail(`tap(${verse}): started ${started.item.reference}`);
    if (started?.item.fresh === true && begunIn(plants, verse))
      this.bump('tap:begun verse learned');
    await this.check(`tap(${verse})`);
  }

  /** A recital of what Today shows, kept, then Next. */
  async say() {
    const view = await this.run(this.session.view);
    const garden = await this.garden();
    if (garden === null) return;
    const shown = shownOf(view, Option.some(garden));
    if (shown._tag !== 'Item') return this.bump('say:done');
    const { item } = shown;
    const plants = plantsOf(this.device.disk);
    if (item.fresh && begunIn(plants, item.reference)) this.bump('say:begun verse said whole');
    await this.run(this.session.hold(item));
    this.device.now += MINUTE;
    const recalls = Context.get(this.services, Recalls);
    await this.run(recalls.keep(recallOf(this.next, item.reference, this.device.now, this.zone)));
    this.device.now += MINUTE;
    await this.check(`say(${item.reference})`);
    await this.run(this.session.next);
    await this.check('next');
  }

  async step() {
    const roll = below(this.next, 12);
    if (roll < 3) return this.tap();
    if (roll < 8) return this.say();
    if (roll < 9) {
      this.minutes = pickOf<Minutes>(this.next, [...MINUTES]);
      await this.run(this.session.choose(this.minutes));
      return this.making(`minutes(${this.minutes})`);
    }
    if (roll < 10) {
      this.bump('relaunch');
      return this.launch();
    }
    this.device.now += (1 + below(this.next, 3)) * DAY + below(this.next, 6) * HOUR;
    this.bump('day');
    await this.run(this.session.wake);
    return this.making('wake');
  }
}

const playDevice = async (seed: number, tally: Map<string, number>) => {
  const next = random(seed);
  const zone = pickOf(next, ZONES as [string, ...string[]]);
  travel(zone);
  const now = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24));
  const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
  const { disk, stored } = diskOf(next, now, zone, bump);
  const walk = new Walk(seed, next, tally, zone, { disk, now }, { tag: 'Read', passages: stored });
  await walk.launch();
  for (let step = 0; step < STEPS && walk.failures.length === 0; step++) await walk.step();
  await walk.close();
  return walk.failures;
};

/** Each case the walk must reach, and how many times at least. */
const FLOORS: ReadonlyArray<readonly [string, number]> = [
  ['gen:pieces', 40],
  ['gen:joined', 40],
  ['gen:piece today', 40],
  ['gen:loose', 5],
  ['plan:held back by a piece today', 20],
  ['plan:new verse begun in pieces', 30],
  ['plan:review beside old pieces', 100],
  ['tap:begun verse learned', 25],
  ['say:begun verse said whole', 15],
  ['field:begun verse not planted', 1500],
  ['field:begun verse at its own stage', 1000],
  ['relaunch', 25],
  ['day', 45],
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

describe('the migration of old pieces (rule M)', () => {
  it('keeps every stored record, plans, shows and stores whole verses alone, and shows a verse by its own plant alone, over stores main wrote', async () => {
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
