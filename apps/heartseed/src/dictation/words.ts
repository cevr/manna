/**
 * A recognizer's runs as the matcher's spoken words, and the words a
 * recognizer is told to expect. Every snapshot the dictation service builds
 * from `wordsOf` is one the matcher accepts: each word is spoken text, each
 * time finite and at least 0, each end at least its start, and no start
 * before the floor or the word before it.
 */

import type { SpokenWord } from '../matcher';
import { isSpokenText, sourceWords, wordKey } from '../matcher/words';

/** A run of recognized text and its time, in milliseconds from the session's audio start. */
export interface DictationRun {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** The most words a listen hints to the recognizer. */
export const HINT_LIMIT = 100;

/** `value`, or `otherwise` when `value` is not a finite number. */
const finiteOr = (value: number, otherwise: number) => {
  if (Number.isFinite(value)) return value;
  return otherwise;
};

/** A run's time, or the floor when it has none: never below the floor or 0, and its end never before its start. */
const timeOf = (run: DictationRun, floor: number) => {
  const start = finiteOr(run.start, floor);
  const end = finiteOr(run.end, start);
  const low = Math.max(start, floor, 0);
  return { start: low, end: Math.max(end, low) };
};

/**
 * The words of `runs`: each run split at whitespace into its spoken words
 * (punctuation alone is dropped), its time shared evenly among them in
 * order, and no word starting before `floor` or the word before it.
 */
export const wordsOf = (
  runs: ReadonlyArray<DictationRun>,
  floor: number,
): readonly SpokenWord[] => {
  const words: SpokenWord[] = [];
  let low = floor;
  for (const run of runs) {
    const tokens = run.text.split(/\s+/u).filter(isSpokenText);
    const count = tokens.length;
    if (count === 0) continue;
    const { start, end } = timeOf(run, low);
    const share = end - start;
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: start + (share * i) / count,
        end: start + (share * (i + 1)) / count,
      });
    });
    low = start + (share * (count - 1)) / count;
  }
  return words;
};

/** The verse's distinct word keys in first-seen order, at most `HINT_LIMIT`: the words the recognizer is told to expect. */
export const hintsOf = (verse: string): readonly string[] => {
  const seen = new Set<string>();
  for (const word of sourceWords(verse)) {
    if (seen.size >= HINT_LIMIT) break;
    const key = wordKey(word);
    if (key.length > 0) seen.add(key);
  }
  return [...seen];
};
