/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the walk plays each generated device's steps one after another through promise-run calls, over a disk in a plain map, switches the host's zone through `process.env.TZ` and puts it back, writes expected values as plain branches, and compares values as JSON text. */

/**
 * Start here (hshomebase H4) at the session seam: generated devices, each
 * the promise planted days back, the Fear collection's verses planted at a
 * share with phrase plants, other collections' promises planted whole,
 * zero to two held passages, and in a quarter a join made ready (every
 * piece before the first verse in phrases planted, its phrases ripe), in
 * five zones, the session teaching Fear. Each device walks generated
 * steps: `start` on a verse drawn from one of the spec's classes, Say it's
 * hold on the item shown (kept, refused or left under way), `Next`, a
 * Minutes tap, a return, a landed add or remove (each with or without a
 * recital under way), a tap on a known promise, or time passing.
 *
 * After every step the session is held to the models apart from it: the
 * plan to `planModel`, the hold, the visit to `startModel` (or
 * `visitModel` after a promise's tap) with each verse's piece (the phrase's
 * own for a phrase item, the corpus text grouped by the verse for a verse
 * in no piece), what `shownOf` shows to `shownModel`, the counts line to
 * `countsModel`, and the disk byte for byte the same across every start.
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
import { countsOf, MINUTES, type Minutes, type TextPiece } from '../session';
import { shownOf, type Shown } from '../session/run';
import { layer as sessionLayer, Session, type SessionView } from '../session/service';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
import { placesOf } from '../test/home-model';
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
import {
  joinCueRule,
  phraseOfRule,
  pieceRule,
  verseOfRule,
  expandRule,
  withPhrasesRule,
} from '../test/phrase-model';
import {
  needModel,
  piecesModel,
  promiseVerses,
  shownModel,
  startModel,
  visitModel,
} from '../test/promise-model';
import {
  countsModel,
  DAY,
  estimate,
  HOUR,
  MINUTE,
  planModel,
  type ModelItem,
} from '../test/session-model';
import { hostZone, offsetIn, restore, travel } from '../test/zone';

const DEVICES = 60;
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

const FEAR = COLLECTIONS.filter((collection) => collection.id === 'protection');
const OTHERS = COLLECTIONS.filter((collection) => collection.id !== 'protection');

/** Every verse of the canon, by reference, as the model writes them. */
const PLACES = placesOf(CORPUS);
const CANON: ReadonlySet<string> = new Set(PLACES.keys());

/** Texts that are no verse at all. */
const UNKNOWN = ['', 'Done', 'Unplanned', 'verse', 'Heartseed 1:1', 'Psalms 151:1', 'Psalms 23:0'];

const json = <A>(value: A) => JSON.stringify(value);

/** Each Fear verse's phrase references, by verse, by the model's cut. */
const FEAR_PHRASES = new Map(
  piecesModel(CORPUS, [], { tag: 'Read', passages: [] }, TAUGHT_IDS, words, withPhrasesRule).map(
    (piece) => [piece.reference, (piece.phrases ?? []).map((phrase) => phrase.reference)],
  ),
);

/** The device: its disk, Dictation's status, whether the store refuses a recall's write or fails every list of its keys, and the clock's instant. */
interface Device {
  readonly disk: Map<string, string>;
  status: Status;
  refuse: boolean;
  failKeys: boolean;
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
    keys: device.failKeys
      ? Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'test: keys', method: 'keys', key: '' }),
        )
      : Effect.sync(() => [...device.disk.keys()]),
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

