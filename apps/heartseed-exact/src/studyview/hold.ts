/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): plain offsets over plain spans. */

/** A word's span in its verse's shown text. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** The prefix the chapter draws before a verse's words: its number and a space. */
export const holdPrefix = (verse: number): number => `${verse} `.length;

/** A selection's start in the drawn text, as an offset in the verse's own words. */
export const holdOffset = (verse: number, start: number): number => start - holdPrefix(verse);

/**
 * The index of the word whose span holds `offset` in `words` (in order, as
 * `StudyWords` gives them); on the space after a word, that word; -1 for
 * an offset before the first word or past the last.
 */
export const holdWord = (words: ReadonlyArray<Span>, offset: number): number => {
  if (!Number.isInteger(offset) || offset < 0) return -1;
  let found = -1;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (word === undefined || word.start > offset) break;
    found = index;
  }
  if (found < 0) return -1;
  const last = words[words.length - 1];
  return last !== undefined && offset >= last.end ? -1 : found;
};

/**
 * Whether a selection is a hold: something selected and no white space in
 * it. A long press or a double tap selects one word; a drag across words
 * is a reader copying, which the sheet leaves alone, and a cleared
 * selection (nothing selected) is no hold.
 */
export const isHold = (text: string): boolean => text !== '' && !/\s/u.test(text);
