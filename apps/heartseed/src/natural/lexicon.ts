/**
 * The natural voice's pronunciation list and Kokoro's vocab as maps, the
 * shape `planOf` reads, built from the bundle's `virtual:heartseed-lexicon`
 * (`vite/lexicon.ts`) on the first call and kept for the process.
 */

import { Option } from 'effect';
import carried from 'virtual:heartseed-lexicon';

/** Each KJV word key's phonemes, and each phoneme symbol's Kokoro id. */
export interface Lexicon {
  readonly words: ReadonlyMap<string, string>;
  readonly vocab: ReadonlyMap<string, number>;
}

let built: Option.Option<Lexicon> = Option.none();

/** The lexicon, built once on its first call. */
export const lexicon = (): Lexicon =>
  Option.getOrElse(built, () => {
    const made: Lexicon = {
      words: new Map(Object.entries(carried.lists.us)),
      vocab: new Map(Object.entries(carried.vocab)),
    };
    built = Option.some(made);
    return made;
  });
