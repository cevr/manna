/* oxlint-disable effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a fingering, a key or a chord the current app's decoders leave out is undefined, and its rules branch plainly. */

/**
 * The line rule: how a chorded line breaks into rows when it is wider than
 * the page. A syllable and the chord over it are one box (a pair), as wide
 * as the wider of the two, the chord at the box's left edge over the
 * syllable's first character, so no break can fall between them. Words
 * stay whole on a row, a gap apart; a word goes to the next row when it
 * does not fit after the last; a word wider than a whole row takes a row of
 * its own and breaks between its pairs, never inside one. No pair is
 * dropped or moved out of order.
 *
 * `features/hymn.contract` draws the rule as layout: a line is a wrapping
 * row of words, each word a wrapping row of pairs, each pair a column of
 * its chord over its syllable, so each host's text engine measures and
 * the rule breaks. `breaksOf` takes any widths (characters here; points
 * from the agent's layout in `tools/drive-chords.ts`).
 */

import type { ChordsLine } from './page.ts';

/** A pair's place: its word in the line and its box in the word, each from 0. */
export type Place = readonly [word: number, box: number];

/**
 * The rows of a line whose words' pairs are `words` wide (each word its
 * pairs' widths), on rows `width` wide with `gap` between two words; a
 * row but the first is set in by `indent`, the hanging indent, and so is
 * that much narrower.
 */
export const breaksOf = (
  words: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  gap: number,
  indent = 0,
): Array<Array<Place>> => {
  const rows: Array<Array<Place>> = [];
  let row: Array<Place> = [];
  let used = 0;
  const room = () => (rows.length === 0 ? width : width - indent);
  const close = () => {
    if (row.length > 0) rows.push(row);
    row = [];
    used = 0;
  };
  words.forEach((pairs, w) => {
    const wide = pairs.reduce((sum, pair) => sum + pair, 0);
    if (row.length > 0 && used + gap + wide <= room()) {
      row.push(...pairs.map((_, b): Place => [w, b]));
      used += gap + wide;
      return;
    }
    close();
    if (wide <= room()) {
      row = pairs.map((_, b): Place => [w, b]);
      used = wide;
      return;
    }
    pairs.forEach((pair, b) => {
      if (row.length > 0 && used + pair > room()) close();
      row.push([w, b]);
      used += pair;
    });
    close();
  });
  close();
  return rows;
};

type Pair = ChordsLine['words'][number]['boxes'][number];

/** A pair's syllable as it is drawn: with a hyphen where its word goes on (`more`). */
export const drawnText = (box: Pair, more: boolean): string => (more ? `${box.text}-` : box.text);

/** A pair's width in characters: its syllable (with its hyphen) or its chord and the space after it, the wider. */
export const pairWidth = (box: Pair, more: boolean): number =>
  Math.max(drawnText(box, more).length, box.chord.length === 0 ? 0 : box.chord.length + 1);

/** Each pair's width in a word, its last with no hyphen. */
export const wordWidths = (boxes: ReadonlyArray<Pair>): Array<number> =>
  boxes.map((box, b) => pairWidth(box, b < boxes.length - 1));

/** The rows of `line` on a page `width` characters wide, its words a character apart. */
export const rowsOf = (line: ChordsLine, width: number): Array<Array<Place>> =>
  breaksOf(
    line.words.map((word) => wordWidths(word.boxes)),
    width,
    1,
  );
