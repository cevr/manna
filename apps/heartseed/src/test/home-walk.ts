/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- the rendered walk plays each generated device's commands one after another through the screen rig's promise-based taps, over a disk in a plain map, and writes expected values as plain branches. */

/**
 * Home's field as a reader meets it, walked through the root
 * (`test/root-rig.tsx`) over `root-walk.ts`'s generated devices, the layer
 * teaching Fear, every frame of the field also held to `homeFaults`.
 *
 * The walk keeps `root-walk`'s screen model: every launch on a read garden
 * lands on home, and an unread garden's on Today with no `Your field`.
 * Its commands by screen:
 * - on home: a tap on a plant drawn from each class the field holds (a
 *   ready review, today's new piece, a planted verse whose item is done, a
 *   planted verse not in the plan, a verse not planted, a loose verse),
 *   which starts its verse at once and shows Today, or does nothing when
 *   nothing starts it (owner, 2026-11-12: no card between a plant and
 *   Today), `Start` (exactly when the model shows a verse, R3; with `waits`, after
 *   a wait on home that keeps the plan, `waitBegin`), `Practice anyway`
 *   (exactly when no verse shows and a planted verse starts), with nothing
 *   held a landed remove (`Open <reference>`, then on its own page `Remove
 *   <reference>` and `Remove`, which shows home), a landed add (`Add a
 *   list`, the sheet's `Any passage`, a verse of a drawn chapter, `Plant`),
 *   a return to the foreground, a relaunch the next morning; while a visit
 *   is open or an item held, an add takes a remove's turn;
 * - on Today: a return to the foreground one time in ten, `Your field` a
 *   quarter of the rest on a read garden, else one of `root-walk`'s (`Say
 *   it`, `Next`, a minutes choice by `Your field` and the Settings sheet, or
 *   none offered on an unread garden, `Your field`, a relaunch).
 *
 * The oracle, apart from the app's code: the walk's plan, hold and visit
 * as `root-walk` keeps them; the furrows as `furrowsModel` gives them over
 * `listsModel`'s lists and the disk's recalls, ready by `readyModel` over
 * the plan, each with its caption, no plant selected; home's one card,
 * the Today card, its lines by `cardLineModel` with a plan made and
 * `Start` exactly with a verse shown, else `Practice anyway` exactly when
 * `weakestModel` names a verse (over unread passages `Start` alone, with
 * no lines); the greeting by `greetingModel` in the host's zone at the
 * clock's now. A plant's tap and `Practice anyway` make the visit the one
 * verse `startModel` gives (the canon by `placesOf`) and keep the hold; a
 * remove drops its
 * span and an add appends it (`addRule`), each making the plan again; a
 * return to the foreground comes after a drawn time away and, over a read
 * garden and passages, makes the plan again at the later instant. Each
 * making drops the visit and the hold (no recital is under way between
 * commands). After every command the screen the model
 * names is held to the model (Today as `root-walk` holds it), and the disk
 * to `root-walk`'s rule (the passages key only as the adds and removes
 * leave it).
 */

import { bookName, TARGETS } from './chooser-rig';
import { cardOf, homeFaults, iconOf, nameOf, selectedPlants, text } from './field-rig';
import { below, random } from './garden-model';
import {
  cardLineModel,
  furrowsModel,
  greetingModel,
  listsModel,
  placesOf,
  readyModel,
  weakestModel,
  type ModelFurrow,
} from './home-model';
import { addRule, KEY, readRule, spanRef, verseRef, type Held, type Span } from './passages-model';
import { CORPUS, countIn } from './passages-rig';
import { verseOfRule } from './phrase-model';
import { startModel, type ModelVisitVerse } from './promise-model';
import {
  OWN_ROW,
  plantsOf,
  play,
  TAUGHT_IDS,
  Walk,
  type Coverage,
  type Settled,
} from './root-walk';
import { HOUR, MINUTE } from './session-model';
import { activateSheet, tapSheet } from './shelves-rig';

const CANON = new Set(placesOf(CORPUS).keys());

/** A verse started from home: its visit verse, whether it is learned new, and its estimate as the card counts it (one verse's recital is under a minute: 10 s and half a second a word). */
type Started = ModelVisitVerse & { readonly fresh: boolean; readonly seconds: number };

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

const headingsOf = (host: Element) => [...host.querySelectorAll('[role="heading"]')].map(text);

/** Home's rules on every frame of the field. */
const onField = (host: Element) =>
  headingsOf(host).includes('Your field') ? homeFaults(host) : [];

