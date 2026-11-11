/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- the rendered walk plays each generated device's commands one after another through the screen rig's promise-based taps, over a disk in a plain map, and writes expected values as plain branches. */

/**
 * Home A's field as a reader meets it, walked through the root
 * (`test/need-rig.tsx`) over `need-walk.ts`'s generated devices, the layer
 * teaching Fear, every frame of the field also held to `homeFaults`.
 *
 * The walk keeps `need-walk`'s screen model: every launch on a read garden
 * lands on home, and an unread garden's on Today with no `Your field`.
 * Its commands by screen:
 * - on home: a tap on a plant drawn from each class the field holds (a
 *   ready review, today's new piece, a verse whose open item is a phrase,
 *   a planted verse whose item is done, a planted verse not in the plan, a
 *   verse not planted, a loose verse), a tap on the chosen plant again,
 *   `Start here`, `Begin` (exactly when the model shows a verse, R3; with
 *   `waits`, after a wait on home that keeps the plan, `waitBegin`),
 *   `When I need…` (with a plan made), with nothing held a landed
 *   `Remove <reference>` then `Remove`, a relaunch the next morning;
 * - on Today: `Your field` a quarter of the time on a read garden, else
 *   one of `need-walk`'s (`Say it`, `Next`, a minutes choice by `Your
 *   field` and the Settings sheet, or none offered on an unread garden,
 *   `Your field`, a relaunch);
 * - on When I need…: `need-walk`'s, a known promise or `Your field`.
 *
 * The oracle, apart from the app's code: the walk's plan, hold and visit
 * as `need-walk` keeps them; the chosen verse; the furrows as
 * `furrowsModel` gives them over `listsModel`'s lists and the disk's
 * recalls, ready by `readyModel` over the plan; the foot's card by
 * `countsModel` and the walk's shown verse (`Begin` exactly with one shown;
 * over unread passages `Begin` alone, with no counts line), or the chosen
 * line and `Start here with <reference>` exactly when `startModel` starts
 * something (the canon by `placesOf`); `When I need…` exactly with a plan
 * made; the greeting by `greetingModel` in the host's zone at the clock's
 * now. A `Start here` makes the visit the one verse `startModel` gives and
 * keeps the hold; a remove drops its span and makes the plan again. After
 * every command the screen the model names is held to the model (Today
 * and When I need… as `need-walk` holds them), and the disk to
 * `need-walk`'s rule (the passages key only as the removes leave it).
 */

import type { ModelPlantStage } from './field-model';
import { homeFaults, iconOf, nameOf, selectedPlants, text } from './field-rig';
import { below, random } from './garden-model';
import {
  furrowsModel,
  greetingModel,
  listsModel,
  placesOf,
  readyModel,
  type ModelFurrow,
} from './home-model';
import {
  OWN_ROW,
  plantsOf,
  play,
  TAUGHT_IDS,
  Walk,
  type Coverage,
  type Settled,
} from './need-walk';
import { KEY, readRule, spanRef, type Held } from './passages-model';
import { CORPUS } from './passages-rig';
import { verseOfRule } from './phrase-model';
import { startModel, type ModelVisitVerse } from './promise-model';
import { countsModel, HOUR, MINUTE } from './session-model';

const CANON = new Set(placesOf(CORPUS).keys());

const WORDS: Readonly<Record<ModelPlantStage, string>> = {
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
  'not planted': 'not planted yet',
};

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

const headingsOf = (host: Element) => [...host.querySelectorAll('[role="heading"]')].map(text);

/** Home A's rules on every frame of the field. */
const onField = (host: Element) =>
  headingsOf(host).includes('Your field') ? homeFaults(host) : [];

/** One device's walk of the home over `need-walk`'s walk and its model. */
class HomeWalk extends Walk {
  declare held: Held;
  chosen: string | null = null;
  removed = false;
  /** The visit the last `Start here` made, while it is the visit. */
  started: readonly ModelVisitVerse[] | null = null;
  /** Whether `Begin` on home comes after a wait (`waitBegin`); off but in walk-h. */
  waits = false;

  /** Home A's rules on every frame of the field. */
  override checks(host: Element) {
    return onField(host);
  }

  /** The launch, no plant chosen. */
  override async launch() {
    this.chosen = null;
    await super.launch();
  }

