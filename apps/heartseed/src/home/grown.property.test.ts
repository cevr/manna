/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property tallies its kinds in plain maps, names a wrong case by its references as JSON text, and reads the plain end model's null for Today not at the end. */

/**
 * What grew in a run (hshomebase H9) at its pure seam, against
 * `test/home-model.ts`'s `grownModel`, whose stages come from the garden
 * model's stage rule over ts-fsrs over the first k recalls in time order.
 *
 * Each case is a plan `planModel` makes over pieces with histories
 * (whole verses, old pieces stored beside some, the new piece), then a run
 * over it: each item left, its recital refused (nothing kept), or kept at
 * any grade, Again included, helped by a peek or not; no plan holds an old
 * piece.
 *
 * It catches Again or an equal stage counted as growth, a verse planted
 * from nothing left out, an old piece's stage shown for its verse, and an
 * item not done counted.
 *
 * The end of a run (`tendedOf`, H9) is held against `test/run-model.ts`'s
 * `tendedModel` over session views: a plan case with a visit of none, one
 * or several verses ahead of it (some the plan's own verses, some known to
 * the plan not at all), held or not, the garden read or not, no plan, an
 * empty run, and an item not done whose piece is gone. It catches the end
 * shown over an item held or left, `shownOf`'s `Done` over a missing piece
 * taken for the end, a visit's growth left out, and the run's order lost.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { plantOf, type Plant, type ReadGarden } from '../garden';
import type { Recall } from '../sayit';
import type { Item, TextPiece } from '../session';
import { shownOf } from '../session/run';
import type { SessionView } from '../session/service';
import { recallOf } from '../test/field-model';
import { below, DAY, pickOf, random } from '../test/garden-model';
import { grownModel, plannedOf } from '../test/home-model';
import { verseOfRule } from '../test/phrase-model';
import { tendedModel } from '../test/run-model';
import { MINUTE } from '../test/session-model';
import { grownOf, tendedOf } from './grown';

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

/** A read garden of `records`, each reference's plant folded by the garden. */
const gardenOf = (records: readonly Recall[]): ReadGarden => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of records)
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const plants = new Map<string, Plant>();
  for (const [reference, recalls] of byReference)
    if (Arr.isReadonlyArrayNonEmpty(recalls)) plants.set(reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

/** A run over a plan case: each item left, refused or kept at a grade, and what the case reaches. */
const runOf = (next: () => number, tally: Tally) => {
  const { at, records, items } = plannedOf(next);
  const after = [...records];
  items.forEach((item, index) => {
    const what = pickOf(next, ['left', 'refused', 'kept', 'kept', 'kept'] as const);
    if (what === 'left') return;
    if (what === 'refused') {
      bump(tally, 'refused');
      return;
    }
    const grade = pickOf(next, [1, 1, 2, 3, 3, 4] as const);
    const peeked = pickOf(next, [0, 0, 0, 1] as const);
    after.push(recallOf(item.reference, at + (index + 1) * MINUTE, grade, peeked));
    if (grade === 1 && item.recalls > 0) bump(tally, 'Again drop');
    if (item.recalls === 0) bump(tally, 'planted from nothing');
    if (item.fresh) bump(tally, 'done new piece');
    if (verseOfRule(item.reference) !== item.reference) bump(tally, 'planned old piece');
  });
  return { items, records: after };
};

describe('what grew', () => {
  it('is each verse of a done item whose stage rose over its baseline, in plan order, once, at its stage on the field now, as H9 makes it', () => {
    const next = random(7_401);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let run = 0; run < 300 && wrong.length < 3; run++) {
      const { items, records } = runOf(next, tally);
      const got = grownOf({ items }, gardenOf(records));
      const want = grownModel(items, records);
      if (JSON.stringify(got) !== JSON.stringify(want))
        wrong.push(`run ${run}: ${JSON.stringify(got)} where H9 has ${JSON.stringify(want)}`);
      if (want.length > 0) bump(tally, 'some grew');
      if (want.length < new Set(items.map((item) => verseOfRule(item.reference))).size)
        bump(tally, 'some did not grow');
    }
    expect(wrong).toEqual([]);
    expect(tally.get('planned old piece') ?? 0).toBe(0);
    for (const [kind, floor] of [
      ['Again drop', 20],
      ['planted from nothing', 10],
      ['done new piece', 20],
      ['refused', 20],
      ['some grew', 30],
      ['some did not grow', 30],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });
});

const pieceFor = (reference: string, group: string): TextPiece => ({
  reference,
  text: 'w',
  words: 1,
  group,
});

/** What a case holds that keeps Today off the end, by cause. */
type Cause = 'no plan' | 'unread' | 'held' | 'empty run' | 'an item not done';

/** The recalls `reference`'s plant holds in `garden`. */
const recallsIn = (garden: ReadGarden, reference: string) =>
  garden.plants.get(reference)?.recalls.length ?? 0;

/** A visit of none to three verses tapped at `at`, each a verse of the plan or one the plan does not hold, its history sown into `records` and its baseline its recalls at the tap. */
const visitOf = (next: () => number, plan: readonly Item[], records: Recall[], at: number) => {
  const visit: Item[] = [];
  for (let k = pickOf(next, [0, 0, 1, 1, 2, 3] as const); k > 0; k--) {
    const fromPlan = Arr.get(plan, below(next, Math.max(plan.length, 1))).pipe(
      Option.filter(() => pickOf(next, [true, false, false] as const)),
    );
    const reference = Option.match(fromPlan, {
      onNone: () => `Proverbs ${1 + below(next, 3)}:${1 + below(next, 4)}`,
      onSome: (item) => verseOfRule(item.reference),
    });
    if (visit.some((each) => each.reference === reference)) continue;
    for (let n = below(next, 3); n > 0; n--)
      records.push(
        recallOf(reference, at - (n * 4 + k) * DAY, pickOf(next, [1, 3, 3, 4] as const), 0),
      );
    const recalls = records.filter((recall) => recall.reference === reference).length;
    visit.push({ reference, fresh: false, recalls, seconds: 20 });
  }
  return visit;
};

/** A run over `run`'s items after `at`: every item kept, or each left, refused or kept; at any grade, or Again alone. */
const reciteOf = (next: () => number, run: readonly Item[], records: Recall[], at: number) => {
  const all = pickOf(next, [true, false] as const);
  const grades = pickOf(next, [[1, 1, 2, 3, 3, 4], [1]] as const);
  run.forEach((item, index) => {
    const what = all ? 'kept' : pickOf(next, ['left', 'refused', 'kept', 'kept'] as const);
    if (what !== 'kept') return;
    records.push(recallOf(item.reference, at + (index + 1) * MINUTE, pickOf(next, grades), 0));
  });
};

/** A view over a plan case, a visit ahead of it and a run over both, built to hold one cause that keeps Today off the end, or none. */
const viewCaseOf = (next: () => number) => {
  const built = pickOf(next, [
    'none',
    'none',
    'none',
    'none',
    'no plan',
    'unread',
    'held',
    'empty run',
  ] as const);
  const planned = plannedOf(next);
  const { at } = planned;
  const records = [...planned.records];
  const plan: Item[] = built === 'empty run' ? [] : [...planned.items];
  const visit = built === 'empty run' ? [] : visitOf(next, plan, records, at);
  const run = [...visit, ...plan];
  reciteOf(next, run, records, at);
  const visitRefs = new Set(visit.map((each) => each.reference));
  const pieces = plan.map((item) => pieceFor(item.reference, 'a'));
  const garden = gardenOf(records);
  const left = plan.filter(
    (item) => !visitRefs.has(item.reference) && recallsIn(garden, item.reference) <= item.recalls,
  );
  const gone = Arr.get(left, 0).pipe(
    Option.filter(() => pickOf(next, [true, false, false] as const)),
  );
  const held = Option.filter(
    Arr.get(run, below(next, Math.max(run.length, 1))),
    () => built === 'held',
  );
  const view: SessionView = {
    minutes: 5,
    plan: Option.filter(Option.some({ items: plan }), () => built !== 'no plan'),
    pieces: pieces.filter(
      (piece) => !Option.exists(gone, (item) => item.reference === piece.reference),
    ),
    held,
    heldPiece: Option.map(held, (item) => pieceFor(item.reference, 'a')),
    visit: visit.map((item) => ({ item, piece: pieceFor(item.reference, 'p') })),
  };
  return {
    view,
    garden: Option.filter(Option.some(garden), () => built !== 'unread'),
    records,
    plan,
    visit,
    run,
    gone: Option.isSome(gone),
  };
};

type ViewCase = ReturnType<typeof viewCaseOf>;

/** The causes `one` holds that keep Today off the end, read from the case itself. */
const causesOf = (one: ViewCase): Cause[] => {
  const read = gardenOf(one.records);
  const causes: Cause[] = [];
  if (Option.isNone(one.view.plan)) causes.push('no plan');
  if (Option.isNone(one.garden)) causes.push('unread');
  if (Option.isSome(one.view.held)) causes.push('held');
  if (one.run.length === 0) causes.push('empty run');
  if (one.run.some((item) => recallsIn(read, item.reference) <= item.recalls))
    causes.push('an item not done');
  return causes;
};

/** H9's end over `one`, by the plain model; null while the garden is unread. */
const wantOf = (one: ViewCase) => {
  if (Option.isNone(one.garden)) return null;
  const plan = Option.isSome(one.view.plan) ? one.plan : null;
  return tendedModel({ plan, hold: Option.getOrNull(one.view.held) }, one.visit, one.records);
};

/** What `tendedOf` gets wrong over case `one`, numbered `index`, and the kinds it reaches. */
const judge = (one: ViewCase, index: number, tally: Tally): string[] => {
  const { view, garden } = one;
  const state = () => JSON.stringify([view, Option.map(garden, (read) => [...read.plants])]);
  const before = state();
  const got = JSON.stringify(Option.getOrNull(tendedOf(view, garden)));
  const again = JSON.stringify(Option.getOrNull(tendedOf(view, garden)));
  const want = wantOf(one);
  const wrong: string[] = [];
  if (got !== JSON.stringify(want)) wrong.push(`${got} where H9 has ${JSON.stringify(want)}`);
  if (again !== got || state() !== before) wrong.push('not pure');
  const shown = shownOf(view, garden)._tag;
  if (want !== null && shown !== 'Done') wrong.push(`the end over ${shown}`);
  const causes = causesOf(one);
  if ((causes.length === 0) === (want === null))
    wrong.push(`the end ${want === null ? 'missing' : 'shown'} over [${causes.join(', ')}]`);
  if (causes.length === 1) bump(tally, `none: ${causes.join('')}`);
  if (one.gone && shown === 'Done' && want === null) bump(tally, 'Done over a missing piece');
  if (want !== null) wrong.push(...endFaults(one, want, tally));
  return wrong.map((line) => `case ${index}: ${line}`);
};

/** What the end's list gets wrong against `grownModel` over the run, and the kinds of end it is. */
const endFaults = (
  one: ViewCase,
  want: NonNullable<ReturnType<typeof tendedModel>>,
  tally: Tally,
): string[] => {
  const wrong: string[] = [];
  const model = JSON.stringify(grownModel(one.run, one.records));
  if (model !== JSON.stringify(want))
    wrong.push(`${JSON.stringify(want)} where grownModel has ${model}`);
  const names = want.map((grown) => grown.reference);
  if (new Set(names).size < names.length) wrong.push('a verse listed twice');
  bump(tally, `end: ${Math.min(want.length, 2)}`);
  const planVerses = new Set(one.plan.map((item) => verseOfRule(item.reference)));
  if (names.some((name) => !planVerses.has(name))) bump(tally, 'grown in the visit alone');
  if (one.visit.some((item) => planVerses.has(item.reference)))
    bump(tally, 'a verse in visit and plan');
  return wrong;
};

describe('the end of a run', () => {
  it('is what grew over the visit then the plan, once every item is done and none held, as H9 makes it, and never shownOf Done alone', () => {
    const next = random(9_203);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let index = 0; index < 700 && wrong.length < 3; index++)
      wrong.push(...judge(viewCaseOf(next), index, tally));
    expect(wrong).toEqual([]);
    for (const [kind, floor] of [
      ['none: no plan', 10],
      ['none: unread', 10],
      ['none: held', 10],
      ['none: empty run', 10],
      ['none: an item not done', 10],
      ['Done over a missing piece', 5],
      ['end: 0', 10],
      ['end: 1', 10],
      ['end: 2', 10],
      ['grown in the visit alone', 5],
      ['a verse in visit and plan', 5],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });
});
