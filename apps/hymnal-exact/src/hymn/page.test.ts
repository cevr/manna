/* oxlint-disable effect/noTernary, effect/noGlobals, effect/noNullish -- a Bun test reading the current app's decoded chords as plain values; the sizes it holds are the JSON bytes Exact sends. */

/**
 * The page shown is the current app's: for every hymn, its head line is
 * `headLine` over the hymn's section and passages, and each printed line's
 * words are the syllables the current app draws (`sectionsOf` over its
 * `chordBook` decoding of the same shipped string, chords on or off), or
 * the line's words where the chords do not split it. Joined, the syllables
 * give back the printed words. Each answer is under 30 KB.
 */

import { describe, expect, test } from 'bun:test';

import { sectionsOf } from '@manna/hymnal-app/hymns/chords';
import { referencesOf } from '@manna/hymnal-app/hymns/indexes';
import { headLine } from '@manna/hymnal-app/reader/head-line';

import { currentBook, encoded } from '../chords/shipped.testing.ts';
import { book } from '../hymns/book.testing.ts';
import type { Page } from './page.ts';
import { hymnSources } from './sources.ts';

const { hymnPage } = hymnSources(book, encoded);

const bytes = (value: Page) => new TextEncoder().encode(JSON.stringify(value)).length;

/** What the current app draws of each line of hymn `number`: each word's syllables, or none for a line drawn as words. */
const drawnByCurrent = (number: number) => {
  const hymn = book.hymns.find((each) => each.number === number);
  const chords = currentBook.of(number);
  if (hymn === undefined) return [];
  const sections = chords._tag === 'Some' ? sectionsOf(hymn, chords.value) : [];
  return hymn.sections.map((section, k) => {
    const split = sections[k];
    return section.lines.map((line, l) =>
      split?._tag === 'Syllables'
        ? (split.lines[l] ?? [])
            .filter((word) => word.length > 0)
            .map((word) => word.map((box) => box.text))
        : line
            .split(/ +/)
            .filter((word) => word.length > 0)
            .map((word) => [word]),
    );
  });
};

describe('the page shown is the current app’s', () => {
  test('for all 695 hymns: the head line, each line’s syllables, the parts, under 30 KB', () => {
    expect(book.hymns.length).toBe(695);
    let largest = 0;
    let split = 0;
    for (const hymn of book.hymns) {
      const page = hymnPage([`${hymn.number}`]);
      expect(page.head).toBe(headLine(hymn.topic, referencesOf(hymn.number)));
      const drawn = page.parts.map((part) =>
        part.lines.map((line) =>
          line.words.map((word) => word.syllables.map((s) => s.replace(/\u00A0$/u, ''))),
        ),
      );
      expect(drawn).toEqual(drawnByCurrent(hymn.number));
      page.parts.forEach((part, k) => {
        const section = hymn.sections[k];
        expect(part.refrain).toBe(section?.kind === 'refrain');
        part.lines.forEach((line, l) => {
          expect(line.text).toBe(section?.lines[l] ?? '');
          const last = line.words.length - 1;
          line.words.forEach((word, w) =>
            expect(word.syllables.at(-1)?.endsWith('\u00A0')).toBe(w !== last),
          );
          if (line.words.some((word) => word.syllables.length > 1)) split += 1;
        });
      });
      largest = Math.max(largest, bytes(page));
    }
    expect(split).toBeGreaterThan(0);
    expect(largest).toBeLessThan(30_000);
  });

  test('a route that names no hymn answers the missing page', () => {
    for (const route of ['', '0', '007', '696', 'abc'])
      expect(hymnPage([route])).toEqual({ number: 0, title: '', topic: '', head: '', parts: [] });
  });
});