  /** What the walk counts at each arrival on home: the dots, `Begin` or none, and the greeting. */
  override atHome() {
    super.atHome();
    const plants = this.furrows().flatMap((furrow) => furrow.plants);
    if (plants.some((plant) => plant.ready)) this.bump('home:dot');
    if (plants.some((plant) => !plant.ready && plant.stage !== 'not planted'))
      this.bump('home:no-dot');
    if (this.planned()) this.bump(this.shown() === null ? 'home:no-begin' : 'home:begin');
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

  /** The field the model gives: the furrows, the selection, the foot's card and the greeting. */
  wantField() {
    const furrows = this.furrows();
    const plants = furrows.flatMap((furrow) => furrow.plants);
    const chosen = plants.find((plant) => plant.reference === this.chosen);
    const begin = this.offersBegin();
    const foot =
      chosen !== undefined
        ? {
            card: 'chosen',
            line: `${chosen.reference} · ${WORDS[chosen.stage]}`,
            controls:
              this.startOf(chosen.reference) === null
                ? []
                : [`Start here with ${chosen.reference}`],
          }
        : this.planned() || begin
          ? {
              card: 'begin-card',
              line: this.planned() ? countsModel(this.plan, this.recallsNow) : '',
              controls: begin ? ['Begin'] : [],
            }
          : { card: '<none>', line: '', controls: [] };
    return {
      rows: furrows.map((furrow) => ({
        title: furrow.title.replace(/\s+/g, ' ').trim(),
        icon: furrow.icon,
        ripe: furrow.ripe,
        plants: furrow.plants.map((plant) => plant.label),
      })),
      selected: plants
        .filter((plant) => plant.reference === this.chosen)
        .map((plant) => plant.label),
      foot,
      greeting: greetingModel(Intl.DateTimeFormat().resolvedOptions().timeZone, this.time.now),
      need: this.planned(),
    };
  }

  /** The screen the model names, settled; home as `wantField` gives it, with `When I need…` exactly with a plan made. */
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
    const card = host.querySelector(
      '[data-testid="foot"] [data-testid="begin-card"],[data-testid="foot"] [data-testid="chosen"]',
    );
    const greeting = by(host, 'greeting')[0];
    return {
      rows: by(host, 'row').map((row) => ({
        title: text(row.querySelector('[data-testid="row-title"]')),
        icon: iconOf(row.querySelector('[data-testid="furrow-icon"] img')),
        ripe: text(row.querySelector('[data-testid="ripe"]')),
        plants: by(row, 'field-plant').map(nameOf),
      })),
      selected: selectedPlants(host),
      foot: {
        card: card?.getAttribute('data-testid') ?? '<none>',
        line: text(
          card?.getAttribute('data-testid') === 'begin-card'
            ? card.querySelector('[data-testid="counts"]')
            : card?.firstElementChild,
        ),
        controls: [...(card?.querySelectorAll('[role="button"]') ?? [])].map(nameOf),
      },
      greeting: `${text(greeting)} ${iconOf(greeting?.querySelector('img'))}`,
      need: this.launched.names().includes('When I need…'),
    };
  }

  /** Today settled to `wantToday`, and no `Listen` on a review: a promise's visit or a plan item not new; a `Start here` on today's new piece starts it as planned, new. */
  override async settleToday() {
    const want = JSON.stringify(this.wantToday());
    await this.launched.until(() => JSON.stringify(this.seenToday()) === want);
    const seen = this.seenToday();
    const shown = this.shown();
    if (shown !== null && this.planned()) {
      const fresh = this.plan.some((item) => item.reference === shown.reference && item.fresh);
      const promised = this.fromVisit(shown) && this.visit !== this.started;
      if ((!fresh || promised) && this.launched.names().includes('Listen'))
        this.fault('Listen on a review');
    }
    return { seen, want: this.wantToday() };
  }

  /** `need-walk`'s disk rule, the passages key held to what the removes leave. */
  override diskFaults() {
    const out = super.diskFaults();
    if (!this.removed) return out;
    const kept = out.filter((fault) => fault !== `changed ${KEY}` && fault !== 'passages written');
    const now = readRule(CORPUS, this.device.disk.get(KEY), 0);
    if (JSON.stringify(now) !== JSON.stringify(this.held)) kept.push('passages not as removed');
    return kept;
  }

  /** Home from Today's `Your field`, no plant chosen; the visit and the hold kept for `Begin`. */
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

  /** `Start here` on the chosen verse: the visit becomes what `startModel` starts, the hold kept. */
  async startHere(): Promise<unknown> {
    const rig = this.launched;
    const verse = this.chosen ?? '';
    const started = this.startOf(verse);
    if (started === null) return 'no start';
    this.trail.push(`start:${verse}`);
    if (!(await rig.tap(`Start here with ${verse}`))) return 'no Start here';
    this.bump(`start:${started.from}`);
    this.bump('root:start');
    if (started.item.reference !== verse) this.bump('start:phrase');
    if (this.hold !== null) this.bump('start:over-held');
    if (this.visit.some((each) => this.recallsNow(each.reference) <= each.recalls))
      this.bump('start:over-visit');
    const item: ModelVisitVerse = {
      reference: started.item.reference,
      recalls: started.item.recalls,
    };
    this.visit = [item];
    this.started = this.visit;
    this.chosen = null;
    this.screen = 'today';
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  /** `Begin` on home, which no choice may hide; the next arrival on home has none. */
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
   * A wait on home while `Begin` shows, then `Begin`: the clock moves by a
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

  /** `When I need…` on home; the next arrival on home has no choice. */
  override async need(): Promise<unknown> {
    this.chosen = null;
    return super.need();
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
    if (roll < 10) return this.planned() ? this.need() : this.relaunch();
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

  /** One command on Today: on a read garden `Your field` a quarter of the time, else one of `need-walk`'s. */
  override async todayStep(): Promise<unknown> {
    if (!this.device.unread && below(this.next, 4) === 0) return this.field();
    return super.todayStep();
  }
}

/** Walks the listed generated devices of `seed` (device `n` is `random(seed * 1000 + n)`, as `walkNeed` makes it) over a garden read or not, `steps` commands each, `Begin` on home after a wait when `waits`; answers the first failure (none when all held) and the coverage. */
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
