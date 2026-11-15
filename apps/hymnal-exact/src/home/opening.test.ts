/**
 * How a found hymn opens: for any screen's address and any hymn number, the
 * port's move is the current app's `openingAt`, to the hymn's page.
 */

import { describe, expect, test } from 'bun:test';

import { openingAt } from '@manna/hymnal-app/home/opening';

import { book } from '../hymns/book.ts';
import { below, pick, seeded } from '../test/random.ts';
import { homeSources } from './sources.ts';

const sources = homeSources(book);

const SCREENS = ['/', '/recent', '/hymns/', '/hymns//', '/hymns/2/', '/hymns/2?x=1', '/hymns/2#y'];

describe('a found hymn opens as the current app opens it', () => {
  test('every screen the port has, every hymn and a few no hymn has', () => {
    const numbers = [...Array.from({ length: 695 }, (_, i) => i + 1), 0, 696, -1];
    const screens = [
      ...SCREENS,
      ...[0, 1, 2, 9, 10, 99, 100, 101, 694, 695, 696].map((i) => `/hymns/${i}`),
      '/hymns/007',
      '/hymns/abc',
    ];
    const wrong = screens.flatMap((url) =>
      numbers.flatMap((n) => {
        const move = sources.listOpening([url, n]);
        if (move.how === openingAt(url, n) && move.path === `/hymns/${n}`) return [];
        return [{ url, n, move }];
      }),
    );
    expect(wrong).toEqual([]);
  });

  test('generated addresses', () => {
    const random = seeded(2026);
    const parts = ['hymns', '', '2', '100', 'recent', 'x', '?q=1', '#h', 'base'];
    for (let run = 0; run < 2000; run++) {
      const url = `/${Array.from({ length: below(random, 5) }, () => pick(random, parts)).join('/')}`;
      const n = below(random, 700);
      expect(sources.listOpening([url, n]).how).toBe(openingAt(url, n));
    }
  });

  test('all three ways are reached: pushed, in a page’s place, and kept', () => {
    expect(sources.listOpening(['/', 100]).how).toBe('push');
    expect(sources.listOpening(['/hymns/2', 100]).how).toBe('replace');
    expect(sources.listOpening(['/hymns/100', 100]).how).toBe('stay');
  });
});
