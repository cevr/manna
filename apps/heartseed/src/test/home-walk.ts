/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- the rendered walk plays each generated device's commands one after another through the screen rig's promise-based taps, over a disk in a plain map, and writes expected values as plain branches. */

/**
 * Home A's field as a reader meets it, walked through the root
 * (`test/need-rig.tsx`) over `need-walk.ts`'s generated devices, the layer
 * teaching Fear, every frame of the field also held to `homeFaults`.
 *
 * Its commands, beside `need-walk`'s (`Say it`, `Next`, a Minutes tap,
 * When I need…, a relaunch the next morning): open the field from Today;
 * on the field, a tap on a plant drawn from each class the field holds (a
 * ready review, today's new piece, a verse whose open item is a phrase, a
 * planted verse whose item is done, a planted verse not in the plan, a
 * verse not planted, a loose verse), a tap on the chosen plant again,
 * `Start here`, `Begin`, the bar's `Today`, and, with nothing held, a
 * landed `Remove <reference>` then `Remove`.
 *
 * The oracle, apart from the app's code: the walk's plan, hold and visit
 * as `need-walk` keeps them; the chosen verse; the furrows as
 * `furrowsModel` gives them over `listsModel`'s lists and the disk's
 * recalls, ready by `readyModel` over the plan; the foot's card by
 * `countsModel` and the walk's shown verse (`Begin` exactly with one shown),
 * or the chosen line and `Start here with <reference>` exactly when
 * `startModel` starts something (the canon by `placesOf`); the greeting by
 * `greetingModel` in the host's zone at the clock's now. A `Start here`
 * makes the visit the one verse `startModel` gives and keeps the hold; a
 * remove drops its span and makes the plan again. After every command the
 * field or Today is held to the model, and the disk to `need-walk`'s rule
 * (the passages key only as the removes leave it).
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
import { launchNeed } from './need-rig';
import { OWN_ROW, plantsOf, TAUGHT_IDS, Walk, type Coverage } from './need-walk';
import { KEY, readRule, spanRef, type Held } from './passages-model';
import { CORPUS } from './passages-rig';
import { verseOfRule } from './phrase-model';
import { startModel, type ModelVisitVerse } from './promise-model';
import { countsModel } from './session-model';

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
  shownField = false;
  removed = false;
  /** The visit the last `Start here` made, while it is the visit. */
  started: readonly ModelVisitVerse[] | null = null;

  /** The launch with home A's rules held on the field's frames. */
  override async launch() {
    if (this.rig !== null) await this.rig.leave();
    this.rig = await launchNeed(this.device, this.time, undefined, 1, onField);
    this.shownField = false;
    this.chosen = null;
    this.make();
    this.bump('made:launch');
    await this.launched.until(() => this.launched.headings().includes('Today'));
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
    );
  }

  /** The field the model gives: the furrows, the selection, the foot's card and the greeting. */
  wantField() {
    const furrows = this.furrows();
    const plants = furrows.flatMap((furrow) => furrow.plants);
    const chosen = plants.find((plant) => plant.reference === this.chosen);
    const begin = this.planned() && this.shown() !== null;
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
        : this.planned()
          ? {
              card: 'begin-card',
              line: countsModel(this.plan, this.recallsNow),
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
      greeting: greetingModel(Intl.DateTimeFormat().resolvedOptions().timeZone, this.time.now ?? 0),
    };
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
        line: text(card?.querySelector('[data-testid="counts"]') ?? card?.firstElementChild),
        controls: [...(card?.querySelectorAll('[role="button"]') ?? [])].map(nameOf),
      },
      greeting: `${text(greeting)} ${iconOf(greeting?.querySelector('img'))}`,
    };
  }

  async settleField() {
    const want = JSON.stringify(this.wantField());
    await this.launched.until(() => JSON.stringify(this.seenField()) === want);
    return { seen: this.seenField(), want: this.wantField() };
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

  /** Opens the field from Today's `Your field`. */
  override async field(): Promise<unknown> {
    const rig = this.launched;
    this.trail.push('field');
    if (!(await rig.tap('Your field'))) return 'no Your field';
    await rig.until(() => rig.headings().includes('Your field'));
    this.shownField = true;
    this.chosen = null;
    this.bump('field:opened');
    const plants = this.furrows().flatMap((furrow) => furrow.plants);
    if (plants.some((plant) => plant.ready)) this.bump('home:dot');
    if (plants.some((plant) => !plant.ready && plant.stage !== 'not planted'))
      this.bump('home:no-dot');
    if (this.planned()) this.bump(this.shown() === null ? 'home:no-begin' : 'home:begin');
    this.bump(`greeting:${this.wantField().greeting.split(' ')[1] ?? ''}`);
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
    this.shownField = false;
    await rig.until(() => rig.headings().includes('Today'));
    return null;
  }

  async leaveBy(label: string): Promise<unknown> {
    const rig = this.launched;
    this.trail.push(label.toLowerCase());
    if (!(await rig.tap(label))) return `no ${label}`;
    this.chosen = null;
    this.shownField = false;
    await rig.until(() => rig.headings().includes('Today'));
    return null;
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

  /** One command on the field. */
  async fieldStep(): Promise<unknown> {
    const roll = below(this.next, 20);
    if (roll < 2 && this.chosen !== null) return this.tap(this.chosen, 'again');
    if (roll < 6 && this.chosen !== null && this.startOf(this.chosen) !== null)
      return this.startHere();
    if (roll < 8 && this.chosen === null && this.planned() && this.shown() !== null)
      return this.leaveBy('Begin');
    if (roll < 10) return this.leaveBy('Today');
    if (
      roll < 12 &&
      this.hold === null &&
      this.held.tag === 'Read' &&
      this.held.passages.length > 0
    )
      return this.remove();
    return this.tapPlant();
  }

  /** One generated command: on the field one of its own, on Today the field a quarter of the time, else one of `need-walk`'s. */
  override async step(): Promise<unknown> {
    if (this.shownField) return this.fieldStep();
    if (below(this.next, 4) === 0) return this.field();
    return super.step();
  }
}

/** Walks the listed generated devices of `seed` (device `n` is `random(seed * 1000 + n)`, as `walkNeed` makes it), `steps` commands each; answers the first failure (none when all held) and the coverage. */
export const walkHome = async (seed: number, devices: ReadonlyArray<number>, steps: number) => {
  const cover: Coverage = {};
  for (const n of devices) {
    const walk = new HomeWalk(random(seed * 1000 + n), cover);
    await walk.launch();
    const first = await walk.settleToday();
    if (JSON.stringify(first.seen) !== JSON.stringify(first.want))
      return { failure: { device: n, at: 'launch', ...first }, cover };
    for (let s = 0; s < steps; s++) {
      const wrong = await walk.step();
      if (wrong !== null) return { failure: { device: n, trail: walk.trail, wrong }, cover };
      const shown = walk.shownField ? await walk.settleField() : await walk.settleToday();
      const disk = walk.diskFaults();
      if (JSON.stringify(shown.seen) !== JSON.stringify(shown.want) || disk.length > 0)
        return { failure: { device: n, trail: walk.trail, ...shown, disk }, cover };
    }
    const faults = [...walk.launched.faults];
    await walk.launched.leave();
    if (faults.length > 0) return { failure: { device: n, faults }, cover };
  }
  return { failure: null, cover };
};
