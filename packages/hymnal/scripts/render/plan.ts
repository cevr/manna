import type { Voices } from '../../src/voices.js';
import { type StemNote, stemNotes } from './stems.js';
import type { Stem, Style } from './style.js';

export const stemSeed = (hymn: number, style: Pick<Style, 'name'>, stem: Pick<Stem, 'name'>) =>
  `${String(hymn).padStart(3, '0')}-${style.name}-${stem.name}`;

export const planOf = (
  parts: Voices,
  style: Pick<Style, 'name' | 'stems' | 'humanise'>,
  hymn: number,
): ReadonlyArray<{ readonly stem: Stem; readonly notes: ReadonlyArray<StemNote> }> =>
  style.stems.map((stem) => ({
    stem,
    notes: stemNotes(parts, stem, stemSeed(hymn, style, stem), style.humanise),
  }));
