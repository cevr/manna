/**
 * Each natural voice's pronunciation list (`LISTS`) and Kokoro's vocab as
 * maps, the shape `planOf` reads, built from the bundle's
 * `virtual:heartseed-lexicon` (`vite/lexicon.ts`) on a list's first call and
 * kept for the process.
 */

import { Option } from 'effect';
import carried from 'virtual:heartseed-lexicon';

import { LISTS, type NaturalVoice } from './manifest';

/** Each KJV word key's phonemes, and each phoneme symbol's Kokoro id. */
export interface Lexicon {
  readonly words: ReadonlyMap<string, string>;
  readonly vocab: ReadonlyMap<string, number>;
}

const built = new Map<string, Lexicon>();
let vocab: Option.Option<ReadonlyMap<string, number>> = Option.none();

/** The lexicon `voice` reads by (`LISTS`), each list built once on its first call. */
export const lexicon = (voice: NaturalVoice): Lexicon => {
  const list = LISTS[voice];
  return Option.getOrElse(Option.fromUndefinedOr(built.get(list)), () => {
    const symbols = Option.getOrElse(vocab, () => new Map(Object.entries(carried.vocab)));
    vocab = Option.some(symbols);
    const made: Lexicon = { words: new Map(Object.entries(carried.lists[list])), vocab: symbols };
    built.set(list, made);
    return made;
  });
};
