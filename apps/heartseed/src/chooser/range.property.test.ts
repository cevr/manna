/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals -- the property names a wrong answer by its JSON, and converts the model's undefined to the app's Option and back as plain branches. */

/**
 * The range a reader taps (hspassage C1). Its seam: `tapVerse`, judged
 * against the rule written plainly (`test/choose-model.ts`'s `tapRule`).
 *
 * It catches a range not clipped, clipped at 21 or at 19, clipped one way
 * only, a tap on the one verse that does not clear it, a tap on a range of
 * more than one verse that extends it instead of starting again, and a tap
 * outside the chapter (0, past its end, a fraction, NaN, a negative) taken.
 * It misses nothing of the screen: the chooser's tests draw the range.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { tapVerse, type Verses } from '../chooser';
import { fitsChapter, MOST, tapRule, type Chosen } from '../test/choose-model';
import { below, random } from '../test/garden-model';

const toOption = (chosen: Chosen | undefined): Option.Option<Verses> =>
  chosen === undefined ? Option.none() : Option.some(chosen);

const fromOption = (chosen: Option.Option<Verses>): Chosen | undefined =>
  Option.isNone(chosen) ? undefined : { first: chosen.value.first, last: chosen.value.last };

const same = (a: Chosen | undefined, b: Chosen | undefined) =>
  a === undefined ? b === undefined : b !== undefined && a.first === b.first && a.last === b.last;

/** Chapter lengths that sit at the rule's edges: a stand-in of 1, Psalms 117's 2, around 20 and 40, and Psalms 119's 176. */
const COUNTS = [1, 2, 3, 5, 19, 20, 21, 22, 39, 40, 41, 176] as const;

/** No range, and every range of 1-20 verses inside a chapter of `count`. */
const statesOf = (count: number): ReadonlyArray<Chosen | undefined> => {
  const states: Array<Chosen | undefined> = [undefined];
  for (let first = 1; first <= count; first++)
    for (let last = first; last <= Math.min(count, first + MOST - 1); last++)
      states.push({ first, last });
  return states;
};

/** Taps outside every chapter's verses: fractions, a negative and NaN. */
const ODD_TAPS = [-1, 0.5, 1.5, 2.25, Number.NaN, Infinity] as const;

/** Checks one tap against the model; answers a fault line, or none. */
const judge = (chosen: Chosen | undefined, verse: number, count: number): string | undefined => {
  const got = fromOption(tapVerse(toOption(chosen), verse, count));
  const want = tapRule(chosen, verse, count);
  if (!same(got, want) || !fitsChapter(got, count))
    return `count=${count} chosen=${JSON.stringify(chosen)} tap=${verse}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`;
  return undefined;
};

/** The kind of a tap, by what the model says it does, so each kind's floor can be held. */
const kindOf = (chosen: Chosen | undefined, verse: number, count: number): string => {
  if (!Number.isInteger(verse) || verse < 1 || verse > count) return 'outside';
  if (chosen === undefined) return 'start';
  if (chosen.first < chosen.last) return 'restart';
  if (verse === chosen.first) return 'clear';
  const span = Math.abs(verse - chosen.first) + 1;
  const way = verse > chosen.first ? 'forward' : 'back';
  return span > MOST ? `${way}:clipped` : `${way}:whole`;
};

/** A generated range in a chapter of `count`: none, one verse, or a run of 1-20. */
const chosenIn = (next: () => number, count: number): Chosen | undefined => {
  const roll = below(next, 4);
  const first = 1 + below(next, count);
  if (roll === 0) return undefined;
  if (roll === 1) return { first, last: first };
  return { first, last: Math.min(count, first + below(next, MOST)) };
};

