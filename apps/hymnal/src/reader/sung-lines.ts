/**
 * Where a hymn page's lines and syllables stand in the hymn as sung: each
 * section's first line's place, and each word's first syllable's place in
 * its line. The follow marks a line and a syllable by these places.
 */

import type { Word } from '../hymns/chords';
import type { Section } from '../hymns/hymns';

/** Each section's first line's place in the hymn as sung, from 0: the sections are its runs. */
export const firstLines = (sections: ReadonlyArray<Section>): ReadonlyArray<number> =>
  sections.reduce<Array<number>>((firsts, _, k) => {
    firsts.push((firsts[k - 1] ?? 0) + (sections[k - 1]?.lines.length ?? 0));
    return firsts;
  }, []);

/** Each word's first syllable's place in its line, from 0. */
export const wordStarts = (words: ReadonlyArray<Word>): ReadonlyArray<number> =>
  words.reduce<Array<number>>((starts, _, w) => {
    starts.push((starts[w - 1] ?? 0) + (words[w - 1]?.length ?? 0));
    return starts;
  }, []);