/** One device's walk of the home over `root-walk`'s walk and its model. */
class HomeWalk extends Walk {
  declare held: Held;
  /** Whether an add or a remove landed, so the passages key holds `held`. */
  changed = false;
  /** The visit the last start from home made, while it is the visit. */
  started: readonly Started[] | null = null;
  /** Whether `Start` on home comes after a wait (`waitBegin`); off but in walk-h. */
  waits = false;

  /** Home's rules on every frame of the field. */
  override checks(host: Element) {
    return onField(host);
  }

  /** What the walk counts at each arrival on home: the dots, the card's action, and the greeting. */
  override atHome() {
    super.atHome();
    const plants = this.furrows().flatMap((furrow) => furrow.plants);
    if (plants.some((plant) => plant.ready)) this.bump('home:dot');
    if (plants.some((plant) => !plant.ready && plant.stage !== 'not planted'))
      this.bump('home:no-dot');
    if (this.planned()) {
      if (this.offersBegin()) this.bump('home:begin');
      else this.bump(this.weakest() === null ? 'home:no-begin' : 'home:anyway');
    }
    this.bump(`greeting:${this.wantField().greeting.split(' ')[1] ?? ''}`);
  }

  records() {
    return [...plantsOf(this.device.disk).values()].flat();
  }

  furrows(): ModelFurrow[] {
    const records = this.records();
    const lists = listsModel(OWN_ROW, this.held, TAUGHT_IDS);
    return furrowsModel(
      records,
      lists,
      readyModel(this.planned() ? this.plan : undefined, records),
    );
  }

  /** What a tap on `verse` starts, as `startModel` gives it. */
  startOf(verse: string) {
    return startModel(this.planned() ? this.plan : null, verse, this.recallsNow, CANON);
  }

  /** The verse `Practice anyway` starts, as `weakestModel` names it. */
  weakest() {
    return weakestModel(plantsOf(this.device.disk), (verse) => this.startOf(verse) !== null);
  }

  /** The item the run shows when the plan holds none open: the hold, or the visit's verse a start from home made. */
  shownItem() {
    const shown = this.shown();
    if (shown === null) return null;
    const planned = this.plan.find(
      (item) => item.reference === shown.reference && item.recalls === shown.recalls,
    );
    if (planned !== undefined) return planned;
    const started = this.started?.find((each) => each.reference === shown.reference);
    return { ...shown, fresh: started?.fresh ?? false, seconds: started?.seconds ?? 60 };
  }

  /** The Today card the model gives: its lines with a plan made, and `Start`, else `Practice anyway`, else no button. */
  todayCard() {
    const begin = this.offersBegin();
    const anyway = !begin && this.weakest() !== null;
    if (!this.planned() && !begin && !anyway) return { card: '<none>', line: '', controls: [] };
    return {
      card: 'today-card',
      line: this.planned() ? cardLineModel(this.plan, this.recallsNow, this.shownItem()) : '',
      controls: begin ? ['Start'] : anyway ? ['Practice anyway'] : [],
    };
  }

  /** The field the model gives: the furrows, no plant selected, home's Today card and the greeting. */
  wantField() {
    const furrows = this.furrows();
    return {
      rows: furrows.map((furrow) => ({
        title: furrow.title.replace(/\s+/g, ' ').trim(),
        icon: furrow.icon,
        caption: furrow.caption,
        plants: furrow.plants.map((plant) => plant.label),
      })),
      selected: [],
      card: this.todayCard(),
      greeting: greetingModel(Intl.DateTimeFormat().resolvedOptions().timeZone, this.time.now),
    };
  }

  /** The screen the model names, settled; home as `wantField` gives it. */
  override async settle(): Promise<Settled> {
    if (this.screen === 'home')
      return this.settled(
        () => this.seenField(),
        () => this.wantField(),
      );
    return super.settle();
  }

  seenField() {
    const host = this.launched.host;
    const greeting = by(host, 'greeting')[0];
    return {
      rows: by(host, 'row').map((row) => ({
        title: text(row.querySelector('[data-testid="row-title"]')),
        icon: iconOf(row.querySelector('[data-testid="furrow-icon"] img')),
        caption: text(row.querySelector('[data-testid="caption"]')),
        plants: by(row, 'field-plant').map(nameOf),
      })),
      selected: selectedPlants(host),
      card: cardOf(host),
      greeting: `${text(greeting)} ${iconOf(greeting?.querySelector('img'))}`,
    };
  }

