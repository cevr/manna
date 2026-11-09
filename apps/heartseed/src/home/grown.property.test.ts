/* oxlint-disable effect/noGlobals -- the property tallies its kinds in plain maps and names a wrong case by its references as JSON text. */

/**
 * What grew in a run (hshomebase H9) at its pure seam, against
 * `test/home-model.ts`'s `grownModel`, whose stages come from the garden
 * model's stage rule over ts-fsrs over the first k recalls in time order.
 *
 * Each case is a plan `planModel` makes over pieces with histories
 * (phrases, joins, the new piece), then a run over it: each item left, its
 * recital refused (nothing kept), or kept at any grade, Again included,
 * helped by a peek or not.
 *
 * It catches Again or an equal stage counted as growth, a verse planted
 * from nothing left out, a verse listed twice for two of its phrases, a
 * phrase's own stage shown for its verse, and an item not done counted.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr } from 'effect';

import { plantOf, type Plant, type ReadGarden } from '../garden';
import type { Recall } from '../sayit';
import { recallOf } from '../test/field-model';
import { pickOf, random } from '../test/garden-model';
import { grownModel, plannedOf } from '../test/home-model';
import { verseOfRule } from '../test/phrase-model';
import { MINUTE } from '../test/session-model';
import { grownOf } from './grown';

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
  const done: string[] = [];
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
    done.push(verseOfRule(item.reference));
    if (grade === 1 && item.recalls > 0) bump(tally, 'Again drop');
    if (item.recalls === 0) bump(tally, 'planted from nothing');
    if (item.fresh) bump(tally, 'done new piece');
    if (verseOfRule(item.reference) !== item.reference) bump(tally, 'done phrase');
  });
  if (new Set(done).size < done.length) bump(tally, 'a verse done twice');
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
    for (const [kind, floor] of [
      ['Again drop', 20],
      ['planted from nothing', 10],
      ['done new piece', 20],
      ['done phrase', 20],
      ['refused', 20],
      ['a verse done twice', 10],
      ['some grew', 30],
      ['some did not grow', 30],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });
});
