/**
 * The pieces of a verse an earlier build kept: a long verse was once learned
 * in runs of its words, each run's recalls stored under the verse's
 * reference and its word numbers (`John 3:16 [1-6]`). Nothing makes such a
 * piece now; their records stay, so the field folds each into its verse and
 * the session never plans one (`src/field.ts`, `src/session.ts`).
 */

import { Option } from 'effect';

const REFERENCE = /^([^[\]]+) \[([1-9]\d*)-([1-9]\d*)\]$/u;

/** What a piece's reference names: its verse's reference and its first and last word numbers (from 1). */
export interface PhraseRef {
  readonly verse: string;
  readonly first: number;
  readonly last: number;
}

/** A piece's reference as an earlier build stored it: its verse's, a space, then its word numbers in brackets (`John 3:16 [1-6]`). */
export const phraseReference = (verse: string, phrase: Pick<PhraseRef, 'first' | 'last'>): string =>
  `${verse} [${phrase.first}-${phrase.last}]`;

/**
 * The verse and word numbers a piece's reference names, read only from
 * `phraseReference`'s exact form: a verse part with no bracket, two safe
 * whole numbers from 1 with no leading zero, the first no later than the
 * last. Any other reference, a verse's among them, names no piece.
 */
export const phraseOf = (reference: string): Option.Option<PhraseRef> =>
  Option.fromNullishOr(REFERENCE.exec(reference)).pipe(
    Option.map(([, verse = '', first = '', last = '']) => ({
      verse,
      first: Number(first),
      last: Number(last),
    })),
    Option.filter(
      (phrase) =>
        Number.isSafeInteger(phrase.first) &&
        Number.isSafeInteger(phrase.last) &&
        phrase.first <= phrase.last,
    ),
  );