/** A generated tap near verse `at`: on it, forward or back by up to 30, outside the chapter, or anywhere. */
const tapNear = (next: () => number, at: number, count: number): number => {
  const roll = below(next, 8);
  if (roll === 0) return at;
  if (roll === 1) return at + 1 + below(next, 30);
  if (roll === 2) return at - 1 - below(next, 30);
  if (roll === 3) return [0, count + 1, at + 0.5, Number.NaN][below(next, 4)] ?? 0;
  return below(next, count + 2);
};

describe('the range a reader taps', () => {
  it('answers as the rule does over every range and every tap, in chapters at its edges', () => {
    const faults: string[] = [];
    const tally = new Map<string, number>();
    for (const count of COUNTS)
      for (const chosen of statesOf(count))
        for (const verse of [...Array.from({ length: count + 2 }, (_, at) => at), ...ODD_TAPS]) {
          const fault = judge(chosen, verse, count);
          if (fault !== undefined && faults.length < 5) faults.push(fault);
          const kind = kindOf(chosen, verse, count);
          tally.set(kind, (tally.get(kind) ?? 0) + 1);
        }
    expect(faults).toEqual([]);
    for (const kind of [
      'outside',
      'start',
      'restart',
      'clear',
      'forward:whole',
      'forward:clipped',
      'back:whole',
      'back:clipped',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThan(100);
  });

  it('answers as the rule does over generated chapters, ranges and taps, every answer choosable', () => {
    const next = random(15_1);
    const faults: string[] = [];
    for (let n = 0; n < 20_000; n++) {
      const count = 1 + below(next, 176);
      const chosen = chosenIn(next, count);
      const verse = tapNear(next, chosen?.first ?? 1 + below(next, count), count);
      const fault = judge(chosen, verse, count);
      if (fault !== undefined && faults.length < 5) faults.push(fault);
    }
    expect(faults).toEqual([]);
  });

  it('folds long tap sequences as the rule does, every range on the way choosable', () => {
    const next = random(41_10);
    const faults: string[] = [];
    for (let chapter = 0; chapter < 40; chapter++) {
      const count = [1, 2, 19, 20, 21, 40, 176, 1 + below(next, 176)][chapter % 8] ?? 1;
      let app: Option.Option<Verses> = Option.none();
      let model: Chosen | undefined = undefined;
      for (let tap = 0; tap < 500; tap++) {
        const roll = below(next, 6);
        const verse =
          roll === 0 && model !== undefined
            ? model.first
            : roll === 1
              ? ([0, count + 1, 1.5, Number.NaN][below(next, 4)] ?? 0)
              : 1 + below(next, count);
        app = tapVerse(app, verse, count);
        model = tapRule(model, verse, count);
        const got = fromOption(app);
        if ((!same(got, model) || !fitsChapter(got, count)) && faults.length < 5)
          faults.push(
            `count=${count} tap #${tap} on ${verse}: got ${JSON.stringify(got)}, want ${JSON.stringify(model)}`,
          );
      }
    }
    expect(faults).toEqual([]);
  });

  it('holds at the edges a reader meets: Psalms 119 forward and back past 20, Psalms 117 whole, the one verse cleared', () => {
    const tap = (chosen: Chosen | undefined, verse: number, count: number) =>
      fromOption(tapVerse(toOption(chosen), verse, count));
    expect(tap({ first: 1, last: 1 }, 30, 176)).toEqual({ first: 1, last: 20 });
    expect(tap({ first: 30, last: 30 }, 1, 176)).toEqual({ first: 11, last: 30 });
    expect(tap({ first: 157, last: 157 }, 176, 176)).toEqual({ first: 157, last: 176 });
    expect(tap({ first: 1, last: 1 }, 2, 2)).toEqual({ first: 1, last: 2 });
    expect(tap({ first: 5, last: 5 }, 5, 21)).toBeUndefined();
    expect(tap({ first: 1, last: 5 }, 3, 21)).toEqual({ first: 3, last: 3 });
    expect(tap(undefined, 22, 21)).toBeUndefined();
    expect(tap({ first: 2, last: 2 }, 0, 21)).toEqual({ first: 2, last: 2 });
  });
});
