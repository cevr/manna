/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- the rendered walk plays each generated device's commands one after another through the screen rig's promise-based taps, over a disk in a plain map, and writes expected values as plain branches. */

/**
 * When I need… and a visit as a reader meets them, walked through the
 * root (`test/need-rig.tsx`) over generated devices, the layer teaching
 * Fear. Each device: a day of 2026 at 06:00-21:59 host time; the promise
 * planted 0, 1, 2 or 6 days back (0 is the first minute's day); Fear's
 * verses planted at a share of none, 30 %, 70 % or all; one to three
 * promises of other collections planted whole (half of them of two or
 * three verses) and sometimes one verse alone of a longer one; sometimes
 * `Genesis 1:1`; zero to two held passages over Fear's verses, the
 * promise's or none, or (one in eight) a garbled passages key, which
 * leaves the passages unread; a stored minutes choice in a quarter.
 *
 * Its commands: `When I need…` then a known promise (half of them of more
 * than one verse when one is known) or the bar's `Today`; `Say it`, then
 * `Next` or (three in ten) the result left held; a Minutes tap; the field
 * and back; a relaunch the next morning after 04:00. While a visit is
 * open, half the commands are `Say it`.
 *
 * The oracle, apart from the app's code: after every command Today's
 * reference is `shownModel`'s over the hold, the visit (`visitModel`, each
 * baseline the count at the tap) and the plan (`planModel` at each making
 * over `piecesModel`'s pieces with their phrases, expanded by
 * `phrase-model.ts`'s `expandRule`), its counts line `countsModel`'s over the
 * plan alone, its action `Say it`, `Next` or none, no `Listen` on a review,
 * and `When I need…` exactly with a plan made; When I need…'s cards are
 * `needModel`'s over the disk; the field's rows are titled as
 * `fieldPassagesModel` gives them. Then the disk: no start key changed or
 * gone but the minutes, no key added but a recall of the verse said or
 * the minutes after a tap, the passages key never written. Every frame is
 * held to the rig's screen rules.
 */

import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Range } from '../passages';
import { COLLECTIONS } from '../promises';
import type { Recall } from '../sayit';
import { MINUTES, type Minutes } from '../session';
import { MINUTES_KEY } from '../session/service';
import type { Time } from './clock';
import { below, keyOf, pickOf, PREFIX, random } from './garden-model';
import { launchNeed, type NeedDevice, type NeedLaunch } from './need-rig';
import { KEY, readRule, spanRef, storedText, type Held, type Span } from './passages-model';
import { CORPUS } from './passages-rig';
import {
  fieldPassagesModel,
  needModel,
  piecesModel,
  promiseVerses,
  visitModel,
  type ModelVisitVerse,
} from './promise-model';
import { expandRule, verseOfRule, withPhrasesRule } from './phrase-model';
import { countsModel, DAY, HOUR, MINUTE, planModel, type ModelItem } from './session-model';
import { hostOffset } from './zone';

const TAUGHT_IDS = ['protection'];
const FEAR = COLLECTIONS.find((collection) => collection.id === 'protection');
const OTHERS = COLLECTIONS.filter((collection) => collection.id !== 'protection');
const words = (text: string) => sourceWords(text).length;
const OWN = [
  {
    reference: passage.reference,
    text: passage.text,
    words: words(passage.text),
    group: passage.reference,
  },
];
const OWN_ROW = [{ title: passage.reference, verses: [passage.reference] }];

/** Passages over Fear's verses and over the promise. */
const OVER: readonly [Span, ...Span[]] = [
  { book: 19, chapter: 91, first: 1, last: 16 },
  { book: 19, chapter: 121, first: 1, last: 8 },
  { book: 19, chapter: 56, first: 1, last: 4 },
  { book: 23, chapter: 41, first: 10, last: 13 },
];

const GARBLED = '[{"book":43,"chapter":15,"first":1}]';

export type Coverage = Record<string, number>;

