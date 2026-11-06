/* oxlint-disable effect/noNullish -- the model writes the spec's rules out as plain branches over undefined, apart from the app's Option code, so the two cannot share a mistake. */

/**
 * The independent model of choosing passages, written plainly from the
 * spec's rules (hspassage C1, C3-C8) for the tests to judge the app by.
 * Ranges, references and pieces come from `./passages-model.ts`; nothing
 * here reads `src/chooser.ts`, `src/field.ts`, `src/passages.ts` or a
 * screen. A range of one chapter is a `Chosen`, and `undefined` is none.
 */
export interface Chosen {
  readonly first: number;
  readonly last: number;
}

/** C1's cap: a range spans at most this many verses. */
export const MOST = 20;

/**
 * C1: the range after a tap on `verse` of a chapter of `count` verses.
 * A tap on no verse of the chapter leaves the range; with none, or with
 * more than one verse chosen, the tap chooses that verse alone; a tap on
 * the one verse chosen clears it; a tap after it ends the range there, and
 * one before it starts the range there, each at most 20 verses from the
 * verse chosen first.
 */
export const tapRule = (
  chosen: Chosen | undefined,
  verse: number,
  count: number,
): Chosen | undefined => {
  const whole = Number.isFinite(verse) && Math.floor(verse) === verse;
  if (!whole || verse < 1 || verse > count) return chosen;
  if (chosen === undefined) return { first: verse, last: verse };
  if (chosen.first < chosen.last) return { first: verse, last: verse };
  const at = chosen.first;
  if (verse === at) return undefined;
  if (verse > at) {
    let last = verse;
    if (last - at + 1 > MOST) last = at + MOST - 1;
    return { first: at, last };
  }
  let first = verse;
  if (at - first + 1 > MOST) first = at - MOST + 1;
  return { first, last: at };
};

/** C1's promise: `chosen` is none, or a range of 1-20 whole verses inside a chapter of `count`. */
export const fitsChapter = (chosen: Chosen | undefined, count: number): boolean => {
  if (chosen === undefined) return true;
  const { first, last } = chosen;
  if (!Number.isInteger(first) || !Number.isInteger(last)) return false;
  return first >= 1 && first <= last && last <= count && last - first + 1 <= MOST;
};