const recallOf = (
  next: () => number,
  reference: string,
  startedAt: number,
  zone: string,
  clean = false,
) =>
  ({
    reference,
    startedAt,
    offset: offsetIn(zone, startedAt),
    grade: clean ? 3 : pickOf<Grade>(next, [1, 3, 3, 4]),
    suggested: pickOf<Recall['suggested']>(next, [1, 2, 3]),
    words: 1 + below(next, 40),
    missed: below(next, 3),
    peeked: clean ? 0 : below(next, 2),
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

/** The disk as text, its keys in order, for a byte-for-byte comparison. */
const diskText = (disk: ReadonlyMap<string, string>) =>
  json([...disk].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

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

/** Three clean recalls days apart, so the plant is at an ear or full corn: a ripe phrase. */
const plantRipe = (
  next: () => number,
  disk: Map<string, string>,
  reference: string,
  now: number,
  zone: string,
) => {
  const back = 12 + below(next, 8);
  for (const day of [back, back - 4, back - 9]) {
    const recall = recallOf(next, reference, now - day * DAY, zone, true);
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

/** A join made ready: every piece before the first verse in phrases planted whole, and that verse's phrases ripe with the verse itself not planted. */
const readyJoin = (
  next: () => number,
  disk: Map<string, string>,
  stored: readonly Span[],
  now: number,
  zone: string,
) => {
  const pieces = piecesModel(
    CORPUS,
    OWN,
    { tag: 'Read', passages: stored },
    TAUGHT_IDS,
    words,
    withPhrasesRule,
  );
  for (const piece of pieces) {
    const planted = plantsOf(disk);
    if ((piece.phrases ?? []).length > 0 && !planted.has(piece.reference)) {
      for (const phrase of piece.phrases ?? []) {
        for (const key of [...disk.keys()])
          if (key.startsWith(`${PREFIX}${phrase.reference}/`)) disk.delete(key);
        plantRipe(next, disk, phrase.reference, now, zone);
      }
      return true;
    }
    if (!planted.has(piece.reference))
      plant(next, disk, piece.reference, now, 1 + below(next, 30), zone);
  }
  return false;
};

/** A device's first disk: the promise, Fear's verses at a share, other collections' promises whole, the passages, and in a quarter a join made ready. */
const diskOf = (next: () => number, now: number, zone: string, tally: Map<string, number>) => {
  const disk = new Map<string, string>();
  plant(next, disk, PROMISE.reference, now, pickOf(next, [1, 2, 6, 20]), zone);
  plantFear(next, disk, now, zone);
  for (let n = 1 + below(next, 3); n > 0; n--) {
    const collection = OTHERS[below(next, OTHERS.length)] as Collection;
    const range = collection.promises[below(next, collection.promises.length)] as Range;
    for (const reference of promiseVerses(range))
      plant(next, disk, reference, now, 1 + below(next, 30), zone);
  }
  const stored: Span[] = [];
  for (let n = below(next, 3); n > 0; n--)
    stored.push(below(next, 2) === 0 ? pickOf(next, [...OVER]) : choosableOf(next, stored)[1]);
  disk.set(KEY, storedText(stored));
  if (below(next, 2) === 0 && readyJoin(next, disk, stored, now, zone))
    tally.set('gen:join ready', (tally.get('gen:join ready') ?? 0) + 1);
  return { disk, stored };
};

/** The model's plan item, as the session's plan shows it. */
const itemText = (item: Pick<ModelItem, 'reference' | 'fresh' | 'recalls'>) => ({
  reference: item.reference,
  fresh: item.fresh,
  recalls: item.recalls,
});

/** A visit's verse as the model holds it: its item and its piece. */
interface VisitEntry {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
  readonly piece: {
    readonly reference: string;
    readonly text: string;
    readonly words: number;
    readonly group: string;
  };
}

const pieceText = (piece: VisitEntry['piece']) => ({
  reference: piece.reference,
  text: piece.text,
  words: piece.words,
  group: piece.group,
});

/** A visit as a failure prints it: each text by its length, so no verse's words reach a log. */
const visitText = (visit: readonly { readonly piece: { readonly text: string } }[]) =>
  json(
    visit.map((verse) => ({ ...verse, piece: { ...verse.piece, text: verse.piece.text.length } })),
  );

const textOf = (shown: Shown) => (shown._tag === 'Item' ? shown.piece.reference : shown._tag);

const MAKINGS = ['minutes', 'wake', 'add', 'remove'] as const;
type Making = (typeof MAKINGS)[number];

/** The verse classes a start draws from, each a coverage floor. */
const CLASSES = [
  'review open',
  'new piece',
  'phrase open',
  'join open',
  'planted done',
  'planted not in plan',
  'planted in no piece',
  'unplanted in pieces',
  'phrase plants only',
  'phrase reference',
  'near-miss',
  'unknown',
] as const;
type VerseClass = (typeof CLASSES)[number];

/** The classes a plan holds only for a while (the new piece until a planting, an open item until its recital), drawn first in half the starts. */
const RARE: readonly VerseClass[] = ['new piece', 'join open', 'planted done'];

/** Near-misses of a verse reference: none is a canon reference. */
const nearMisses = (verse: string): string[] => [
  `${verse} `,
  ` ${verse}`,
  verse.toLowerCase(),
  verse.replace(' ', '  '),
  verse.replace('Psalms', 'Psalm'),
  verse.replace(':', ': '),
  `${verse}:1`,
];

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
  visit: VisitEntry[] = [];
  fromStart = false;
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
      fresh: verse.item.fresh,
      recalls: verse.item.recalls,
      seconds: verse.item.seconds,
      piece: pieceText(verse.piece),
    }));
    const want = this.visit.map((verse) => ({ ...verse, piece: pieceText(verse.piece) }));
    if (json(visit) !== json(want))
      this.fail(`${step}: visit ${visitText(visit)}, model ${visitText(want)}`);
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
    for (const verse of view.visit) {
      const ladder = joinCueRule(plants, verse.item.reference);
      const cue = cueIn(seen.garden, verse.item.reference);
      if (cue !== ladder)
        this.fail(`${step}: visit verse ${verse.item.reference} cued ${cue}, the model ${ladder}`);
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

  /** The plan's items not done, by the model. */
  open() {
    return this.plan.filter((item) => this.recallsNow(item.reference) <= item.recalls);
  }

  /** Each verse class's verses now, by the model. */
  classes(): Map<VerseClass, string[]> {
    const plants = plantsOf(this.device.disk);
    const open = this.open();
    const openOn = (verse: string) => open.some((item) => verseOfRule(item.reference) === verse);
    const inPlan = (verse: string) =>
      this.plan.some((item) => verseOfRule(item.reference) === verse);
    const pieceRefs = new Set(this.pieces.map((piece) => piece.reference));
    const plantedVerses = [...plants.keys()].filter((key) => CANON.has(key));
    const phraseKeys = [...plants.keys()].filter((key) => phraseOfRule(key) !== undefined);
    const withPhrases = (reference: string) =>
      (pieceRule(this.pieces, reference)?.phrases ?? []).length > 0;
    const firstOpen = (verse: string) => open.find((item) => verseOfRule(item.reference) === verse);
    const out = new Map<VerseClass, string[]>();
    out.set(
      'review open',
      open
        .filter((item) => !item.fresh && verseOfRule(item.reference) === item.reference)
        .map((item) => item.reference)
        .filter((verse) => firstOpen(verse)?.reference === verse),
    );
    out.set(
      'new piece',
      open
        .filter((item) => item.fresh && verseOfRule(item.reference) === item.reference)
        .map((item) => item.reference)
        .filter((verse) => firstOpen(verse)?.reference === verse),
    );
    out.set(
      'phrase open',
      open
        .filter((item) => verseOfRule(item.reference) !== item.reference)
        .map((item) => verseOfRule(item.reference))
        .filter((verse) => firstOpen(verse)?.reference !== verse),
    );
    out.set(
      'join open',
      open
        .filter((item) => withPhrases(item.reference) && !plants.has(item.reference))
        .map((item) => item.reference)
        .filter((verse) => firstOpen(verse)?.reference === verse),
    );
    out.set(
      'planted done',
      plantedVerses.filter(
        (verse) =>
          !openOn(verse) &&
          this.plan.some(
            (item) => item.reference === verse && this.recallsNow(verse) > item.recalls,
          ),
      ),
    );
    out.set(
      'planted not in plan',
      plantedVerses.filter((verse) => !inPlan(verse)),
    );
    out.set(
      'planted in no piece',
      plantedVerses.filter((verse) => !pieceRefs.has(verse) && !openOn(verse)),
    );
    out.set(
      'unplanted in pieces',
      [...pieceRefs].filter((verse) => !plants.has(verse) && !openOn(verse)),
    );
    out.set('phrase plants only', [
      ...new Set(
        phraseKeys
          .map((key) => verseOfRule(key))
          .filter((verse) => !plants.has(verse) && !openOn(verse)),
      ),
    ]);
    out.set('phrase reference', [...phraseKeys, ...[...FEAR_PHRASES.values()].flat().slice(0, 4)]);
    out.set(
      'near-miss',
      [PROMISE.reference, ...plantedVerses.slice(0, 3)]
        .flatMap(nearMisses)
        .filter((miss) => !CANON.has(miss) && !plants.has(miss)),
    );
    out.set('unknown', UNKNOWN);
    return out;
  }

  /** The piece the model expects for a start: a plan item's own piece, else the verse's piece, else its corpus text grouped by itself. */
  startPiece(reference: string): VisitEntry['piece'] {
    const piece = pieceRule(this.pieces, reference);
    if (piece !== undefined) return piece;
    const place = PLACES.get(reference);
    const text =
      place === undefined
        ? ''
        : (versesIn(CORPUS, place.book, place.chapter)[place.verse - 1] ?? '');
    return { reference, text, words: words(text), group: reference };
  }

  async start() {
    const classes = [...this.classes()].filter(([, verses]) => verses.length > 0);
    const rare = classes.filter(([kind]) => RARE.includes(kind));
    const pool = rare.length > 0 && below(this.next, 2) === 0 ? rare : classes;
    const chosen = pool[below(this.next, pool.length)];
    if (chosen === undefined) return;
    const [kind, verses] = chosen;
    const verse = verses[below(this.next, verses.length)] ?? '';
    this.bump(`start:${kind}`);
    if (this.held !== null) this.bump('start:over held');
    if (this.visitOpen()) this.bump('start:over open visit');
    const before = diskText(this.device.disk);
    await this.run(this.session.start(verse));
    if (diskText(this.device.disk) !== before) this.fail(`start(${json(verse)}): the disk changed`);
    const started = startModel(
      this.plan,
      verse,
      (reference) => this.recallsNow(reference),
      CANON,
      verseOfRule,
    );
    if (started !== null) {
      const piece = this.startPiece(started.item.reference);
      this.visit = [
        {
          ...itemText(started.item),
          seconds: started.from === 'plan' ? this.planSeconds(started.item) : estimate(piece.words),
          piece,
        },
      ];
      this.fromStart = true;
      this.bump(`start:from ${started.from}`);
    } else this.bump('start:none');
    await this.check(`start(${json(verse)} ${kind})`);
  }

  planSeconds(item: Pick<ModelItem, 'reference'>) {
    return this.plan.find((each) => each.reference === item.reference)?.seconds ?? 0;
  }

  /** The known promises When I need… would list, by the model, each with its card. */
  known() {
    const planted = new Set(plantsOf(this.device.disk).keys());
    return needModel(planted, TAUGHT_IDS).flatMap((card) =>
      card.known.map((range) => ({ card, range })),
    );
  }

  /** The book, chapter and verse of a promise's verse, from the collections' list. */
  locate(reference: string): readonly [number, number, number] {
    for (const collection of COLLECTIONS)
      for (const range of collection.promises) {
        const at = promiseVerses(range).indexOf(reference);
        if (at >= 0) return [range.book, range.chapter, range.first + at];
      }
    return [0, 0, 0];
  }

  async tapVisit() {
    const known = this.known();
    const chosen = known[below(this.next, known.length)];
    if (chosen === undefined) return this.bump('visit:none known');
    const { card, range } = chosen;
    await this.run(this.session.visit({ id: card.id, title: card.title }, range));
    this.visit = visitModel(range, (reference) => this.recallsNow(reference)).map((verse) => {
      const [book, chapter, number] = this.locate(verse.reference);
      const text = versesIn(CORPUS, book, chapter)[number - 1] ?? '';
      return {
        reference: verse.reference,
        fresh: false,
        recalls: verse.recalls,
        seconds: estimate(words(text)),
        piece: { reference: verse.reference, text, words: words(text), group: card.title },
      };
    });
    this.fromStart = false;
    this.bump('visit');
    await this.check(`visit(${card.id} ${json(range)})`);
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
    const onStart =
      this.held === null &&
      this.fromStart &&
      this.visit.some((verse) => verse.reference === item.reference);
    await this.run(this.session.hold(item));
    this.held = item.reference;
    const end = pickOf(this.next, ['kept', 'kept', 'kept', 'refused', 'under way'] as const);
    if (onStart) this.bump(`say:started ${end}`);
    if (end === 'under way') {
      this.device.status = pickOf<Status>(this.next, ['listening', 'finishing']);
      await this.check(`say(${item.reference}, ${this.device.status})`);
      return true;
    }
    await this.keep(item.reference, end === 'refused');
    await this.check(`say(${item.reference}, ${end})`);
    return false;
  }

  async letGo() {
    if (this.held === null) return;
    await this.run(this.session.next);
    this.held = null;
    await this.check('next');
  }

  /** An add or a remove through the app's own call, against the passages' rules: answers whether it landed, so the plan is made again. */
  async change(kind: 'add' | 'remove') {
    const spans = this.passages.tag === 'Read' ? this.passages.passages : [];
    const added =
      below(this.next, 2) === 0 ? pickOf(this.next, [...OVER]) : choosableOf(this.next, spans)[1];
    const span = kind === 'add' ? added : spans[below(this.next, Math.max(1, spans.length))];
    if (span === undefined) return false;
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
    const started = this.fromStart && this.visit.length > 0;
    const remade = await this.making(kind, active);
    if (remade) {
      this.plan = this.modelPlan();
      if (!active) {
        this.held = null;
        this.visit = [];
      }
    }
    if (started && remade)
      this.bump(`make:after start:${active ? 'under way:kept' : 'idle:dropped'}`);
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
    if (this.held !== null && below(this.next, 3) === 0) return this.letGo();
    const roll = below(this.next, 20);
    if (roll < 8) return this.start();
    if (roll < 13) {
      const underWay = await this.say();
      if (!underWay) return;
      const then = below(this.next, 3);
      if (then === 0) await this.start();
      else if (then === 1) await this.tapVisit();
      await this.make(pickOf(this.next, [...MAKINGS]));
      return this.endRecital();
    }
    if (roll < 14) return this.tapVisit();
    if (roll < 15) return this.letGo();
    if (roll < 19) return this.make(pickOf(this.next, [...MAKINGS]));
    this.device.now += (1 + below(this.next, 30)) * HOUR;
    this.bump('time passed');
    return this.check('time');
  }
}

const deviceOf = (next: () => number, tally: Map<string, number>) => {
  const zone = pickOf(next, [...ZONES] as [string, ...string[]]);
  travel(zone);
  const now = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24));
  const { disk, stored } = diskOf(next, now, zone, tally);
  const device: Device = { disk, status: 'idle', refuse: false, failKeys: false, now };
  return { zone, stored, device };
};