const recallOf = (next: () => number, reference: string, startedAt: number): Recall => ({
  reference,
  startedAt,
  offset: hostOffset(startedAt),
  grade: pickOf(next, [1, 3, 3, 4] as const),
  suggested: 3,
  words: 10,
  missed: 0,
  peeked: 0,
  extra: 0,
});

const plantsOf = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of disk)
    if (key.startsWith(PREFIX)) {
      const recall: Recall = JSON.parse(value);
      plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
    }
  return plants;
};

/** A verse planted before `now`: one or two recalls, the first `back` days before. */
const plant = (
  next: () => number,
  disk: Map<string, string>,
  reference: string,
  now: number,
  back: number,
) => {
  for (let n = 0; n <= below(next, 2); n++) {
    const at = now - back * DAY + n * HOUR - below(next, 3) * HOUR - MINUTE * (1 + below(next, 50));
    const recall = recallOf(next, reference, Math.min(at, now - MINUTE));
    disk.set(keyOf(recall), JSON.stringify(recall));
  }
};

/** Plants on `disk` Fear's verses at a share, one to three promises of other collections whole (half of them of more than one verse), sometimes one verse alone of a longer one, and sometimes `Genesis 1:1`. */
const plantPromises = (next: () => number, disk: Map<string, string>, now: number) => {
  const share = pickOf(next, [0, 0.3, 0.7, 1] as const);
  for (const range of FEAR?.promises ?? [])
    for (const reference of promiseVerses(range))
      if (next() < share) plant(next, disk, reference, now, 1 + below(next, 20));
  for (let n = 1 + below(next, 3); n > 0; n--) {
    const all = OTHERS[below(next, OTHERS.length)]?.promises ?? [];
    const multi = all.filter((range) => range.last > range.first);
    const pool = below(next, 2) === 0 && multi.length > 0 ? multi : all;
    for (const reference of promiseVerses(pool[below(next, pool.length)] as Range))
      plant(next, disk, reference, now, 1 + below(next, 20));
  }
  if (below(next, 3) === 0) {
    const longer = OTHERS.flatMap((collection) =>
      collection.promises.filter((range) => range.last > range.first),
    );
    const [alone] = promiseVerses(longer[below(next, longer.length)] as Range);
    if (alone !== undefined) plant(next, disk, alone, now, 1 + below(next, 20));
  }
  if (below(next, 4) === 0) plant(next, disk, 'Genesis 1:1', now, 1 + below(next, 20));
};

/** Stores on `disk` zero to two passages from `OVER`, none twice. */
const storePassages = (next: () => number, disk: Map<string, string>) => {
  const stored: Span[] = [];
  for (let n = below(next, 3); n > 0; n--) {
    const span = pickOf(next, OVER);
    if (!stored.some((each) => spanRef(each) === spanRef(span))) stored.push(span);
  }
  if (stored.length > 0) disk.set(KEY, storedText(stored));
};

/** One rendered device's walk and its model. */
class Walk {
  readonly device: NeedDevice;
  readonly time: Time;
  readonly start: ReadonlyMap<string, string>;
  readonly held: Held;
  readonly unread: boolean;
  minutes: Minutes = 5;
  plan: readonly ModelItem[] = [];
  visit: readonly ModelVisitVerse[] = [];
  hold: ModelVisitVerse | null = null;
  minutesTapped = false;
  said = new Set<string>();
  rig: NeedLaunch | null = null;
  readonly trail: string[] = [];

  constructor(
    readonly next: () => number,
    readonly cover: Coverage,
  ) {
    const now = new Date(
      2026,
      below(next, 12),
      1 + below(next, 28),
      6 + below(next, 16),
      below(next, 60),
    ).getTime();
    this.time = { now };
    const disk = new Map<string, string>();
    const back = pickOf(next, [0, 1, 2, 6] as const);
    if (back === 0) this.bump('gen:first-minute-day');
    const first = recallOf(next, passage.reference, now - (1 + below(next, 40)) * MINUTE);
    if (back === 0) disk.set(keyOf(first), JSON.stringify(first));
    else plant(next, disk, passage.reference, now, back);
    plantPromises(next, disk, now);
    this.unread = below(next, 8) === 0;
    if (this.unread) {
      this.bump('gen:unread-passages');
      disk.set(KEY, GARBLED);
    } else storePassages(next, disk);
    if (below(next, 4) === 0) {
      this.minutes = pickOf(next, [...MINUTES] as [Minutes, ...Minutes[]]);
      disk.set(MINUTES_KEY, String(this.minutes));
    }
    this.held = readRule(CORPUS, disk.get(KEY), 0);
    this.device = { disk, unread: false };
    this.start = new Map(disk);
  }

