/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a fingering, a key or a chord the current app's decoders leave out is undefined, and its rules branch plainly. */

/**
 * The hymn page with chords on: each section as the current hymnal shows
 * it (`sectionsOf` over its Simple chords, the current app's default
 * style), each sung line as its words, each word as its syllables, and over
 * each syllable the chords that change on it, spelled in the key the
 * hymn's move reaches (`playedKey`, `Chord.format`). A part the chords do
 * not cover is its words alone. Chords off, the page answers the `off`
 * form and decodes nothing; a hymn the bundle has no chord for answers
 * `none`, and the view shows its words as before.
 *
 * Ids follow the current app's: section `k`, line `i` and syllable `j`
 * of the line, each from 1 (`line-<k>-<i>`, `chord-<k>-<i>-<j>`); a word
 * carries its first syllable's `j`, so its `b`th syllable (from 0) is
 * `at + b`. The answer is kept small, as the longest hymn's is hundreds of
 * syllables: a syllable is its text (a hyphen after it where its word goes
 * on), its chords and its shape's code.
 */

import {
  type decodeHymn,
  hasChords,
  type HymnChords,
  keyName,
  type Move,
  playedKey,
  sectionsOf,
  soundingKey,
  type Word,
} from '@manna/hymnal-app/hymns/chords';
import { simple } from '@manna/hymnal-app/hymns/simple';
import type { Key } from '@manna/hymnal/chord';
import { format } from '@manna/hymnal/chord';

import type { Book } from '../hymns/book.ts';
import { pageAt } from '../hymn/page.ts';
import { canStep, moveOf } from './move.ts';
import { chordsCode, keyCode } from './shape.ts';

/**
 * A syllable with the chords over it: its text, with a hyphen where its
 * word goes on; `chord` "" where none changes; `grip` its chords' part of
 * the shape's route (the page's `code`, `_`, then this), "" where it has none.
 */
export interface ChordsBox {
  readonly text: string;
  readonly chord: string;
  readonly grip: string;
}

/** A word: `at` its first syllable's place in the line, from 1, and its syllables. */
export interface ChordsWord {
  readonly at: number;
  readonly boxes: Array<ChordsBox>;
}

export interface ChordsLine {
  readonly at: number;
  readonly words: Array<ChordsWord>;
}

/**
 * A section: its key and label as the words-alone page has them, and its
 * lines under chords; a part the chords do not cover has no lines and its
 * words as one `text`.
 */
export interface ChordsPart {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  readonly lines: Array<ChordsLine>;
}

/**
 * The page's chords: `kind` is `off` (chords off, nothing decoded), `none`
 * (the hymn has no chords; its words show as before) or `chords`; the keys
 * named, the played key's `code` for the shape's route, the move, and
 * whether the capo can go down or up.
 */
export interface ChordsPage {
  readonly number: number;
  readonly kind: string;
  readonly played: string;
  readonly sounding: string;
  readonly code: string;
  readonly transpose: number;
  readonly capo: number;
  readonly capoDown: boolean;
  readonly capoUp: boolean;
  readonly parts: Array<ChordsPart>;
}

/** A hymn's chords as shipped (its number and string) and how they are decoded; a test counts the decodes. */
export interface ChordsShipped {
  readonly encoded: ReadonlyMap<number, string>;
  readonly decode: (encoded: string) => ReturnType<typeof decodeHymn>;
}

const blank = (number: number, kind: string): ChordsPage => ({
  number,
  kind,
  played: '',
  sounding: '',
  code: '',
  transpose: 0,
  capo: 0,
  capoDown: false,
  capoUp: false,
  parts: [],
});

const lineOf = (words: ReadonlyArray<Word>, at: number, key: Key): ChordsLine => {
  let syllables = 0;
  return {
    at,
    words: words.map((word) => {
      const first = syllables + 1;
      syllables += word.length;
      return {
        at: first,
        boxes: word.map((box, b) => ({
          text: b < word.length - 1 ? `${box.text}-` : box.text,
          chord: box.chords.map((chord) => format(chord, key)).join(' '),
          grip: chordsCode(box.chords, key),
        })),
      };
    }),
  };
};

/** The page of `chords` (decoded, in the current app's default style) over hymn `number`'s words, at `move`. */
const chordedPage = (book: Book, number: number, chords: HymnChords, move: Move): ChordsPage => {
  const page = pageAt(book, `${number}`);
  const [text] = book.hymns.filter((hymn) => hymn.number === number);
  if (text === undefined || !hasChords(chords)) return blank(number, 'none');
  const shown = simple(chords);
  const played = playedKey(shown.key, move);
  const sections = sectionsOf(text, shown);
  return {
    number,
    kind: 'chords',
    played: keyName(played),
    sounding: keyName(soundingKey(shown.key, move)),
    code: keyCode(played),
    transpose: move.transpose,
    capo: move.capo,
    capoDown: canStep(move, 'capo-down'),
    capoUp: canStep(move, 'capo-up'),
    parts: page.parts.map((part, k) => {
      const section = sections[k];
      if (section === undefined || section._tag === 'Words') return { ...part, lines: [] };
      return {
        key: part.key,
        label: part.label,
        text: '',
        lines: section.lines.map((words, i) => lineOf(words, i + 1, played)),
      };
    }),
  };
};

/**
 * The page's chords for the route's hymn (`100`), chords `on` or off, at
 * the hymn's move in `moves`: `off` without decoding anything while chords
 * are off or the route names no hymn.
 */
export const chordsPageAt = (
  book: Book,
  shipped: ChordsShipped,
  route: string,
  on: boolean,
  moves: ReadonlyArray<string>,
): ChordsPage => {
  const number = pageAt(book, route).number;
  if (!on || number === 0) return blank(number, 'off');
  const encoded = shipped.encoded.get(number);
  if (encoded === undefined) return blank(number, 'none');
  const decoded = shipped.decode(encoded);
  if (decoded._tag === 'None') return blank(number, 'none');
  return chordedPage(book, number, decoded.value, moveOf(moves, number));
};
