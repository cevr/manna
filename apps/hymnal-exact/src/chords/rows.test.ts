/* oxlint-disable effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noNewError -- a Bun test drawing generated lines with the app's seeded generator, a place outside its line being the test's own defect (no effect's FastCheck: Exact's type check stages what an app file imports). */

/**
 * The line rule (A3): over generated chorded lines and page widths, and
 * over the book's own lines, the rows `rowsOf` breaks a line into, written
 * out as a chord row over a syllable row, never break inside a
 * syllable-chord pair, put each chord over its own syllable's first
 * character, and drop no chord; a word stays whole on a row unless it is
 * wider than the page, and a row is no wider than the page unless it holds
 * one pair.
 */

import { describe, expect, test } from 'bun:test';

import { book } from '../hymns/book.ts';
import { sourcesAt } from '../sources.ts';
import { below, pick, seeded } from '../test/random.ts';
import type { ChordsLine } from './page.ts';
import { breaksOf, drawnText, pairWidth, type Place, rowsOf, wordWidths } from './rows.ts';
import { bundled } from './shipped.testing.ts';

const SYLLABLES = [
  'a',
  'Lord',
  'thy',
  'faith',
  'ful',
  'ness',
  'ev',
  'er',
  'more',
  'O',
  'hal',
  'le',
  'lu',
  'jah',
];
const CHORDS = ['', '', '', 'C', 'G7', 'Am', 'F#m7b5', 'Dsus4', 'Bb/D', 'Ebmaj7'];

/** A generated chorded line: words of one to five syllables, a chord over some. */
const lineOf = (random: () => number): ChordsLine => {
  let at = 1;
  return {
    at: 1,
    words: Array.from({ length: 1 + below(random, 9) }, () => {
      const count = 1 + below(random, 5);
      const word = {
        at,
        boxes: Array.from({ length: count }, () => ({
          text: pick(random, SYLLABLES),
          chord: pick(random, CHORDS),
          grip: '',
        })),
      };
      at += count;
      return word;
    }),
  };
};

/** The rows written out: each a chord line over a syllable line, every pair at its column; the column each pair starts at. */
const writeOut = (line: ChordsLine, rows: ReadonlyArray<ReadonlyArray<Place>>) =>
  rows.map((row) => {
    let chords = '';
    let syllables = '';
    const starts: Array<number> = [];
    row.forEach(([w, b], k) => {
      const box = line.words[w]?.boxes[b];
      if (box === undefined) throw new Error('a place outside the line');
      const previous = row[k - 1];
      if (previous !== undefined && previous[0] !== w) {
        chords += ' ';
        syllables += ' ';
      }
      const start = syllables.length;
      starts.push(start);
      const more = b < (line.words[w]?.boxes.length ?? 0) - 1;
      const width = pairWidth(box, more);
      chords = chords.padEnd(start) + box.chord;
      syllables = syllables.padEnd(start) + drawnText(box, more);
      chords = chords.padEnd(start + width);
      syllables = syllables.padEnd(start + width);
    });
    return { chords: chords.trimEnd(), syllables: syllables.trimEnd(), starts };
  });

const holds = (line: ChordsLine, width: number) => {
  const rows = rowsOf(line, width);
  const places = rows.flat();
  const all = line.words.flatMap((word, w) => word.boxes.map((_, b): Place => [w, b]));
  expect(places).toEqual(all);
  const written = writeOut(line, rows);
  rows.forEach((row, r) => {
    const out = written[r];
    if (out === undefined) throw new Error('a row not written');
    row.forEach(([w, b], k) => {
      const box = line.words[w]?.boxes[b];
      const start = out.starts[k] ?? -1;
      const more = b < (line.words[w]?.boxes.length ?? 0) - 1;
      const drawn = box === undefined ? '' : drawnText(box, more);
      expect(out.syllables.slice(start, start + drawn.length)).toBe(drawn);
      expect(out.chords.slice(start, start + (box?.chord.length ?? 0))).toBe(box?.chord ?? '');
    });
    const chordsOut = out.chords.split(/\s+/).filter((name) => name !== '');
    const chordsIn = row
      .flatMap(([w, b]) => (line.words[w]?.boxes[b]?.chord ?? '').split(' '))
      .filter((name) => name !== '');
    expect(chordsOut).toEqual(chordsIn);
    if (row.length > 1) expect(out.syllables.length).toBeLessThanOrEqual(width);
  });
  line.words.forEach((word, w) => {
    const wide = wordWidths(word.boxes).reduce((sum, pair) => sum + pair, 0);
    const rowsHolding = new Set(
      rows.flatMap((row, r) => (row.some(([at]) => at === w) ? [r] : [])),
    );
    if (wide <= width) expect(rowsHolding.size).toBe(1);
  });
};

describe('the line rule (A3)', () => {
  test('generated lines at generated widths break between pairs, each chord over its syllable, none dropped', () => {
    const random = seeded(23);
    for (let run = 0; run < 400; run++) holds(lineOf(random), 4 + below(random, 60));
  });

  test('the book’s own chorded lines hold the rule at a phone’s widths and the largest text’s', () => {
    const sources = sourcesAt('https://hymns.cvr.im', [], bundled);
    const random = seeded(5);
    for (let run = 0; run < 40; run++) {
      const page = sources.chordsPage([`${pick(random, book.hymns).number}`, true, []]);
      for (const part of page.parts)
        for (const line of part.lines) holds(line, pick(random, [12, 20, 32, 44]));
    }
  });

  test('breaksOf in any unit: a word that fits goes on after the last, with the gap', () => {
    expect(breaksOf([[3], [2, 2], [5]], 10, 1)).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      [[2, 0]],
    ]);
    expect(breaksOf([[3], [4, 4, 4]], 6, 1)).toEqual([[[0, 0]], [[1, 0]], [[1, 1]], [[1, 2]]]);
    expect(breaksOf([], 10, 1)).toEqual([]);
  });

  test('a row but the first is narrower by the hanging indent', () => {
    expect(breaksOf([[4], [4], [4], [4]], 9, 1, 2)).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [[2, 0]],
      [[3, 0]],
    ]);
    expect(breaksOf([[4], [4], [4], [4]], 9, 1)).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ]);
    expect(breaksOf([[2], [4, 4]], 9, 1, 2)).toEqual([[[0, 0]], [[1, 0]], [[1, 1]]]);
  });
});