const playDevice = async (seed: number, tally: Map<string, number>) => {
  const next = random(seed);
  const { zone, stored, device } = deviceOf(next, tally);
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
  ...CLASSES.map((kind) => [`start:${kind}`, 5] as const),
  ['start:over held', 5],
  ['start:over open visit', 5],
  ['start:from plan', 20],
  ['start:from plant', 20],
  ['start:none', 20],
  ['make:after start:under way:kept', 5],
  ['make:after start:idle:dropped', 5],
  ['say:started kept', 10],
  ['visit', 10],
  ['gen:join ready', 5],
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

/** A launch of a generated device, its session built over it; `begin` is the caller's. */
const launch = async (seed: number, failKeys: boolean) => {
  const before = hostZone();
  const next = random(seed);
  const { device } = deviceOf(next, new Map());
  device.failKeys = failKeys;
  const scope = Scope.makeUnsafe();
  const services = await Effect.runPromise(Layer.buildWithScope(layerOf(device), scope));
  const run = <A>(effect: Effect.Effect<A, never, Session | Garden>) =>
    Effect.runPromise(Effect.provideContext(effect, services));
  const session = Context.get(services, Session);
  const close = () =>
    Effect.runPromise(Scope.close(scope, Exit.void)).finally(() => restore(before));
  return { device, run, session, close };
};

/** A view as JSON text, each piece's text by its length and hash, so a failure prints no verse's words. */
const briefOf = (view: SessionView) => {
  const textless = (piece: TextPiece): TextPiece => ({
    ...piece,
    text: `${piece.text.length}#${Bun.hash(piece.text).toString(36)}`,
    phrases: piece.phrases?.map(textless),
  });
  return json({
    ...view,
    pieces: view.pieces.map(textless),
    heldPiece: Option.map(view.heldPiece, textless),
    visit: view.visit.map((verse) => ({ item: verse.item, piece: textless(verse.piece) })),
  });
};

/** Every verse a start may name on `disk`: its planted keys and the near-misses of the promise. */
const startsOn = (disk: ReadonlyMap<string, string>) => [
  ...plantsOf(disk).keys(),
  ...nearMisses(PROMISE.reference),
  ...UNKNOWN,
];

/** A launch of device `seed` (its key list failing when `failKeys`), begun when `begins`, then a start on every verse it may name: its garden's tag, and the view and the disk before and after the starts. */
const startsEvery = async (seed: number, failKeys: boolean, begins: boolean) => {
  const { device, run, session, close } = await launch(seed, failKeys);
  const seen = async () => {
    const garden = (await run(Effect.flatMap(Garden, (each) => each.settled)))._tag;
    if (begins) await run(session.begin);
    const before = { view: briefOf(await run(session.view)), disk: diskText(device.disk) };
    for (const verse of startsOn(device.disk)) await run(session.start(verse));
    const after = { view: briefOf(await run(session.view)), disk: diskText(device.disk) };
    return { garden, before, after };
  };
  return seen().finally(close);
};

describe('Start here', () => {
  it('starts the plan’s open item on the verse as planned, else a review of the planted verse, as the visit, keeping the hold, the plan and the disk, over generated devices', async () => {
    const tally = new Map<string, number>();
    const failures = await playAll(tally);
    expect(failures.slice(0, 2)).toEqual([]);
    console.log(`coverage ${FLOORS.map(([kind]) => `${kind}=${tally.get(kind) ?? 0}`).join(' ')}`);
    const short = FLOORS.filter(([kind, floor]) => (tally.get(kind) ?? 0) < floor).map(
      ([kind, floor]) => `${kind} ${tally.get(kind) ?? 0} < ${floor}`,
    );
    expect(short).toEqual([]);
  });

  it('starts nothing before the first plan', async () => {
    const seen = await startsEvery(17, false, false);
    expect(seen.garden).toBe('Read');
    expect(seen.after).toEqual(seen.before);
  });

  it('starts nothing over a garden whose read failed three times', async () => {
    const seen = await startsEvery(23, true, true);
    expect(seen.garden).toBe('Unread');
    expect(seen.after).toEqual(seen.before);
  });
});