  bump(kind: string) {
    this.cover[kind] = (this.cover[kind] ?? 0) + 1;
  }

  /** The launch on screen; every command runs after the first. */
  get launched() {
    return this.rig as NeedLaunch;
  }

  recallsNow = (reference: string) => plantsOf(this.device.disk).get(reference)?.length ?? 0;

  planned() {
    return this.held.tag === 'Read';
  }

  /** The plan made now over the disk, as `planModel` makes it. */
  make() {
    this.visit = [];
    this.hold = null;
    if (!this.planned()) {
      this.plan = [];
      return;
    }
    const pieces = piecesModel(CORPUS, OWN, this.held, TAUGHT_IDS, words, withPhrasesRule);
    const plants = plantsOf(this.device.disk);
    this.plan = planModel({
      plants,
      pieces: expandRule(pieces, plants),
      at: this.time.now ?? 0,
      offset: hostOffset(this.time.now ?? 0),
      minutes: this.minutes,
    }).items;
  }

  /** V2: the verse Today shows, or null in the done state. */
  shown(): ModelVisitVerse | null {
    if (!this.planned()) return { reference: passage.reference, recalls: Infinity };
    if (this.hold !== null) return this.hold;
    const open = (verse: ModelVisitVerse) => this.recallsNow(verse.reference) <= verse.recalls;
    return this.visit.find(open) ?? this.plan.find(open) ?? null;
  }

  fromVisit(verse: ModelVisitVerse) {
    return this.visit.some((each) => each.reference === verse.reference);
  }

  /** What Today must show settled: the reference, counts line, action and the way to When I need…. */
  wantToday() {
    const shown = this.shown();
    const done = shown !== null && this.recallsNow(shown.reference) > shown.recalls;
    return {
      headings: ['Today'],
      references: shown === null ? [] : [shown.reference],
      counts: this.planned() ? [countsModel(this.plan, this.recallsNow)] : [],
      action: shown === null ? null : this.hold !== null && done ? 'Next' : 'Say it',
      need: this.planned(),
    };
  }

  seenToday() {
    const rig = this.launched;
    const names = rig.names();
    return {
      headings: rig.headings(),
      references: rig.references(),
      counts: rig.counts(),
      action: names.includes('Next') ? 'Next' : names.includes('Say it') ? 'Say it' : null,
      need: names.includes('When I need…'),
    };
  }

  async settleToday() {
    const want = JSON.stringify(this.wantToday());
    await this.launched.until(() => JSON.stringify(this.seenToday()) === want);
    const seen = this.seenToday();
    const shown = this.shown();
    if (shown !== null && this.planned()) {
      const fresh = this.plan.some((item) => item.reference === shown.reference && item.fresh);
      if ((!fresh || this.fromVisit(shown)) && this.launched.names().includes('Listen'))
        this.fault('Listen on a review');
    }
    return { seen, want: this.wantToday() };
  }

  fault(what: string) {
    this.launched.faults.push(`${what} after ${this.trail.join(' ')}`);
  }

  /** The disk rule: the start's keys kept but the minutes, added keys only recalls of verses said or the minutes after a tap. */
  diskFaults() {
    const out: string[] = [];
    for (const [key, value] of this.start)
      if (key !== MINUTES_KEY && this.device.disk.get(key) !== value) out.push(`changed ${key}`);
    if (this.device.disk.get(KEY) !== this.start.get(KEY)) out.push('passages written');
    for (const [key, value] of this.device.disk) {
      if (this.start.has(key)) continue;
      if (key === MINUTES_KEY && this.minutesTapped) continue;
      if (key.startsWith(PREFIX) && this.said.has((JSON.parse(value) as Recall).reference))
        continue;
      out.push(`added ${key}`);
    }
    return out;
  }

