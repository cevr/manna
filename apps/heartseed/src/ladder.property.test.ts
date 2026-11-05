/* oxlint-disable effect/noNullish, effect/noTernary -- the property builds generated histories with plain loops and compares the garden's Option-built answers with a model written over undefined. */

/**
 * The ladder (cues that fade) as a pure rule: the garden's `stageOf`,
 * `cueIn` and `growthOf` against the spec's rule written plainly over
 * ts-fsrs (`test/garden-model.ts`), after every recall of generated
 * histories, each handed over in a shuffled order beside other verses whose
 * references are the passage's prefixes, extensions and look-alikes.
 *
 * It catches a stage that takes a recall's help from anywhere but a peek or
 * the cue of the stage before it (the stage after it, the grade, the
 * suggestion, only the recall after planting), one that forgets that Again
 * brings the letters back, a cue read off another verse's plant, and a fold
 * that reads input order instead of time order. It misses the screen and the
 * press, which the screen tests own.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { cueIn, growthOf, plantOf, stageOf } from './garden';
import type { Recall } from './sayit';
import {
  below,
  DAY,
  growthRule,
  MINUTE,
  pickOf,
  random,
  referenceCue,
  referenceStage,
} from './test/garden-model';

/** The passage the histories grow, and the verses beside it: its prefixes and extensions, a trailing space, an accent and a slash. */
const PASSAGE = 'Isaiah 41:10';
const NEIGHBOURS = ['Isaiah 41:1', 'Isaiah 41:100', 'Isaiah 41:10 ', 'Ésaïe 41:10', 'x/y 2:3'];

type Course = 'planted' | 'again' | 'cued blade' | 'peeked blade' | 'ear' | 'random' | 'full corn';

const COURSES: readonly [Course, ...Course[]] = [
  'planted',
  'again',
  'cued blade',
  'peeked blade',
  'ear',
  'random',
  'full corn',
];

/** One recall at `startedAt` under `grade`, with a peek (and its miss) when `peeked`. */
const said = (
  reference: string,
  startedAt: number,
  grade: Recall['grade'],
  peeked: boolean,
): Recall => ({
  reference,
  startedAt,
  grade,
  suggested: grade === 4 ? 3 : grade,
  words: 37,
  missed: peeked ? 1 : 0,
  peeked: peeked ? 1 : 0,
  extra: 0,
});

/**
 * A verse's history of one course (the spec's row 14), in time order: just
 * planted; Again anywhere; a blade said under letters or with a peek; an
 * ear; any grades and peeks; a Good run to full corn, then Again. Any
 * history runs on by up to five more recalls, minutes to 40 days apart.
 */
const historyOf = (next: () => number, reference: string, course: Course): Recall[] => {
  const clock = { at: Date.UTC(2026, 0, 1) + below(next, DAY) };
  const add = (grade: Recall['grade'], peeked = false, gap = 0) => {
    clock.at +=
      gap > 0 ? gap : next() < 0.4 ? (1 + below(next, 59)) * MINUTE : (1 + below(next, 40)) * DAY;
    return said(reference, clock.at, grade, peeked);
  };
  const grade = () => pickOf(next, [1, 2, 3, 3, 4] as const);
  const recalls: Recall[] = [add(pickOf(next, [2, 3] as const))];
  switch (course) {
    case 'planted':
      break;
    case 'again':
      for (let n = below(next, 4); n > 0; n -= 1) recalls.push(add(grade(), next() < 0.3));
      recalls.push(add(1));
      break;
    case 'cued blade':
      recalls.push(add(pickOf(next, [2, 3] as const)));
      break;
    case 'peeked blade':
      recalls.push(add(3), add(3), add(2, true));
      break;
    case 'ear':
      recalls.push(add(3), add(3));
      break;
    case 'random':
      for (let n = below(next, 8); n > 0; n -= 1) recalls.push(add(grade(), next() < 0.35));
      break;
    case 'full corn':
      for (let n = 0; n < 5; n += 1) recalls.push(add(3, false, 30 * DAY));
      recalls.push(add(1));
      break;
  }
  for (let n = below(next, 6); n > 0; n -= 1) recalls.push(add(grade(), next() < 0.35));
  return recalls;
};

describe('the ladder over generated histories', () => {
  it('stages, cues and grows 600 generated histories after every recall, from the recalls alone in any order, as the rule says', () => {
    const met = new Map<string, number>();
    const meet = (what: string) => met.set(what, (met.get(what) ?? 0) + 1);
    for (let seed = 1; seed <= 600; seed += 1) {
      const next = random(seed * 7919);
      const recalls = historyOf(next, PASSAGE, pickOf(next, COURSES));
      const others = NEIGHBOURS.filter(() => next() < 0.4).map((reference) =>
        historyOf(next, reference, pickOf(next, COURSES)),
      );
      const beside = others.flatMap((each) =>
        Arr.isReadonlyArrayNonEmpty(each) ? [[each[0].reference, plantOf(each)] as const] : [],
      );
      expect({ seed, cue: cueIn({ _tag: 'Read', plants: new Map(beside) }, PASSAGE) }).toEqual({
        seed,
        cue: 'full',
      });
      recalls.forEach((recall, k) => {
        const upTo = recalls.slice(0, k + 1);
        const shuffled = upTo.toSorted(() => next() - 0.5);
        if (!Arr.isReadonlyArrayNonEmpty(shuffled)) return;
        const plant = plantOf(shuffled);
        const plants = new Map([...beside, [PASSAGE, plant] as const]);
        const stage = referenceStage(upTo);
        const growth = growthRule(upTo, recall.startedAt);
        expect({
          seed,
          k,
          stage: stageOf(plant),
          cue: cueIn({ _tag: 'Read', plants }, PASSAGE),
          growth: Option.getOrUndefined(growthOf(plant, recall.startedAt)),
        }).toEqual({
          seed,
          k,
          stage,
          cue: referenceCue(upTo),
          growth: growth === undefined ? undefined : { from: growth.from, to: growth.to },
        });
        const before = k === 0 ? undefined : referenceStage(upTo.slice(0, -1));
        meet(stage);
        if (stage === 'blade' && recall.peeked === 0) meet('blade by cue alone');
        if (stage === 'ear' && before !== 'seed') meet('ear alone');
        if (k > 0 && recall.grade === 1 && stage === 'seed') meet('Again back to letters');
        if (growth !== undefined) meet(`${growth.from}>${growth.to}`);
      });
    }
    const floors = {
      seed: 600,
      blade: 400,
      ear: 150,
      'full corn': 300,
      'blade by cue alone': 250,
      'ear alone': 150,
      'Again back to letters': 250,
      'seed>blade': 300,
      'blade>ear': 120,
    };
    expect(Object.entries(floors).filter(([what, floor]) => (met.get(what) ?? 0) < floor)).toEqual(
      [],
    );
  });
});
