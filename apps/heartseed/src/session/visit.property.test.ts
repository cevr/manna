/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the walk plays each generated device's steps one after another through promise-run calls, over a disk in a plain map, switches the host's zone through `process.env.TZ` and puts it back, writes expected values as plain branches, and compares values as JSON text. */

/**
 * A visit (V1-V5) at the session seam: generated devices, each the promise
 * planted days back, the Fear collection's verses planted at a share, one
 * to three promises of other collections planted whole (half of them of
 * two or three verses) and sometimes one verse alone of a longer one, zero
 * to two held passages over Fear's verses, the promise's or any chapter,
 * in five zones, the session teaching Fear. Each device walks generated
 * steps: a tap on a known promise (`visit`, whatever is held or open), a
 * list view's `Practice this list` (`startList`) on one of the field's
 * lists or on a few of its verses in any order (whatever is held or open,
 * a recital under way or not), Say
 * it's hold on the item shown with its recall kept, refused by the store or
 * left under way, `Next`, a Minutes tap, a return, a landed add or remove
 * (each with or without a recital under way), or time passing.
 *
 * After every step the session is held to the models apart from it: the
 * plan to `planModel` (`test/session-model.ts`) at each making, the pieces
 * to `piecesModel`, the visit to `visitModel` (each verse's baseline its
 * recall count at the tap, its piece the corpus's text grouped by the
 * collection's title; after `startList`, to `listStartModel` at the tap,
 * each item as planned or as a start, its piece its own, with the plan,
 * the minutes, the hold and the disk unchanged by it), what `shownOf`
 * shows to `shownModel` (the held
 * verse, else the visit's first not done, else the plan's), and the counts
 * line to `countsModel` over the plan alone.
 */

import { describe, expect, it } from 'bun:test';
import { Clock, Context, Effect, Exit, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { readPassage } from '../../vite/passage';
import { addPassage, removePassage } from '../app';
import { Dictation } from '../dictation';
import { initial, type Status } from '../dictation/attempt';
import { Chime, cueIn, Garden, layer as gardenLayer } from '../garden';
import { sourceWords } from '../matcher/words';
import { layer as passagesLayer, type Passages, type Range } from '../passages';
import { COLLECTIONS, type Collection } from '../promises';
import { collectionsOf } from '../promises/taught';
import { Recalls, type Grade, type Recall } from '../sayit';
import { countsOf, MINUTES, type Minutes } from '../session';
import { below, keyOf, pickOf, PREFIX, random, referenceCue } from '../test/garden-model';
import {
  addRule,
  type Held,
  KEY,
  type ModelTextPiece,
  removeRule,
  type Span,
  storedText,
  versesIn,
} from '../test/passages-model';
import { choosableOf, CORPUS } from '../test/passages-rig';
import { placesOf } from '../test/home-model';
import { listStartModel } from '../test/list-model';
import {
  fieldPassagesModel,
  needModel,
  piecesModel,
  promiseVerses,
  shownModel,
  visitModel,
  type ModelVisitVerse,
} from '../test/promise-model';
import { expandRule, verseOfRule, withPhrasesRule } from '../test/phrase-model';
import { countsModel, DAY, HOUR, MINUTE, planModel, type ModelItem } from '../test/session-model';
import { hostZone, offsetIn, restore, travel } from '../test/zone';
import { shownOf, type Shown } from './run';
import { layer as sessionLayer, Session, type SessionView } from './service';

const DEVICES = 70;
const STEPS = 16;
const TAUGHT_IDS = ['protection'];

const ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
] as const;

/** Passages over Fear's verses and over the promise. */
const OVER: readonly [Span, ...Span[]] = [
  { book: 19, chapter: 91, first: 1, last: 16 },
  { book: 19, chapter: 121, first: 1, last: 8 },
  { book: 19, chapter: 56, first: 1, last: 4 },
  { book: 23, chapter: 41, first: 10, last: 13 },
];

const PROMISE_TEXT = readPassage();
const words = (text: string) => sourceWords(text).length;
const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: words(PROMISE_TEXT.text),
  group: PROMISE_TEXT.reference,
};
const OWN = [PROMISE];

const CANON: ReadonlySet<string> = new Set(placesOf(CORPUS).keys());

const FEAR = COLLECTIONS.filter((collection) => collection.id === 'protection');
const OTHERS = COLLECTIONS.filter((collection) => collection.id !== 'protection');

const json = <A>(value: A) => JSON.stringify(value);