  /** Today settled to `wantToday`, and no `Listen` on a review: a verse practiced from home or a plan item not new; `Learn` and today's new piece started as planned are new. */
  override async settleToday() {
    const want = JSON.stringify(this.wantToday());
    await this.launched.until(() => JSON.stringify(this.seenToday()) === want);
    const seen = this.seenToday();
    const shown = this.shown();
    if (shown !== null && this.planned()) {
      const planned = this.plan.some((item) => item.reference === shown.reference && item.fresh);
      const learned = this.started?.some(
        (each) => each.reference === shown.reference && each.fresh,
      );
      const fresh = this.fromVisit(shown) ? learned === true : planned;
      if (!fresh && this.launched.names().includes('Listen')) this.fault('Listen on a review');
    }
    return { seen, want: this.wantToday() };
  }

  /** `root-walk`'s disk rule, the passages key held to what the adds and removes leave. */
  override diskFaults() {
    const out = super.diskFaults();
    if (!this.changed) return out;
    const kept = out.filter(
      (fault) =>
        fault !== `changed ${KEY}` && fault !== `added ${KEY}` && fault !== 'passages written',
    );
    const now = readRule(CORPUS, this.device.disk.get(KEY), 0);
    if (JSON.stringify(now) !== JSON.stringify(this.held)) kept.push('passages not as changed');
    return kept;
  }

  /** Home from Today's `Your field`; the visit kept for `Start`, the hold and its pending recall let go (`leaveToday`). */
  override async field(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('field');
    if (!(await rig.tap('Your field'))) return 'no Your field';
    this.leaveToday();
    this.screen = 'home';
    await rig.until(() => rig.headings().includes('Your field'));
    this.bump('field:opened');
    this.bump('root:back');
    if (this.visit.length > 0) this.bump('visit:kept-over-field');
    this.atHome();
    return null;
  }

  /** The class of `verse` on the field: its open plan item's kind, else how it lies. */
  classOf(verse: string, furrows: readonly ModelFurrow[]) {
    const open = this.plan.find(
      (item) => this.recallsNow(item.reference) <= item.recalls && item.reference === verse,
    );
    if (this.planned() && open !== undefined) return open.fresh ? 'new' : 'ready';
    if (this.plan.some((item) => item.reference === verse)) return 'done';
    const loose = furrows.some(
      (furrow) =>
        furrow.source.tag === 'Loose' && furrow.plants.some((plant) => plant.reference === verse),
    );
    if (loose) return 'loose';
    return this.recallsNow(verse) > 0 ? 'unplanned' : 'not-planted';
  }

  /** A tap on a plant of a class drawn from those the field holds. */
  async tapPlant(): Promise<unknown> {
    const furrows = this.furrows();
    const classes = new Map<string, string[]>();
    for (const plant of furrows.flatMap((furrow) => furrow.plants)) {
      const kind = this.classOf(plant.reference, furrows);
      const verses = classes.get(kind) ?? [];
      if (!verses.includes(plant.reference)) verses.push(plant.reference);
      classes.set(kind, verses);
    }
    const kinds = [...classes.keys()];
    const kind = kinds[below(this.next, kinds.length)];
    const verses = classes.get(kind ?? '') ?? [];
    const verse = verses[below(this.next, verses.length)];
    if (kind === undefined || verse === undefined) return 'no plant';
    return this.tap(verse, kind);
  }

  /** A tap on `verse`'s plant: what `startModel` starts on it, at once, Today shown; nothing at all when it starts nothing, home kept. */
  async tap(verse: string, kind: string): Promise<unknown> {
    const plant = this.furrows()
      .flatMap((furrow) => furrow.plants)
      .find((each) => each.reference === verse);
    if (plant === undefined) return `no plant ${verse}`;
    this.bump(`pick:${kind}`);
    const started = this.startOf(verse);
    if (started !== null) {
      this.bump(`tap:${started.item.fresh ? 'learn' : 'practice'}`);
      this.bump(`tap:${plant.stage}`);
      return this.startVerse(verse, plant.label);
    }
    this.trail.push(`plant:${verse}`);
    if (!(await this.launched.tap(plant.label))) return `no plant ${plant.label}`;
    this.bump('tap:nothing');
    return null;
  }

