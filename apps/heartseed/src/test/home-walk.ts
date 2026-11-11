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
 *   ready review, today's new piece, a verse whose open item is a phrase,
 *   a planted verse whose item is done, a planted verse not in the plan, a
 *   verse not planted, a loose verse), a tap on the chosen plant again (let
 *   go), `Practice <reference>` or `Learn <reference>` on the chosen card,
 *   `Start` (exactly when the model shows a verse, R3; with `waits`, after
 *   a wait on home that keeps the plan, `waitBegin`), `Practice anyway`
 *   (exactly when no verse shows and a planted verse starts), with nothing
 *   held a landed `Remove <reference>` then `Remove`, a relaunch the next
 *   morning;
 * - on Today: `Your field` a quarter of the time on a read garden, else
 *   one of `root-walk`'s (`Say it`, `Next`, a minutes choice by `Your
 *   field` and the Settings sheet, or none offered on an unread garden,
 *   `Your field`, a relaunch).
 *
 * The oracle, apart from the app's code: the walk's plan, hold and visit
 * as `root-walk` keeps them; the chosen verse; the furrows as
 * `furrowsModel` gives them over `listsModel`'s lists and the disk's
 * recalls, ready by `readyModel` over the plan, each with its caption;
 * home's card: with a verse chosen the chosen card, its line and
 * `Practice <reference>` (a review) or `Learn <reference>` (a fresh item)
 * exactly when `startModel` starts something (the canon by `placesOf`);
 * else the Today card, its lines by `cardLineModel` with a plan made and
 * `Start` exactly with a verse shown, else `Practice anyway` exactly when
 * `weakestModel` names a verse (over unread passages `Start` alone, with
 * no lines); the greeting by `greetingModel` in the host's zone at the
 * clock's now. `Practice`, `Learn` and `Practice anyway` make the visit
 * the one verse `startModel` gives and keep the hold; a remove drops its
 * span and makes the plan again. After every command the screen the model
 * names is held to the model (Today as `root-walk` holds it), and the disk
 * to `root-walk`'s rule (the passages key only as the removes leave it).
 */

import { cardOf, homeFaults, iconOf, nameOf, selectedPlants, text } from './field-rig';
import type { ModelPlantStage } from './field-model';
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
import { KEY, readRule, spanRef, type Held } from './passages-model';
import { CORPUS } from './passages-rig';
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

const CANON = new Set(placesOf(CORPUS).keys());

const WORDS: Readonly<Record<ModelPlantStage, string>> = {
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
  'not planted': 'not planted yet',
};

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
  chosen: string | null = null;
  removed = false;
  /** The visit the last start from home made, while it is the visit. */
  started: readonly Started[] | null = null;
  /** Whether `Start` on home comes after a wait (`waitBegin`); off but in walk-h. */
  waits = false;

  /** Home's rules on every frame of the field. */
  override checks(host: Element) {
    return onField(host);
  }

  /** The launch, no plant chosen. */
  override async launch() {
    this.chosen = null;
    await super.launch();
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
    return startModel(
      this.planned() ? this.plan : null,
      verse,
      this.recallsNow,
      CANON,
      verseOfRule,
      this.piecesNow(),
    );
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

  /** The field the model gives: the furrows, the selection, home's card and the greeting. */
  wantField() {
    const furrows = this.furrows();
    const plants = furrows.flatMap((furrow) => furrow.plants);
    const chosen = plants.find((plant) => plant.reference === this.chosen);
    const started = chosen === undefined ? null : this.startOf(chosen.reference);
    const card =
      chosen === undefined
        ? this.todayCard()
        : {
            card: 'chosen',
            line: `${chosen.reference} · ${WORDS[chosen.stage]}`,
            controls:
              started === null
                ? []
                : [`${started.item.fresh ? 'Learn' : 'Practice'} ${chosen.reference}`],
          };
    return {
      rows: furrows.map((furrow) => ({
        title: furrow.title.replace(/\s+/g, ' ').trim(),
        icon: furrow.icon,
        caption: furrow.caption,
        plants: furrow.plants.map((plant) => plant.label),
      })),
      selected: plants
        .filter((plant) => plant.reference === this.chosen)
        .map((plant) => plant.label),
      card,
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

  /** `root-walk`'s disk rule, the passages key held to what the removes leave. */
  override diskFaults() {
    const out = super.diskFaults();
    if (!this.removed) return out;
    const kept = out.filter((fault) => fault !== `changed ${KEY}` && fault !== 'passages written');
    const now = readRule(CORPUS, this.device.disk.get(KEY), 0);
    if (JSON.stringify(now) !== JSON.stringify(this.held)) kept.push('passages not as removed');
    return kept;
  }

  /** Home from Today's `Your field`, no plant chosen; the visit and the hold kept for `Start`. */
  override async field(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('field');
    if (!(await rig.tap('Your field'))) return 'no Your field';
    this.screen = 'home';
    await rig.until(() => rig.headings().includes('Your field'));
    this.chosen = null;
    this.bump('field:opened');
    this.bump('root:back');
    if (this.visit.length > 0) this.bump('visit:kept-over-field');
    this.atHome();
    return null;
  }

  /** The class of `verse` on the field: its open plan item's kind, else how it lies. */
  classOf(verse: string, furrows: readonly ModelFurrow[]) {
    const open = this.plan.find(
      (item) =>
        this.recallsNow(item.reference) <= item.recalls && verseOfRule(item.reference) === verse,
    );
    if (this.planned() && open !== undefined)
      return open.reference !== verse ? 'phrase' : open.fresh ? 'new' : 'ready';
    if (this.plan.some((item) => verseOfRule(item.reference) === verse)) return 'done';
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

  async tap(verse: string, kind: string): Promise<unknown> {
    const label = this.furrows()
      .flatMap((furrow) => furrow.plants)
      .find((plant) => plant.reference === verse)?.label;
    this.trail.push(`plant:${verse}`);
    if (label === undefined || !(await this.launched.tap(label))) return `no plant ${label}`;
    if (this.chosen === verse) {
      this.chosen = null;
      this.bump('home:letgo');
      return null;
    }
    if (this.chosen !== null) this.bump('home:moved');
    this.chosen = verse;
    this.bump(`pick:${kind}`);
    if (this.planned() && this.startOf(verse) === null) this.bump('start:none');
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
    if (started.item.reference !== verse) this.bump('start:phrase');
    if (this.hold !== null) this.bump('start:over-held');
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
    this.chosen = null;
    this.screen = 'today';
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  /** `Practice <reference>` or `Learn <reference>` on the chosen card, by whether its start is new. */
  async startHere(): Promise<unknown> {
    const verse = this.chosen ?? '';
    const started = this.startOf(verse);
    if (started === null) return 'no start';
    const kind = started.item.fresh ? 'Learn' : 'Practice';
    this.bump(`card:${kind}`);
    return this.startVerse(verse, `${kind} ${verse}`);
  }

  /** `Practice anyway` on the Today card: the weakest planted verse started as a tap on it would. */
  async practiceAnyway(): Promise<unknown> {
    const verse = this.weakest();
    if (verse === null) return 'no weakest verse';
    this.bump('card:Practice anyway');
    return this.startVerse(verse, 'Practice anyway');
  }

  /** `Start` on home, which no choice may hide; the next arrival on home has none. */
  override async begin(): Promise<unknown> {
    if (this.hold !== null) this.bump('home:begin-held');
    this.chosen = null;
    return super.begin();
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

  /** A landed remove of a held passage drawn from those held: its span dropped, the plan made again. */
  async remove(): Promise<unknown> {
    const rig = this.launched;
    if (this.held.tag !== 'Read') return 'no passages';
    const index = below(this.next, this.held.passages.length);
    const span = this.held.passages[index];
    if (span === undefined) return 'no passage';
    const reference = spanRef(span);
    this.trail.push(`remove:${reference}`);
    if (!(await rig.tap(`Remove ${reference}`))) return `no Remove ${reference}`;
    if (!(await rig.tap('Remove'))) return 'no ask';
    this.held = {
      tag: 'Read',
      passages: this.held.passages.filter((_, at) => at !== index),
    };
    this.removed = true;
    this.make();
    this.bump('made:remove');
    this.bump('home:remove');
    await rig.until(
      () =>
        by(rig.host, 'ask').length === 0 &&
        !by(rig.host, 'row-title').some((node) => text(node) === reference),
    );
    const plants = this.furrows().flatMap((furrow) => furrow.plants);
    if (!plants.some((plant) => plant.reference === this.chosen)) this.chosen = null;
    return null;
  }

  /** One command on home. */
  override async homeStep(): Promise<unknown> {
    const roll = below(this.next, 20);
    if (roll < 2 && this.chosen !== null) return this.tap(this.chosen, 'again');
    if (roll < 6 && this.chosen !== null && this.startOf(this.chosen) !== null)
      return this.startHere();
    if (roll < 8 && this.chosen === null && this.offersBegin())
      return this.waits ? this.waitBegin() : this.begin();
    if (roll < 10)
      return this.chosen === null && !this.offersBegin() && this.weakest() !== null
        ? this.practiceAnyway()
        : this.relaunch();
    if (
      roll < 12 &&
      this.hold === null &&
      this.held.tag === 'Read' &&
      this.held.passages.length > 0
    )
      return this.remove();
    if (roll === 19) return this.relaunch();
    return this.tapPlant();
  }

  /** One command on Today: on a read garden `Your field` a quarter of the time, else one of `root-walk`'s. */
  override async todayStep(): Promise<unknown> {
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