/** Each Fear verse's phrase references, by verse, by the model's cut. */
const FEAR_PHRASES = new Map(
  piecesModel(CORPUS, [], { tag: 'Read', passages: [] }, TAUGHT_IDS, words, withPhrasesRule).map(
    (piece) => [piece.reference, (piece.phrases ?? []).map((phrase) => phrase.reference)],
  ),
);

/** The device: its disk, Dictation's status, whether the store refuses a recall's write, and the clock's instant. */
interface Device {
  readonly disk: Map<string, string>;
  status: Status;
  refuse: boolean;
  now: number;
}

const refusal = (key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: set ${key}`, method: 'set', key });

const storeOf = (device: Device) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => device.disk.get(key)),
    set: (key, value) =>
      device.refuse && key.startsWith(PREFIX)
        ? Effect.fail(refusal(key))
        : Effect.sync(() => void device.disk.set(key, value)),
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

/** The session teaching Fear, the passages and the garden over the device, as `appLayer` builds them, with Dictation at the device's status. */
const layerOf = (device: Device) =>
  sessionLayer(OWN, collectionsOf(TAUGHT_IDS)).pipe(
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

/** Plants `reference` on `disk` with one to three recalls, the first `back` days before `now`, a few days apart. */
const plant = (
  next: () => number,
  disk: Map<string, string>,
  reference: string,
  now: number,
  back: number,
  zone: string,
) => {
  const count = 1 + below(next, 3);
  for (let n = 0; n < count; n++) {
    const at =
      now - back * DAY + n * Math.floor((back * DAY) / (count + 1)) - below(next, 6) * HOUR;
    const recall = recallOf(next, reference, at, zone);
    disk.set(keyOf(recall), json(recall));
  }
};

/** Fear's verses planted at a share, and a third of them with their phrases planted before. */
const plantFear = (next: () => number, disk: Map<string, string>, now: number, zone: string) => {
  const share = pickOf(next, [0, 0.3, 0.7, 1]);
  for (const range of FEAR[0]?.promises ?? [])
    for (const reference of promiseVerses(range)) {
      if (next() < share) plant(next, disk, reference, now, 1 + below(next, 30), zone);
      if (below(next, 3) > 0) continue;
      for (const phrase of FEAR_PHRASES.get(reference) ?? [])
        plant(next, disk, phrase, now, 31 + below(next, 30), zone);
    }
};

/** A device's first disk: the promise, Fear's verses at a share, other collections' promises whole, sometimes one verse alone, and the passages. */
const diskOf = (next: () => number, now: number, zone: string, tally: Map<string, number>) => {
  const disk = new Map<string, string>();
  const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
  plant(next, disk, PROMISE.reference, now, pickOf(next, [1, 2, 6, 20]), zone);
  plantFear(next, disk, now, zone);
  for (let n = 1 + below(next, 3); n > 0; n--) {
    const collection = OTHERS[below(next, OTHERS.length)] as Collection;
    const multi = collection.promises.filter((range) => range.last > range.first);
    const pool = below(next, 2) === 0 && multi.length > 0 ? multi : collection.promises;
    const range = pool[below(next, pool.length)] as Range;
    for (const reference of promiseVerses(range))
      plant(next, disk, reference, now, 1 + below(next, 30), zone);
  }
  if (below(next, 3) === 0) {
    const longer = COLLECTIONS.flatMap((collection) =>
      collection.promises.filter((range) => range.last > range.first),
    );
    const range = longer[below(next, longer.length)] as Range;
    const [first] = promiseVerses(range);
    if (first !== undefined && plantsOf(disk).get(promiseVerses(range)[1] ?? '') === undefined) {
      plant(next, disk, first, now, 1 + below(next, 30), zone);
      bump('gen:one verse alone');
    }
  }
  const stored: Span[] = [];
  for (let n = below(next, 3); n > 0; n--)
    stored.push(below(next, 2) === 0 ? pickOf(next, [...OVER]) : choosableOf(next, stored)[1]);
  disk.set(KEY, storedText(stored));
  return { disk, stored };
};

/** The model's plan item, as the session's plan shows it. */
const itemText = (item: Pick<ModelItem, 'reference' | 'fresh' | 'recalls'>) => ({
  reference: item.reference,
  fresh: item.fresh,
  recalls: item.recalls,
});

const textOf = (shown: Shown) => (shown._tag === 'Item' ? shown.piece.reference : shown._tag);

const MAKINGS = ['minutes', 'wake', 'add', 'remove'] as const;
type Making = (typeof MAKINGS)[number];

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
  passages: Held;
  pieces: ModelTextPiece[];
  minutes: Minutes = 5;
  plan: readonly ModelItem[];
  visit: ModelVisitVerse[] = [];
  visitGroup = '';
  /** What made the visit: a known promise's tap, or a list's `Practice this list` (whose items keep the plan's `fresh` and pieces). */
  visitFrom: 'promise' | 'list' = 'promise';
  /** Each list visit verse's `fresh`, by reference. */
  visitFresh = new Map<string, boolean>();
  held: string | null = null;

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
    this.passages = { tag: 'Read', passages: stored };
    this.pieces = piecesModel(CORPUS, OWN, this.passages, TAUGHT_IDS, words, withPhrasesRule);
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

  recallsNow(reference: string) {
    return plantsOf(this.device.disk).get(reference)?.length ?? 0;
  }

  modelPlan(): readonly ModelItem[] {
    const plants = plantsOf(this.device.disk);
    return planModel({
      plants,
      pieces: expandRule(this.pieces, plants),
      at: this.device.now,
      offset: offsetIn(this.zone, this.device.now),
      minutes: this.minutes,
    }).items;
  }

  /** The model's shown reference, or `Done`. */
  shownNow() {
    return shownModel(this.held, this.visit, this.plan, (reference) => this.recallsNow(reference));
  }

  /** Whether the visit has a verse not done. */
  visitOpen() {
    return this.visit.some((verse) => this.recallsNow(verse.reference) <= verse.recalls);
  }

  async view() {
    return this.run(this.session.view);
  }

  async shown(view: SessionView) {
    const garden = await this.run(Effect.flatMap(Garden, (each) => each.view));
    if (garden._tag === 'Unread') return null;
    return { shown: shownOf(view, Option.some(garden)), garden };
  }

  checkVisit(step: string, view: SessionView) {
    const visit = view.visit.map((verse) => ({
      reference: verse.item.reference,
      recalls: verse.item.recalls,
    }));
    if (json(visit) !== json(this.visit))
      this.fail(`${step}: visit ${json(visit)}, model ${json(this.visit)}`);
    if (this.visitFrom === 'list') {
      for (const verse of view.visit) {
        if (verse.item.fresh !== this.visitFresh.get(verse.item.reference))
          this.fail(`${step}: list visit verse ${verse.item.reference} fresh ${verse.item.fresh}`);
        if (verse.piece.reference !== verse.item.reference)
          this.fail(`${step}: list visit verse ${verse.item.reference} pieced as another`);
      }
      return;
    }
    for (const verse of view.visit) {
      if (verse.item.fresh) this.fail(`${step}: visit verse ${verse.item.reference} is fresh`);
      if (verse.piece.reference !== verse.item.reference || verse.piece.group !== this.visitGroup)
        this.fail(`${step}: visit verse ${verse.item.reference} pieced as ${verse.piece.group}`);
      const [book, chapter, number] = this.locate(verse.piece.reference);
      const text = versesIn(CORPUS, book, chapter)[number - 1] ?? '';
      if (verse.piece.text !== text || verse.piece.words !== words(text))
        this.fail(`${step}: visit verse ${verse.piece.reference} with another text`);
    }
  }

  /** The book, chapter and verse of a verse of the visit, from the collections' list. */
  locate(reference: string): readonly [number, number, number] {
    for (const collection of COLLECTIONS)
      for (const range of collection.promises) {
        const at = promiseVerses(range).indexOf(reference);
        if (at >= 0) return [range.book, range.chapter, range.first + at];
      }
    return [0, 0, 0];
  }

  async check(step: string) {
    this.trail.push(step);
    const view = await this.view();
    const plan = Option.match(view.plan, {
      onNone: () => null,
      onSome: (made) => made.items.map(itemText),
    });
    if (json(plan) !== json(this.plan.map(itemText)))
      this.fail(`${step}: plan ${json(plan)}, model ${json(this.plan.map(itemText))}`);
    const references = view.pieces.map((piece) => piece.reference);
    if (json(references) !== json(this.pieces.map((piece) => piece.reference)))
      this.fail(`${step}: pieces ${references.length}, model ${this.pieces.length}`);
    const held = Option.match(view.held, { onNone: () => null, onSome: (item) => item.reference });
    if (held !== this.held) this.fail(`${step}: held ${held}, model ${this.held}`);
    this.checkVisit(step, view);
    const seen = await this.shown(view);
    if (seen === null) return this.fail(`${step}: the garden unread`);
    const want = this.shownNow();
    if (textOf(seen.shown) !== want)
      this.fail(`${step}: Today shows ${textOf(seen.shown)}, model ${want}`);
    const plants = plantsOf(this.device.disk);
    for (const verse of this.visitFrom === 'promise' ? view.visit : []) {
      const own = plants.get(verse.item.reference);
      const ladder = own === undefined ? 'full' : referenceCue(own);
      const cue = cueIn(seen.garden, verse.item.reference);
      if (cue !== ladder)
        this.fail(
          `${step}: visit verse ${verse.item.reference} cued ${cue}, its own ladder ${ladder}`,
        );
    }
    if (seen.shown._tag === 'Item' && seen.shown.held !== (this.held !== null))
      this.fail(`${step}: shown held ${seen.shown.held}, model ${this.held}`);
    const counts = Option.match(view.plan, {
      onNone: () => '',
      onSome: (made) => countsOf(made, seen.garden),
    });
    const wantCounts = countsModel(this.plan, (reference) => this.recallsNow(reference));
    if (counts !== wantCounts) this.fail(`${step}: counts ${counts}, model ${wantCounts}`);
  }

  /** The known promises When I need… would list, by the model, each with its card. */
  known() {
    const planted = new Set(plantsOf(this.device.disk).keys());
    return needModel(planted, TAUGHT_IDS).flatMap((card) =>
      card.known.map((range) => ({ card, range })),
    );
  }

  async tapVisit() {
    const known = this.known();
    const multi = known.filter(({ range }) => range.last > range.first);
    const pool = below(this.next, 2) === 0 && multi.length > 0 ? multi : known;
    const chosen = pool[below(this.next, pool.length)];
    if (chosen === undefined) return this.bump('visit:none known');
    const { card, range } = chosen;
    if (this.visitOpen()) this.bump('visit:over open');
    if (this.held !== null) this.bump('visit:over held');
    const verses = promiseVerses(range);
    this.bump(`visit:size ${verses.length}`);
    const open = this.plan.filter((item) => this.recallsNow(item.reference) <= item.recalls);
    if (verses.some((reference) => open.some((item) => item.reference === reference)))
      this.bump('visit:verse in the plan');
    if (verses.some((reference) => this.pieces.every((piece) => piece.reference !== reference)))
      this.bump('visit:verse in no piece');
    if (card.id !== 'protection') this.bump('visit:other collection');
    const planted = plantsOf(this.device.disk);
    if (
      verses.some((verse) =>
        [...planted.keys()].some((key) => verseOfRule(key) === verse && key !== verse),
      )
    )
      this.bump('visit:known verse with phrase plants');
    await this.run(this.session.visit({ id: card.id, title: card.title }, range));
    this.visit = visitModel(range, (reference) => this.recallsNow(reference));
    this.visitGroup = card.title;
    this.visitFrom = 'promise';
    await this.check(`visit(${card.id} ${json(range)})`);
  }

  /** The lists the field shows by the model: the promise's own row, the passages held, then Fear. */
  lists() {
    return fieldPassagesModel(
      [{ title: PROMISE.reference, verses: [PROMISE.reference] }],
      this.passages,
      TAUGHT_IDS,
    );
  }

  /** `Practice this list` on one of the field's lists, or on a few of its verses in any order: the visit becomes what `listStartModel` starts, the plan, the minutes, the hold and the disk unchanged. */
  async tapList() {
    const lists = this.lists();
    const every = lists.flatMap((list) => list.verses);
    const verses =
      below(this.next, 3) === 0
        ? [...every].sort(() => this.next() - 0.5).slice(0, 1 + below(this.next, 4))
        : (pickOf(this.next, lists as [(typeof lists)[number], ...typeof lists]).verses ?? []);
    if (this.visitOpen()) this.bump('list:over open visit');
    if (this.held !== null) this.bump('list:over held');
    const before = json([...this.device.disk]);
    const minutes = this.minutes;
    await this.run(this.session.startList(verses));
    if (json([...this.device.disk]) !== before) this.fail(`startList: the disk changed`);
    const view = await this.view();
    if (view.minutes !== minutes) this.fail(`startList: the minutes ${view.minutes}`);
    const want = listStartModel(
      this.plan,
      verses,
      plantsOf(this.device.disk),
      CANON,
      verseOfRule,
      this.pieces,
    );
    this.bump(`list:${want.tag}`);
    if (want.tag !== 'None') {
      const items = want.tag === 'Open' ? want.items : [want.start.item];
      this.visit = items.map((item) => ({ reference: item.reference, recalls: item.recalls }));
      this.visitFresh = new Map(items.map((item) => [item.reference, item.fresh]));
      this.visitFrom = 'list';
      if (want.tag === 'Open' && items.some((item) => item.fresh)) this.bump('list:open new piece');
      if (
        want.tag === 'Open' &&
        new Set(items.map((item) => verseOfRule(item.reference))).size < items.length
      )
        this.bump('list:open phrases folded');
    }
    await this.check(`startList(${verses.length} verses ${want.tag})`);
  }

  async keep(reference: string, refused: boolean) {
    this.device.now += MINUTE;
    this.device.refuse = refused;
    const recalls = Context.get(this.services, Recalls);
    await this.run(recalls.keep(recallOf(this.next, reference, this.device.now, this.zone)));
    this.device.refuse = false;
    this.device.now += MINUTE;
  }

  /** Say it's hold on the item shown, its recital kept, refused, or left under way. Answers whether a recital is under way. */
  async say(): Promise<boolean> {
    const view = await this.view();
    const seen = await this.shown(view);
    if (seen === null || seen.shown._tag !== 'Item') {
      this.bump('say:done');
      return false;
    }
    const { item } = seen.shown;
    const onVisit =
      this.held === null &&
      this.visit.some((verse) => verse.reference === item.reference) &&
      this.visitOpen();
    await this.run(this.session.hold(item));
    this.held = item.reference;
    const end = pickOf(this.next, ['kept', 'kept', 'kept', 'refused', 'under way'] as const);
    const inPlan = this.plan.some(
      (each) =>
        each.reference === item.reference && this.recallsNow(each.reference) <= each.recalls,
    );
    if (end === 'under way') {
      if (onVisit) this.bump('say:visit under way');
      this.device.status = pickOf<Status>(this.next, ['listening', 'finishing']);
      await this.check(`say(${item.reference}, ${this.device.status})`);
      return true;
    }
    await this.keep(item.reference, end === 'refused');
    if (onVisit) this.bump(`say:visit ${end}`);
    if (onVisit && end === 'kept' && inPlan) this.bump('say:visit verse in the plan');
    await this.check(`say(${item.reference}, ${end})`);
    return false;
  }

  async letGo() {
    if (this.held === null) return;
    const index = this.visit.findIndex((verse) => verse.reference === this.held);
    await this.run(this.session.next);
    this.held = null;
    const shown = this.shownNow();
    const at = this.visit.findIndex((verse) => verse.reference === shown);
    if (index >= 0 && at > index) this.bump('next:visit next verse');
    if (index >= 0 && at < 0 && !this.visitOpen()) this.bump('next:visit through to the plan');
    if (index >= 0 && at === index) this.bump('next:visit stays on its verse');
    await this.check('next');
  }

  /** An add or a remove through the app's own call, against the passages' rules: answers whether it landed, so the plan is made again. */
  async change(kind: 'add' | 'remove') {
    const spans = this.passages.tag === 'Read' ? this.passages.passages : [];
    const added =
      below(this.next, 2) === 0 ? pickOf(this.next, [...OVER]) : choosableOf(this.next, spans)[1];
    const span = kind === 'add' ? added : spans[below(this.next, Math.max(1, spans.length))];
    if (span === undefined) {
      this.bump('make:nothing to remove');
      return false;
    }
    const want =
      kind === 'add'
        ? addRule(CORPUS, this.passages, span, false)
        : removeRule(this.passages, span, false);
    const answer = await this.run(kind === 'add' ? addPassage(span) : removePassage(span));
    if (answer !== want.outcome)
      this.fail(`${kind} ${json(span)}: ${answer}, model ${want.outcome}`);
    const landed = want.outcome === 'Added' || want.outcome === 'Removed';
    if (landed) {
      this.passages = want.held;
      this.pieces = piecesModel(CORPUS, OWN, this.passages, TAUGHT_IDS, words, withPhrasesRule);
    }
    return landed;
  }

  /** The making of `kind` through the session or the app: answers whether a plan was made again. */
  async making(kind: Making, active: boolean) {
    if (kind === 'minutes') {
      const minutes = pickOf<Minutes>(this.next, [...MINUTES]);
      await this.run(this.session.choose(minutes));
      this.minutes = minutes;
      return true;
    }
    if (kind === 'wake') {
      await this.run(this.session.wake);
      return !active;
    }
    return this.change(kind);
  }

  /** A making of `kind`, the hold and the visit kept only while a recital is under way. */
  async make(kind: Making) {
    const active = this.device.status !== 'idle';
    const visiting = this.visit.length > 0 && this.visitOpen();
    const remade = await this.making(kind, active);
    if (remade) {
      this.plan = this.modelPlan();
      if (!active) {
        this.held = null;
        this.visit = [];
      }
    }
    if (visiting && (remade || kind === 'wake'))
      this.bump(
        `make:${kind}:${active ? 'under way' : 'idle'}:visit ${active ? 'kept' : 'dropped'}`,
      );
    await this.check(`${kind}${active ? ' under way' : ''}`);
  }

  /** The recital under way ends, its recall kept in half. */
  async endRecital() {
    const reference = this.held;
    this.device.status = 'idle';
    if (reference !== null && below(this.next, 2) === 0) await this.keep(reference, false);
    await this.check('recital ended');
  }

  async step() {
    if (this.held !== null && below(this.next, 2) === 0) return this.letGo();
    const roll = below(this.next, 23);
    const visiting = this.visitOpen();
    if (roll >= 20) return this.tapList();
    if (roll < 4) return this.tapVisit();
    if (roll < (visiting ? 13 : 9)) {
      const underWay = await this.say();
      if (!underWay) return;
      const during = below(this.next, 6);
      await (during === 0
        ? this.tapVisit()
        : during === 1
          ? this.tapList()
          : this.make(pickOf(this.next, [...MAKINGS])));
      return this.endRecital();
    }
    if (roll < 15) return this.letGo();
    if (roll < 19) return this.make(pickOf(this.next, [...MAKINGS]));
    this.device.now += (1 + below(this.next, 30)) * HOUR;
    this.bump('time passed');
    return this.check('time');
  }
}

const playDevice = async (seed: number, tally: Map<string, number>) => {
  const next = random(seed);
  const zone = pickOf(next, [...ZONES] as [string, ...string[]]);
  travel(zone);
  const now = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24));
  const { disk, stored } = diskOf(next, now, zone, tally);
  const device: Device = { disk, status: 'idle', refuse: false, now };
  const scope = Scope.makeUnsafe();
  const services = await Effect.runPromise(Layer.buildWithScope(layerOf(device), scope));
  const walk = new Walk(seed, next, tally, zone, device, stored, services);
  await walk.run(walk.session.begin);
  await walk.check('begin');
  for (let step = 0; step < STEPS && walk.failures.length === 0; step++) await walk.step();
  await Effect.runPromise(Scope.close(scope, Exit.void));
  return walk.failures;
};

/** Each case the walk must reach, and how many times at least. */
const FLOORS: ReadonlyArray<readonly [string, number]> = [
  ['visit:size 1', 40],
  ['visit:size 2', 50],
  ['visit:size 3', 2],
  ['visit:over open', 35],
  ['visit:over held', 25],
  ['visit:verse in the plan', 20],
  ['visit:verse in no piece', 50],
  ['visit:other collection', 60],
  ['visit:known verse with phrase plants', 5],
  ['say:visit kept', 30],
  ['say:visit refused', 6],
  ['say:visit under way', 14],
  ['say:visit verse in the plan', 4],
  ['next:visit next verse', 9],
  ['next:visit through to the plan', 17],
  ['next:visit stays on its verse', 8],
  ['make:minutes:idle:visit dropped', 9],
  ['make:minutes:under way:visit kept', 4],
  ['make:wake:idle:visit dropped', 4],
  ['make:wake:under way:visit kept', 2],
  ['make:add:idle:visit dropped', 5],
  ['make:add:under way:visit kept', 1],
  ['make:remove:idle:visit dropped', 5],
  ['make:remove:under way:visit kept', 2],
  ['gen:one verse alone', 10],
  ['list:Open', 40],
  ['list:Weakest', 10],
  ['list:Learn', 6],
  ['list:over held', 10],
  ['list:over open visit', 20],
  ['list:open new piece', 5],
  ['list:open phrases folded', 3],
];

/** Plays every device, the host's zone put back once they end, however they end. */
const playAll = (tally: Map<string, number>) => {
  const before = hostZone();
  const play = async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= DEVICES && failures.length === 0; seed++)
      failures.push(...(await playDevice(seed * 7919, tally)));
    return failures;
  };
  return play().finally(() => restore(before));
};

describe('a visit', () => {
  it('shows a known promise’s verses ahead of the plan, each a review from its baseline at the tap, living as the hold lives, over generated devices', async () => {
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