  async launch() {
    if (this.rig !== null) await this.rig.leave();
    this.rig = await launchNeed(this.device, this.time);
    this.make();
    this.bump('made:launch');
    await this.launched.until(() => this.launched.headings().includes('Today'));
  }

  /** When I need…, its cards against the model, then a known promise or the bar's `Today`. */
  async need(): Promise<unknown> {
    const rig = this.launched;
    if (!(await rig.tap('When I need…'))) return 'no When I need…';
    await rig.until(() => rig.headings().includes('When I need…'));
    this.bump('need:opened');
    const planted = new Set(plantsOf(this.device.disk).keys());
    const cards = needModel(planted, TAUGHT_IDS);
    const want = cards.map((card) => ({
      title: card.title,
      heading: false,
      promises: card.known.map((range) => spanRef(range)),
      toLearn: card.toLearn > 0 ? [`${card.toLearn} still to learn`] : [],
    }));
    const json = JSON.stringify(want);
    await rig.until(() => JSON.stringify(rig.cards()) === json);
    if (JSON.stringify(rig.cards()) !== json)
      return { cards: rig.cards(), want, headings: rig.headings() };
    const fear = cards.find((card) => card.id === 'protection');
    if (fear !== undefined && fear.known.length > 0) this.bump('need:fear-known');
    if (fear !== undefined && fear.known.length === 0) this.bump('need:fear-none-known');
    if (cards.some((card) => card.toLearn > 0)) this.bump('need:to-learn');
    if (cards.some((card) => card.id !== 'protection')) this.bump('need:other-card');
    const known = cards.flatMap((card) => card.known.map((range) => ({ card, range })));
    const multi = known.filter(({ range }) => range.last > range.first);
    const pool = multi.length > 0 && below(this.next, 2) === 0 ? multi : known;
    if (pool.length === 0 || below(this.next, 6) === 0) {
      this.trail.push('need:back');
      this.bump('need:back');
      await rig.tap('Today');
      return null;
    }
    const { card, range } = pool[below(this.next, pool.length)] as (typeof pool)[number];
    this.trail.push(`visit:${spanRef(range)}`);
    if (this.visit.length > 0) this.bump('visit:replaced');
    if (this.hold !== null) this.bump('visit:after-held');
    if (range.last > range.first) this.bump('visit:multi-verse');
    if (card.id !== 'protection') this.bump('visit:other-collection');
    this.bump('visit:started');
    this.visit = visitModel(range, this.recallsNow);
    if (this.visit.some((verse) => this.plan.some((item) => item.reference === verse.reference)))
      this.bump('visit:plan-item');
    await rig.tap(spanRef(range));
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  /** `Say it` on the verse shown, then `Next` or the result left held. */
  async say(): Promise<unknown> {
    const rig = this.launched;
    const shown = this.shown();
    if (shown === null) return null;
    if (this.hold !== null && this.recallsNow(shown.reference) > shown.recalls) {
      this.trail.push('next');
      await rig.tap('Next');
      this.hold = null;
      return null;
    }
    this.trail.push(`say:${shown.reference}`);
    this.time.now = (this.time.now ?? 0) + MINUTE;
    const before = this.recallsNow(shown.reference);
    const visiting = this.planned() && this.fromVisit(shown);
    this.said.add(shown.reference);
    if (!(await rig.tap('Say it'))) return 'no Say it';
    if (!this.planned()) {
      await rig.until(() => this.recallsNow(shown.reference) > before);
      return null;
    }
    this.hold = shown;
    await rig.until(() => rig.has('Next'));
    if (this.recallsNow(shown.reference) !== before + 1)
      return { said: shown.reference, before, after: this.recallsNow(shown.reference) };
    this.bump('today:said');
    if (visiting) this.bump('visit:said');
    const verse = verseOfRule(shown.reference);
    if (FEAR?.promises.some((range) => promiseVerses(range).includes(verse)))
      this.bump(verse === shown.reference ? 'today:shown-fear' : 'today:shown-fear-phrase');
    if (below(this.next, 10) < 3) {
      this.bump('today:held');
      return null;
    }
    this.trail.push('next');
    await rig.tap('Next');
    this.hold = null;
    const after = this.shown();
    if (visiting && after !== null && this.fromVisit(after)) this.bump('visit:next-verse');
    return null;
  }

  async minutesTap(): Promise<unknown> {
    const others = MINUTES.filter((each) => each !== this.minutes);
    const minutes = pickOf(this.next, others as unknown as [Minutes, ...Minutes[]]);
    this.trail.push(`minutes:${minutes}`);
    if (!(await this.launched.tap(`${minutes} min`))) return 'no Minutes';
    this.minutes = minutes;
    this.minutesTapped = true;
    if (this.visit.length > 0) this.bump('visit:dropped-by-making');
    this.bump('made:minutes');
    this.make();
    return null;
  }

  async field(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('field');
    if (!(await rig.tap('Your field'))) return 'no Your field';
    await rig.until(() => rig.headings().includes('Your field'));
    const want = fieldPassagesModel(OWN_ROW, this.held, TAUGHT_IDS).map((row) => row.title);
    const titles = () =>
      [...rig.host.querySelectorAll('[data-testid="row-title"]')].map((node) => node.textContent);
    await rig.until(() => titles().length >= want.length);
    const seen = titles().slice(0, want.length);
    if (JSON.stringify(seen) !== JSON.stringify(want)) return { rows: seen, want };
    this.bump('field:opened');
    if (this.visit.length > 0) this.bump('visit:kept-over-field');
    await rig.tap('Today');
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  async relaunch() {
    const now = this.time.now ?? 0;
    const morning = new Date(now);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(4, 1 + below(this.next, 59), 0, 0);
    this.time.now = morning.getTime() + below(this.next, 10) * HOUR;
    this.trail.push('relaunch');
    if (this.visit.length > 0) this.bump('visit:dropped-by-relaunch');
    this.bump('day:next-morning');
    await this.launch();
    return null;
  }

  /** One generated command; a visit open makes half of them `Say it`. */
  async step(): Promise<unknown> {
    const open = this.visit.some((verse) => this.recallsNow(verse.reference) <= verse.recalls);
    if (open && below(this.next, 2) === 0) return this.say();
    const roll = below(this.next, 20);
    if (!this.planned()) return roll < 10 ? this.say() : this.minutesTap();
    if (roll < 7) return this.need();
    if (roll < 13) return this.say();
    if (roll < 15) return this.minutesTap();
    if (roll < 18) return this.field();
    return this.relaunch();
  }
}

/** Walks the listed generated devices of `seed` (device `n` is `random(seed * 1000 + n)`), `steps` commands each; answers the first failure (none when all held) and the coverage. */
export const walkNeed = async (seed: number, devices: ReadonlyArray<number>, steps: number) => {
  const cover: Coverage = {};
  for (const n of devices) {
    const walk = new Walk(random(seed * 1000 + n), cover);
    await walk.launch();
    const first = await walk.settleToday();
    if (JSON.stringify(first.seen) !== JSON.stringify(first.want))
      return { failure: { device: n, at: 'launch', ...first }, cover };
    for (let s = 0; s < steps; s++) {
      const wrong = await walk.step();
      if (wrong !== null) return { failure: { device: n, trail: walk.trail, wrong }, cover };
      const today = await walk.settleToday();
      const disk = walk.diskFaults();
      if (JSON.stringify(today.seen) !== JSON.stringify(today.want) || disk.length > 0)
        return { failure: { device: n, trail: walk.trail, ...today, disk }, cover };
    }
    const faults = [...walk.launched.faults];
    await walk.launched.leave();
    if (faults.length > 0) return { failure: { device: n, faults }, cover };
  }
  return { failure: null, cover };
};
