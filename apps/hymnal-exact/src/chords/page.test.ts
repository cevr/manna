/* oxlint-disable effect/noTernary, effect/noGlobals -- a Bun test reading the current app's decoded chords as plain values; the sizes it holds are the JSON bytes Exact sends. */

/**
 * The page's chords are the current app's (A1) and light (A4): for every
 * hymn of the book, what the port answers with chords on is
 * `sectionsOf(text, chords)` over the current app's `chordBook` decoding of
 * the same shipped string, in its default Simple style, each chord spelled
 * by `Chord.format` in the key played; a hymn with no chords answers the
 * `none` form exactly when `hasChords` is false. Each answer is under
 * 30 KB, and with chords off the source decodes nothing.
 */

import { describe, expect, test } from 'bun:test';

import { decodeHymn, still } from '@manna/hymnal-app/hymns/chords';

import { book } from '../hymns/book.ts';
import { pageAt } from '../hymn/page.ts';
import { sourcesAt } from '../sources.ts';
import type { ChordsPage } from './page.ts';
import { bundled, encoded, shownByCurrent, shownByPort } from './shipped.testing.ts';
import { chordsSources } from './sources.ts';

const sources = sourcesAt('https://hymns.cvr.im', [], encoded);

const bytes = (value: ChordsPage) => new TextEncoder().encode(JSON.stringify(value)).length;

describe('every hymn’s chords are the current app’s (A1)', () => {
  test('for all 695 hymns, the page with chords on is sectionsOf over chordBook, or none exactly when hasChords is false', () => {
    expect(book.hymns.length).toBe(695);
    let none = 0;
    let largest = 0;
    for (const hymn of book.hymns) {
      const page = sources.chordsPage([`${hymn.number}`, true, []]);
      expect(page.number).toBe(hymn.number);
      expect(shownByPort(page)).toEqual(shownByCurrent(hymn.number, still));
      largest = Math.max(largest, bytes(page));
      if (page.kind === 'none') {
        none += 1;
        expect(page.parts).toEqual([]);
        continue;
      }
      expect(page.kind).toBe('chords');
      const words = pageAt(book, `${hymn.number}`).parts;
      expect(page.parts.map((part) => [part.key, part.label])).toEqual(
        words.map((part) => [part.key, part.label]),
      );
      page.parts.forEach((part, k) => {
        expect(part.text).toBe(part.lines.length > 0 ? '' : (words[k]?.text ?? ''));
        part.lines.forEach((line, i) => {
          expect(line.at).toBe(i + 1);
          let syllable = 1;
          for (const word of line.words) {
            expect(word.at).toBe(syllable);
            syllable += word.boxes.length;
          }
        });
      });
    }
    expect(none).toBeGreaterThan(0);
    expect(largest).toBeLessThan(30_000);
  });
});

describe('a hymn’s own placement is the current app’s', () => {
  test('under a hymn’s own placement its page is the current page at it, and every other hymn keeps the global one', () => {
    const own = ['beat', 'simpler', 'file'] as const;
    const sampled = book.hymns.filter((_, k) => k % 41 === 0);
    sampled.forEach((hymn, k) => {
      const mine = own[k % own.length] ?? 'beat';
      const global = own[(k + 1) % own.length] ?? 'beat';
      const kept = [`${hymn.number}:${mine}`, `${hymn.number + 1}:x`];
      const page = sources.chordsPage([`${hymn.number}`, true, [], 'simple', global, kept]);
      expect(shownByPort(page)).toEqual(shownByCurrent(hymn.number, still, 'simple', mine));
      const next = hymn.number + 1;
      if (next > 695) return;
      const other = sources.chordsPage([`${next}`, true, [], 'simple', global, kept]);
      expect(shownByPort(other)).toEqual(shownByCurrent(next, still, 'simple', global));
    });
  });
});

describe('the chords are light (A4)', () => {
  test('with chords off, or on a route that names no hymn, the source decodes nothing', () => {
    let decodes = 0;
    const counted = chordsSources(book, encoded, (encoded, placement) => {
      decodes += 1;
      return decodeHymn(encoded, placement);
    });
    for (const route of ['1', '100', '695', '0', '', 'abc', '696'])
      expect(counted.chordsPage([route, false, []]).kind).toBe('off');
    expect(counted.chordsPage(['999', true, []]).kind).toBe('off');
    expect(decodes).toBe(0);
    counted.chordsPage(['100', true, []]);
    counted.chordsPage(['181', true, ['181:2:0']]);
    expect(decodes).toBe(2);
  });

  test('the list’s answer carries no chord, and the shipped chords are one string per hymn', () => {
    expect(JSON.stringify(sources.hymnRows(['']))).not.toContain('chord');
    expect(bundled.map(([number]) => number)).toEqual(book.hymns.map((hymn) => hymn.number));
    expect(bundled.every(([, encoded]) => encoded.length > 0)).toBe(true);
  });
});
