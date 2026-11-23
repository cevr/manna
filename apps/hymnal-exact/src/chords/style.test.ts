/* oxlint-disable effect/noGlobals -- a Bun test comparing the port's answer and the current app's as the JSON text Exact sends. */

/**
 * The page's chords follow Settings' Chord style and Chord placement as the
 * current app's `HymnPage` does: for every hymn with chords, the port's
 * page in a style and placement is what the current app shows from its own
 * `chordBook(...).of(number, placement)` (`decodeHymn` at the placement)
 * `styled` in the style (`simple` for Simple, the decoded chords for
 * Advanced). Each hymn is asked in one of the six pairs, turning over them
 * by its place, so every pair meets about a sixth of the hymns in a task
 * under its second; each pair but Simple on the beat changes some hymn's
 * page. A call without the two, or with texts no choice is, is Simple on
 * the beat, so a caller that passes three arguments still draws.
 */

import { describe, expect, test } from 'bun:test';

import { chordStyles, placements } from '@manna/hymnal-app/chord-choices';
import { still } from '@manna/hymnal-app/hymns/chords';

import { book } from '../hymns/book.testing.ts';
import { sourcesAt } from '../sources.ts';
import { encoded, shownByCurrent, shownByPort } from './shipped.testing.ts';

const sources = sourcesAt('https://hymns.cvr.im', [], encoded);

const simpleBeat = new Map(
  book.hymns.map((hymn) => [hymn.number, JSON.stringify(shownByCurrent(hymn.number, still))]),
);

const chorded = book.hymns.filter((hymn) => simpleBeat.get(hymn.number) !== '"none"');

const pairs = chordStyles.flatMap((style) =>
  placements.map((placement) => [style.value, placement.value] as const),
);

describe('the chord style and placement are the current app’s', () => {
  test('for every hymn with chords, in a style and placement turning over the six, the page is the current HymnPage’s', () => {
    const differ = new Set<string>();
    const asked = new Set<string>();
    chorded.forEach((hymn, k) => {
      const [style, placement] = pairs[k % pairs.length] ?? ['simple', 'beat'];
      asked.add(`${style}:${placement}`);
      const page = sources.chordsPage([`${hymn.number}`, true, [], style, placement]);
      const current = JSON.stringify(shownByCurrent(hymn.number, still, style, placement));
      expect(JSON.stringify(shownByPort(page))).toBe(current);
      if (current !== simpleBeat.get(hymn.number)) differ.add(`${style}:${placement}`);
    });
    expect(chorded.length).toBeGreaterThan(400);
    expect(asked.size).toBe(6);
    expect([...differ].toSorted()).toEqual([
      'advanced:beat',
      'advanced:file',
      'advanced:simpler',
      'simple:file',
      'simple:simpler',
    ]);
  });

  test('a call without the two, or with texts no choice is, is Simple on the beat', () => {
    for (const hymn of chorded.filter((_, k) => k % 25 === 0)) {
      const route = `${hymn.number}`;
      const simpleBeat = sources.chordsPage([route, true, [], 'simple', 'beat']);
      expect(sources.chordsPage([route, true, []])).toEqual(simpleBeat);
      expect(sources.chordsPage([route, true, [], '', ''])).toEqual(simpleBeat);
      expect(sources.chordsPage([route, true, [], 'Advanced', 'inherit'])).toEqual(simpleBeat);
    }
  });
});
