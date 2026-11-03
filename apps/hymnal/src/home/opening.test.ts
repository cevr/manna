/* oxlint-disable effect/noTernary -- each case's expected opening, read in one line beside the one got. */

import { describe, expect, it } from 'bun:test';

import { hymns } from '~/hymns/hymns';

import { openingAt } from './opening';

const book = hymns.map((hymn) => hymn.number);
const others = ['/', '/recent', '/settings', '/player', '/chord', '/about', '/tuner'];
const pages = [...book.map(String), '0', '9999'].map((segment) => ({
  path: `/hymns/${segment}`,
  segment,
}));

describe('a hymn chosen with the `#` or from a search', () => {
  it('is pushed from every screen but a hymn page, whichever hymn it is', () => {
    const wrong = others.flatMap((path) =>
      book.flatMap((n) => {
        const got = openingAt(path, n);
        return got === 'push' ? [] : [`${path} ${n}: ${got}`];
      }),
    );
    expect(wrong).toEqual([]);
  });

  it('replaces every hymn page but the one showing it, which stays', () => {
    const wrong = pages.flatMap(({ path, segment }) =>
      book.flatMap((n) => {
        const want = segment === String(n) ? 'stay' : 'replace';
        const got = openingAt(path, n);
        return got === want ? [] : [`${path} ${n}: ${got}, not ${want}`];
      }),
    );
    expect(wrong).toEqual([]);
  });
});