  /** Starts `verse` by the control named `label`: the visit becomes what `startModel` starts, the hold kept, Today shown. */
  async startVerse(verse: string, label: string): Promise<unknown> {
    const rig = this.launched;
    const started = this.startOf(verse);
    if (started === null) return `no start on ${verse}`;
    this.trail.push(`${label}:${verse}`);
    if (!(await rig.tap(label))) return `no ${label}`;
    this.bump(`start:${started.from}`);
    this.bump('root:start');
    if (
      started.from === 'learn' &&
      this.records().some(
        (recall) => recall.reference !== verse && verseOfRule(recall.reference) === verse,
      )
    )
      this.bump('start:begun');
    if (this.visit.some((each) => this.recallsNow(each.reference) <= each.recalls))
      this.bump('start:over-visit');
    const item: Started = {
      reference: started.item.reference,
      recalls: started.item.recalls,
      fresh: started.item.fresh,
      seconds: 60,
    };
    this.visit = [item];
    this.started = [item];
    this.screen = 'today';
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  /** `Practice anyway` on the Today card: the weakest planted verse started as a tap on it would. */
  async practiceAnyway(): Promise<unknown> {
    const verse = this.weakest();
    if (verse === null) return 'no weakest verse';
    this.bump('card:Practice anyway');
    return this.startVerse(verse, 'Practice anyway');
  }

  /** Whether Today would show otherwise were the plan alone made at the clock's now, the visit and the hold kept. */
  differsMadeNow() {
    const kept = { plan: this.plan, visit: this.visit, hold: this.hold };
    const want = JSON.stringify(this.wantToday());
    this.make();
    this.visit = kept.visit;
    this.hold = kept.hold;
    const later = JSON.stringify(this.wantToday());
    this.plan = kept.plan;
    return later !== want;
  }

  /**
   * A wait on home while `Start` shows, then `Start`: the clock moves by a
   * drawn wait of one to thirty hours (some cross the next 04:00), and Today
   * keeps the plan made at home's first show. Counted as `home:wait-begin`
   * when no visit or hold is kept and a plan made at the later instant
   * would show Today otherwise.
   */
  async waitBegin(): Promise<unknown> {
    const wait = (1 + below(this.next, 30)) * HOUR + below(this.next, 60) * MINUTE;
    this.time.now += wait;
    this.trail.push(`wait:${wait / MINUTE}`);
    if (this.visit.length === 0 && this.hold === null && this.differsMadeNow())
      this.bump('home:wait-begin');
    return this.begin();
  }

  /** A landed remove of a held passage drawn from those held, from its own page (`Open <reference>`, the last of that name, which is a held passage's and not the promise's, then `Remove <reference>` and the ask's `Remove`): its span dropped, the plan made again, home shown. */
  async remove(): Promise<unknown> {
    const rig = this.launched;
    if (this.held.tag !== 'Read') return 'no passages';
    const index = below(this.next, this.held.passages.length);
    const span = this.held.passages[index];
    if (span === undefined) return 'no passage';
    const reference = spanRef(span);
    this.trail.push(`remove:${reference}`);
    const opens = rig.names().filter((name) => name === `Open ${reference}`).length;
    if (!(await rig.tap(`Open ${reference}`, opens - 1))) return `no Open ${reference}`;
    if (!(await rig.tap(`Remove ${reference}`))) return `no Remove ${reference}`;
    if (!(await rig.tap('Remove'))) return 'no ask';
    this.held = {
      tag: 'Read',
      passages: this.held.passages.filter((_, at) => at !== index),
    };
    this.changed = true;
    this.make();
    this.bump('made:remove');
    this.bump('home:remove');
    await rig.until(
      () =>
        by(rig.host, 'ask').length === 0 &&
        by(rig.host, 'list-screen').length === 0 &&
        JSON.stringify(readRule(CORPUS, this.device.disk.get(KEY), 0)) ===
          JSON.stringify(this.held),
    );
    return null;
  }

  /** Whether a verse of the visit is still open. */
  visitOpen() {
    return this.visit.some((each) => this.recallsNow(each.reference) <= each.recalls);
  }

  /** Counts what an add or a wake (`kind`) lands over: an open visit (`wake:today-over-visit` too when Today shows it), a hold. */
  over(kind: string) {
    if (this.visitOpen()) this.bump(`${kind}:over-visit`);
    if (this.visitOpen() && this.screen === 'today') this.bump(`${kind}:today-over-visit`);
    if (this.hold !== null) this.bump(`${kind}:over-held`);
  }

  /** The add `Add a list` would land now, drawn: a verse of a drawn chapter, as `addRule` answers it. */
  addable() {
    const target = TARGETS[below(this.next, TARGETS.length)] ?? TARGETS[0];
    const verse = 1 + below(this.next, countIn(target.book, target.chapter));
    const span = { ...target, first: verse, last: verse };
    return { span, answer: addRule(CORPUS, this.held, span, false) };
  }

  /**
   * A landed add from home: `Add a list`, the sheet's `Any passage`, then
   * the book, the chapter, the verse and `Plant`. The passages gain the
   * span, and the plan is made again over them, the visit and the hold
   * dropped (no recital is under way).
   */
  async add(span: Span, held: Held): Promise<unknown> {
    const rig = this.launched;
    const name = bookName(span.book);
    this.trail.push(`add:${spanRef(span)}`);
    this.over('add');
    if (!(await rig.tap('Add a list'))) return 'no Add a list';
    if (!(await activateSheet(rig.until))) return 'Add a list: no sheet came';
    if (!(await tapSheet('Any passage'))) return 'no Any passage';
    for (const label of [
      name,
      `${name} ${span.chapter}`,
      verseRef(span.book, span.chapter, span.first),
      'Plant',
    ])
      if (!(await rig.until(() => rig.has(label))) || !(await rig.tap(label))) return `no ${label}`;
    this.held = held;
    this.changed = true;
    this.make();
    this.bump('made:add');
    this.bump('home:add');
    await rig.until(() => rig.headings().includes('Your field'));
    this.atHome();
    return null;
  }

  /** A return to the foreground after a drawn time away (a minute to thirty hours), on home or Today: the plan made again at the later instant over a read garden and passages, the visit and the hold dropped (no recital is under way), home's greeting read again. */
  async wake(): Promise<unknown> {
    const away = below(this.next, 30) * HOUR + (1 + below(this.next, 60)) * MINUTE;
    this.time.now += away;
    this.trail.push(`wake:${away / MINUTE}`);
    this.bump(`${this.screen}:wake`);
    this.over('wake');
    if (!(await this.launched.wake())) return 'the foreground never took the return';
    if (!this.planned()) return null;
    this.make();
    this.bump('made:wake');
    return null;
  }

  /** Roll 10 or 11 on home: an add on 11, and on 10 while a visit is open or an item held; else a remove of a passage held; else (no add lands, or no passage) a tap on a plant. */
  async changeStep(roll: number): Promise<unknown> {
    if (roll === 11 || this.visitOpen() || this.hold !== null) {
      const { span, answer } = this.addable();
      return answer.outcome === 'Added' ? this.add(span, answer.held) : this.tapPlant();
    }
    if (this.held.tag === 'Read' && this.held.passages.length > 0) return this.remove();
    return this.tapPlant();
  }

  /** One command on home. */
  override async homeStep(): Promise<unknown> {
    const roll = below(this.next, 20);
    if (roll === 10 || roll === 11) return this.changeStep(roll);
    if (roll === 19) return this.wake();
    if (roll < 4) return this.tapPlant();
    if (roll < 8 && this.offersBegin()) return this.waits ? this.waitBegin() : this.begin();
    if (roll < 10)
      return !this.offersBegin() && this.weakest() !== null
        ? this.practiceAnyway()
        : this.relaunch();
    if (this.offersBegin()) return this.waits ? this.waitBegin() : this.begin();
    if (this.weakest() !== null && roll < 15) return this.practiceAnyway();
    return this.tapPlant();
  }

  /** One command on Today: a return to the foreground one time in ten, on a read garden `Your field` a quarter of the rest, else one of `root-walk`'s. */
  override async todayStep(): Promise<unknown> {
    if (below(this.next, 10) === 0) return this.wake();
    if (!this.device.unread && below(this.next, 4) === 0) return this.field();
    return super.todayStep();
  }
}

/** Walks the listed generated devices of `seed` (device `n` is `random(seed * 1000 + n)`) over a garden read or not, `steps` commands each, `Start` on home after a wait when `waits`; answers the first failure (none when all held) and the coverage. */
export const walkHome = async (
  seed: number,
  devices: ReadonlyArray<number>,
  steps: number,
  garden: 'read' | 'unread' = 'read',
  options: { readonly waits?: boolean } = {},
) => {
  const cover: Coverage = {};
  for (const n of devices) {
    const walk = new HomeWalk(random(seed * 1000 + n), cover, garden);
    walk.waits = options.waits ?? false;
    const failure = await play(walk, n, steps);
    if (failure !== null) return { failure, cover };
  }
  return { failure: null, cover };
};
