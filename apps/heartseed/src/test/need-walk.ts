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
 * A device of the unread class (`garden: 'unread'`, the same draws) fails
 * every listing, so its garden is never read.
 *
 * The walk keeps the screen the root shows, `home`, `today` or `need`, and
 * draws each command from those that screen offers:
 * - on home (where every launch on a read garden lands): `When I need…`
 *   with a plan made, `Begin` exactly when the model shows a verse, a
 *   relaunch the next morning after 04:00, a minutes choice in the Settings
 *   sheet (`minutesTap`: the plan made at the radio's tap, then `Begin`
 *   when the model shows a verse);
 * - on Today: `Say it`, then `Next` or (three in ten) the result left held;
 *   a minutes choice (on a read garden `Your field` to home, then the
 *   sheet as on home; on an unread one the check that Today offers no
 *   `Settings` and no `<n> min`); `Your field` (none on an unread garden);
 *   a relaunch. While a visit is open, half the commands are `Say it`;
 * - on When I need…: a known promise (half of them of more than one verse
 *   when one is known), or the bar's `Your field`.
 *
 * The oracle, apart from the app's code, on the screen the model names
 * after every command:
 * - Today: its reference is `shownModel`'s over the hold, the visit
 *   (`visitModel`, each baseline the count at the tap) and the plan
 *   (`planModel` at each making over `piecesModel`'s pieces with their
 *   phrases, expanded by `phrase-model.ts`'s `expandRule`), its counts line
 *   `countsModel`'s over the plan alone, its action `Say it`, `Next` or
 *   none, no `Listen` on a review, no `When I need…`, and `Your field`
 *   exactly on a read garden; at the end of a run (the visit's verses then
 *   the plan's items all said, none held) the heading `The field is
 *   tended` over no counts line, the line of what grew and each grown
 *   verse's name by `tendedModel` over the visit then the plan, tallied
 *   `end:none`, `end:one` or `end:many`, and `end:visit` when the run held
 *   a visit;
 * - home: the counts line with a plan made, `Begin` exactly with a verse
 *   shown (over unread passages the app's own, rq1 (a)), `When I need…`
 *   exactly with a plan made; the rows titled as `fieldPassagesModel`
 *   gives them after `Your field`;
 * - When I need…: its cards `needModel`'s over the disk.
 *
 * Then the disk: no start key changed or gone but the minutes, no key
 * added but a recall of the verse said or the minutes after a tap, the
 * passages key never written. Every frame is held to the rig's screen
 * rules and the root's frame rule.
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
import { END } from './root-rule';
import { grewLine, tendedModel } from './run-model';
import { countsModel, DAY, HOUR, MINUTE, planModel, type ModelItem } from './session-model';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from './settings-rig';
import { hostOffset } from './zone';

export const TAUGHT_IDS = ['protection'];
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
export const OWN_ROW = [{ title: passage.reference, verses: [passage.reference] }];

/** Passages over Fear's verses and over the promise. */
const OVER: readonly [Span, ...Span[]] = [
  { book: 19, chapter: 91, first: 1, last: 16 },
  { book: 19, chapter: 121, first: 1, last: 8 },
  { book: 19, chapter: 56, first: 1, last: 4 },
  { book: 23, chapter: 41, first: 10, last: 13 },
];

const GARBLED = '[{"book":43,"chapter":15,"first":1}]';

export type Coverage = Record<string, number>;

/** The screen the root shows, as the walk's model names it. */
export type Screen = 'home' | 'today' | 'need';

const NEED = 'When I need…';

/** A screen settled: what it shows and what the walk's model wants of it, compared as JSON. */
export interface Settled {
  readonly seen: unknown;
  readonly want: unknown;
}

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

export const plantsOf = (disk: ReadonlyMap<string, string>) => {
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
export class Walk {
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
  screen: Screen = 'home';
  readonly trail: string[] = [];

  constructor(
    readonly next: () => number,
    readonly cover: Coverage,
    garden: 'read' | 'unread' = 'read',
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
    this.device = { disk, unread: garden === 'unread' };
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

  /** Whether this launch makes a plan: the garden and the passages read. */
  planned() {
    return !this.device.unread && this.held.tag === 'Read';
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
      at: this.time.now,
      offset: hostOffset(this.time.now),
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

  /** H9: the end of the run (the visit, then the plan) by `tendedModel` over the disk's recalls, asked only at a done state of a made plan; none elsewhere. */
  tendedNow() {
    if (!this.planned() || this.shown() !== null) return null;
    const records = [...plantsOf(this.device.disk).values()].flat();
    return tendedModel({ plan: this.plan, hold: this.hold }, this.visit, records);
  }

  /** What Today must show settled: the reference, counts line, action, no way to When I need…, and the back `Your field` on a read garden; at the end of a run (`tended`, from `tendedNow`) the heading `The field is tended` over no counts line, the line of what grew and each grown verse's name. */
  wantToday(tended: ReturnType<Walk['tendedNow']> = this.tendedNow()) {
    const shown = this.shown();
    const done = shown !== null && this.recallsNow(shown.reference) > shown.recalls;
    return {
      headings: [tended === null ? 'Today' : END],
      references: shown === null ? [] : [shown.reference],
      counts: this.planned() && tended === null ? [countsModel(this.plan, this.recallsNow)] : [],
      grew: tended === null ? [] : [grewLine(tended.length)],
      grown: tended === null ? [] : tended.map((each) => `${each.reference}, ${each.stage}`),
      action: shown === null ? null : this.hold !== null && done ? 'Next' : 'Say it',
      need: false,
      field: !this.device.unread,
    };
  }

  seenToday() {
    const rig = this.launched;
    const names = rig.names();
    return {
      headings: rig.headings(),
      references: rig.references(),
      counts: rig.counts(),
      grew: rig.grew(),
      grown: rig.grown(),
      action: names.includes('Next') ? 'Next' : names.includes('Say it') ? 'Say it' : null,
      need: names.includes(NEED),
      field: names.includes('Your field'),
    };
  }

  /** R3: home offers `Begin` exactly when the model shows a verse. */
  offersBegin() {
    return this.shown() !== null;
  }

  /** What home must show settled: its counts line with a plan made, `Begin` and `When I need…`. */
  wantHome() {
    return {
      headings: ['Your field'],
      counts: this.planned() ? [countsModel(this.plan, this.recallsNow)] : [],
      begin: this.offersBegin(),
      need: this.planned(),
    };
  }

  seenHome() {
    const rig = this.launched;
    const names = rig.names();
    return {
      headings: rig.headings(),
      counts: [...rig.host.querySelectorAll('[data-testid="counts"]')].map((node) =>
        (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
      begin: names.includes('Begin'),
      need: names.includes(NEED),
    };
  }

  /** When I need…'s cards as `needModel` gives them over the disk. */
  wantNeed() {
    const planted = new Set(plantsOf(this.device.disk).keys());
    return {
      headings: [NEED],
      cards: needModel(planted, TAUGHT_IDS).map((card) => ({
        title: card.title,
        heading: false,
        promises: card.known.map((range) => spanRef(range)),
        toLearn: card.toLearn > 0 ? [`${card.toLearn} still to learn`] : [],
      })),
    };
  }

  seenNeed() {
    return { headings: this.launched.headings(), cards: this.launched.cards() };
  }

  /** What a screen shows once it settles to `want`, at most the rig's wait. */
  async settled<T>(seen: () => T, want: () => T) {
    const json = JSON.stringify(want());
    await this.launched.until(() => JSON.stringify(seen()) === json);
    return { seen: seen(), want: want() };
  }

  /** The screen the model names, settled: what it shows and what the model wants. */
  async settle(): Promise<Settled> {
    if (this.screen === 'today') return this.settleToday();
    if (this.screen === 'home')
      return this.settled(
        () => this.seenHome(),
        () => this.wantHome(),
      );
    return this.settled(
      () => this.seenNeed(),
      () => this.wantNeed(),
    );
  }

  /** What the walk counts at each arrival on home. */
  atHome() {
    if (this.planned() && !this.offersBegin()) this.bump('root:no-begin');
  }

  async settleToday() {
    const tended = this.tendedNow();
    const wanted = this.wantToday(tended);
    const want = JSON.stringify(wanted);
    await this.launched.until(() => JSON.stringify(this.seenToday()) === want);
    const seen = this.seenToday();
    if (tended !== null && JSON.stringify(seen) === want) {
      this.bump(['end:none', 'end:one'][tended.length] ?? 'end:many');
      if (this.visit.length > 0) this.bump('end:visit');
    }
    const shown = this.shown();
    if (shown !== null && this.planned()) {
      const fresh = this.plan.some((item) => item.reference === shown.reference && item.fresh);
      if ((!fresh || this.fromVisit(shown)) && this.launched.names().includes('Listen'))
        this.fault('Listen on a review');
    }
    return { seen, want: wanted };
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

  /** Every frame's further check: none beyond the rig's rules. */
  checks(_host: Element): readonly string[] {
    return [];
  }

  /** A launch: home on a read garden (R1), Today on an unread one. */
  async launch() {
    if (this.rig !== null) await this.rig.leave();
    this.rig = await launchNeed(this.device, this.time, undefined, 1, (host) => this.checks(host));
    this.make();
    this.bump('made:launch');
    this.screen = this.device.unread ? 'today' : 'home';
    if (this.device.unread) this.bump('root:launch-unread');
    else this.bump('root:launch-home');
    if (!this.device.unread && this.held.tag !== 'Read') this.bump('root:launch-passages-unread');
    const heading = this.device.unread ? 'Today' : 'Your field';
    await this.launched.until(() => this.launched.headings().includes(heading));
    if (this.screen === 'home') this.atHome();
  }

  /** `Begin` on home: Today on the verse the model shows, the hold and the visit kept. */
  async begin(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('begin');
    if (!(await rig.tap('Begin'))) return 'no Begin';
    this.bump('root:begin');
    if (!this.planned()) this.bump('root:begin-unread-passages');
    const shown = this.shown();
    if (this.hold !== null && shown !== null && this.recallsNow(shown.reference) > shown.recalls)
      this.bump('root:back-held');
    this.screen = 'today';
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  /** `When I need…` on home: its screen. */
  async need(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('need');
    if (!(await rig.tap(NEED))) return `no ${NEED}`;
    this.screen = 'need';
    this.bump('need:opened');
    this.bump('root:need-from-home');
    await rig.until(() => rig.headings().includes(NEED));
    return null;
  }

  /** On When I need…: a known promise, which shows Today on its visit, or the bar's `Your field`. */
  async choose(): Promise<unknown> {
    const rig = this.launched;
    const planted = new Set(plantsOf(this.device.disk).keys());
    const cards = needModel(planted, TAUGHT_IDS);
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
      this.bump('root:need-back');
      if (!(await rig.tap('Your field'))) return 'no Your field on When I need…';
      this.screen = 'home';
      await rig.until(() => rig.headings().includes('Your field'));
      this.atHome();
      return null;
    }
    const { card, range } = pool[below(this.next, pool.length)] as (typeof pool)[number];
    this.trail.push(`visit:${spanRef(range)}`);
    if (this.visit.length > 0) this.bump('visit:replaced');
    if (this.hold !== null) this.bump('visit:after-held');
    if (range.last > range.first) this.bump('visit:multi-verse');
    if (card.id !== 'protection') this.bump('visit:other-collection');
    this.bump('visit:started');
    this.bump('root:need-visit');
    this.visit = visitModel(range, this.recallsNow);
    if (this.visit.some((verse) => this.plan.some((item) => item.reference === verse.reference)))
      this.bump('visit:plan-item');
    if (!(await rig.tap(spanRef(range)))) return `no promise ${spanRef(range)}`;
    this.screen = 'today';
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
    this.time.now += MINUTE;
    const before = this.recallsNow(shown.reference);
    const visiting = this.planned() && this.fromVisit(shown);
    this.said.add(shown.reference);
    if (!(await rig.tap('Say it'))) return 'no Say it';
    if (!this.planned()) {
      await rig.until(() => this.recallsNow(shown.reference) > before);
      if (this.recallsNow(shown.reference) !== before + 1)
        return { said: shown.reference, before, after: this.recallsNow(shown.reference) };
      this.bump('today:said-unplanned');
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

  /**
   * A minutes choice as a reader makes one now. On an unread garden none is
   * offered: Today shows no `Settings` and no `<n> min`, and nothing is
   * made. On a read one, from Today `Your field` first (home, as `field`
   * holds it), then on home the sheet, every frame held by a `watchSheet`:
   * the gear, `<n> min` (the plan made at the tap), `Done`, then `Begin`
   * exactly when the model shows a verse, else the walk stays on home.
   * Answers what failed, with the sheet's faults and look-checked frames.
   */
  async minutesTap(): Promise<unknown> {
    const others = MINUTES.filter((each) => each !== this.minutes);
    const minutes = pickOf(this.next, others as unknown as [Minutes, ...Minutes[]]);
    this.trail.push(`minutes:${minutes}`);
    const rig = this.launched;
    if (this.device.unread) {
      const names = rig.names();
      if (!rig.headings().includes('Today')) return 'no Today on an unread garden';
      if (
        modalOf() !== null ||
        names.includes('Settings') ||
        names.some((name) => /^\d+ min$/.test(name))
      )
        return 'a Minutes or Settings on an unread garden';
      this.bump('minutes:none-unread');
      return null;
    }
    if (this.screen === 'today') {
      const wrong = await this.field();
      if (wrong !== null) return wrong;
    }
    const watch = watchSheet();
    const opened = await openSettings(rig).then(
      () => null,
      (error: unknown) => String(error),
    );
    const tapped = opened === null && (await tapInSheet(`${minutes} min`));
    if (tapped) {
      this.minutes = minutes;
      this.minutesTapped = true;
      if (this.visit.length > 0) this.bump('visit:dropped-by-making');
      this.bump('made:minutes');
      this.make();
    }
    const closed = tapped && (await closeSettings(rig, 'Done'));
    watch.stop();
    if (!closed || watch.frames.looked === 0 || watch.faults.length > 0)
      return { opened, tapped, closed, looked: watch.frames.looked, sheet: [...watch.faults] };
    return this.offersBegin() ? this.begin() : null;
  }

  /** Today's `Your field`: home, its rows titled as the model gives them, the visit and the hold kept for `Begin`. */
  async field(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('field');
    if (!(await rig.tap('Your field'))) return 'no Your field';
    this.screen = 'home';
    await rig.until(() => rig.headings().includes('Your field'));
    const want = fieldPassagesModel(OWN_ROW, this.held, TAUGHT_IDS).map((row) => row.title);
    const titles = () =>
      [...rig.host.querySelectorAll('[data-testid="row-title"]')].map((node) => node.textContent);
    await rig.until(() => titles().length >= want.length);
    const seen = titles().slice(0, want.length);
    if (JSON.stringify(seen) !== JSON.stringify(want)) return { rows: seen, want };
    this.bump('field:opened');
    this.bump('root:back');
    if (this.visit.length > 0) this.bump('visit:kept-over-field');
    this.atHome();
    return null;
  }

  async relaunch() {
    const now = this.time.now;
    const morning = new Date(now);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(4, 1 + below(this.next, 59), 0, 0);
    this.time.now = morning.getTime() + below(this.next, 10) * HOUR;
    this.trail.push('relaunch');
    if (this.visit.length > 0) this.bump('visit:dropped-by-relaunch');
    this.bump('day:next-morning');
    await this.launch();
    if (this.screen === 'home') this.bump('root:relaunch-home');
    return null;
  }

  /** One generated command on home: `When I need…` with a plan made, `Begin` when offered, a relaunch, or (one in eleven) a minutes choice in the sheet. */
  async homeStep(): Promise<unknown> {
    const roll = below(this.next, 22);
    if (roll >= 20) return this.minutesTap();
    if (roll < 14 && this.planned()) return this.need();
    if (roll < 18 && this.offersBegin()) return this.begin();
    return this.relaunch();
  }

  /** The command `roll` draws on Today with no plan: `Say it`, a minutes choice, `Your field` (none on an unread garden) or a relaunch. */
  unplannedStep(roll: number): Promise<unknown> {
    if (roll < 10) return this.say();
    if (roll < 14 || (this.device.unread && roll < 16)) return this.minutesTap();
    if (roll < 18 && !this.device.unread) return this.field();
    return this.relaunch();
  }

  /** One generated command on Today; a visit open makes half of them `Say it`. */
  async todayStep(): Promise<unknown> {
    const open = this.visit.some((verse) => this.recallsNow(verse.reference) <= verse.recalls);
    if (open && below(this.next, 2) === 0) return this.say();
    const roll = below(this.next, 20);
    if (!this.planned()) return this.unplannedStep(roll);
    if (roll < 7) return this.field();
    if (roll < 13) return this.say();
    if (roll < 15) return this.minutesTap();
    if (roll < 18) return this.field();
    return this.relaunch();
  }

  /** One generated command, drawn from those the screen the model names offers. */
  async step(): Promise<unknown> {
    if (this.screen === 'need') return this.choose();
    if (this.screen === 'home') return this.homeStep();
    return this.todayStep();
  }
}

/** Plays `walk` `steps` commands from its launch, each settled on the screen the model names; answers the first failure, or null. */
export const play = async (walk: Walk, n: number, steps: number): Promise<unknown> => {
  await walk.launch();
  const first = await walk.settle();
  if (JSON.stringify(first.seen) !== JSON.stringify(first.want))
    return { device: n, at: 'launch', ...first };
  for (let s = 0; s < steps; s++) {
    const wrong = await walk.step();
    if (wrong !== null) return { device: n, trail: walk.trail, wrong };
    const shown = await walk.settle();
    const disk = walk.diskFaults();
    if (JSON.stringify(shown.seen) !== JSON.stringify(shown.want) || disk.length > 0)
      return { device: n, trail: walk.trail, screen: walk.screen, ...shown, disk };
  }
  const faults = [...walk.launched.faults];
  await walk.launched.leave();
  return faults.length > 0 ? { device: n, faults } : null;
};

/** Walks the listed generated devices of `seed` (device `n` is `random(seed * 1000 + n)`) over a garden read or not, `steps` commands each; answers the first failure (none when all held) and the coverage. */
export const walkNeed = async (
  seed: number,
  devices: ReadonlyArray<number>,
  steps: number,
  garden: 'read' | 'unread' = 'read',
) => {
  const cover: Coverage = {};
  for (const n of devices) {
    const failure = await play(new Walk(random(seed * 1000 + n), cover, garden), n, steps);
    if (failure !== null) return { failure, cover };
  }
  return { failure: null, cover };
};
