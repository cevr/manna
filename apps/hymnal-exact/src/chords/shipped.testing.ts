/* oxlint-disable effect/noTernary, effect/noNullish -- a test helper reading the current app's decoded chords as plain values. */

/**
 * The chords the build ships, for the chords' tests: every hymn's string as
 * the current app's `vite/chords.ts` makes it (the same `make.ts` writes to
 * `chords.gen.ts`), read once per test run; the current app's own decoding
 * of them (`chordBook`); and what the current app shows over a hymn at a
 * move, which the port's answers are held to.
 */

import * as Chord from '@manna/hymnal/chord';
import {
  chordBook,
  hasChords,
  keyName,
  type Move,
  playedKey,
  sectionsOf,
  soundingKey,
} from '@manna/hymnal-app/hymns/chords';
import { type ChordStyle, styled } from '@manna/hymnal-app/hymns/simple';
import type { Placement } from '@manna/hymnal/placement';
import { readChords } from '@manna/hymnal-app/vite/chords';

import { book } from '../hymns/book.ts';
import type { ChordsPage } from './page.ts';
import { drawnText } from './rows.ts';

export const bundled = readChords();

/** The current app's decoding of the shipped chords, each hymn decoded once and kept. */
export const currentBook = chordBook(bundled);

/**
 * What the current app shows over hymn `number` at `move`, with chords on
 * in `style` at `placement` (its defaults, Simple on the beat, unless
 * given), as its `HymnPage` reads them: `chordBook(...).of(number,
 * placement)`, kept where `hasChords`, `styled` in the style. The keys
 * named, and each section as `words` or its lines' words of `[syllable,
 * chords]` (a hyphen after a syllable its word goes on from); `none` for a
 * hymn with no chords.
 */
export const shownByCurrent = (
  number: number,
  move: Move,
  style: ChordStyle = 'simple',
  placement: Placement = 'beat',
) => {
  const text = book.hymns.find((hymn) => hymn.number === number);
  const chords = currentBook.of(number, placement);
  if (text === undefined || chords._tag === 'None' || !hasChords(chords.value)) return 'none';
  const shown = styled(chords.value, style);
  const key = playedKey(shown.key, move);
  return {
    played: keyName(key),
    sounding: keyName(soundingKey(shown.key, move)),
    sections: sectionsOf(text, shown).map((section) =>
      section._tag === 'Words'
        ? 'words'
        : section.lines.map((words) =>
            words.map((word) =>
              word.map((box, b) => [
                b < word.length - 1 ? `${box.text}-` : box.text,
                box.chords.map((c) => Chord.format(c, key)).join(' '),
              ]),
            ),
          ),
    ),
  };
};

/** The port's answer in the terms of `shownByCurrent`. */
export const shownByPort = (page: ChordsPage) => {
  if (page.kind === 'none') return 'none';
  return {
    played: page.played,
    sounding: page.sounding,
    sections: page.parts.map((part) =>
      part.lines.length > 0
        ? part.lines.map((line) =>
            line.words.map((word) =>
              word.boxes.map((box, b) => [drawnText(box, b < word.boxes.length - 1), box.chord]),
            ),
          )
        : 'words',
    ),
  };
};
