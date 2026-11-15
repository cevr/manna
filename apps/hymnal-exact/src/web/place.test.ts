/* oxlint-disable effect/noTernary, effect/noNodeBuiltinImport -- a Bun test reading the tracked `app.contract` beside the app to hold the address rule to its route table; the generators import no effect. */

/**
 * The address rule over its whole domain (A1): for generated addresses
 * (numbers -5 to 1000, leading zeros, signs, fractions, trailing slashes,
 * queries, fragments, escapes, dot segments and arbitrary text) `placeOf`
 * never throws, answers a hymn exactly for the numbers the book holds in
 * the form the current app's pages take (`String(number)`, its
 * `hymnParams`), and every screen it answers is a route of `app.contract`.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { hymns } from '@manna/hymnal-app/hymns/hymns';

import { book } from '../hymns/book.ts';
import { below, pick, seeded } from '../test/random.ts';
import { type Place, ROUTE_OF, hymnPages, placeOf } from './place.ts';

const forms = new Set(hymns.map((hymn) => String(hymn.number)));

/** The route names of `app.contract`'s `routes nav` table, `notfound` among them. */
const routeNames = (): Set<string> => {
  const text = readFileSync(new URL('../../app.contract', import.meta.url), 'utf8');
  const table = text.split('\nroutes nav\n')[1]?.split(/\n(?=\S)/u)[0] ?? '';
  return new Set(table.split('\n').flatMap((line) => /^\s+(\w+)/u.exec(line)?.[1] ?? []));
};

const hymn = (number: number): Place => ({ screen: 'hymn', number });
const NOT_FOUND: Place = { screen: 'notfound' };
const byNumber = (number: number): Place => (forms.has(String(number)) ? hymn(number) : NOT_FOUND);

/** Every escape of `text`'s characters, so the router's decoding is what reads it. */
const escaped = (text: string) =>
  [...text].map((char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).join('');

const ARBITRARY = 'hymns/recentplayer0123456789%2e.?#/\\ -+aZ\t\n\u0000é';

/** A generated address and the screen it must open. */
const cases = (seed: number) => {
  const random = seeded(seed);
  const all: Array<readonly [string, Place]> = [];
  for (let n = -5; n <= 1000; n += 1) {
    const tail = pick(random, ['', '?q=1', '#stanza-2', '?a=b#c', '?']);
    all.push([`/hymns/${n}${tail}`, byNumber(n)]);
    all.push([`/hymns/${escaped(String(n))}${tail}`, byNumber(n)]);
    all.push([`/hymns/0${n}${tail}`, NOT_FOUND]);
    all.push([`/hymns/+${n}`, NOT_FOUND]);
    all.push([`/hymns/${n}.${below(random, 10)}`, NOT_FOUND]);
    all.push([`/hymns/${n}/${tail}`, NOT_FOUND]);
    all.push([`/hymns/${n}/x`, NOT_FOUND]);
    all.push([`/hymns/${n}%20`, NOT_FOUND]);
    all.push([`/hymns/./${n}${tail}`, byNumber(n)]);
    all.push([`/x/../hymns/${n}`, byNumber(n)]);
    all.push([`/Hymns/${n}`, NOT_FOUND]);
  }
  for (const [path, place] of [
    ['/', { screen: 'list' }],
    ['', { screen: 'list' }],
    ['/?q=grace', { screen: 'list' }],
    ['/#top', { screen: 'list' }],
    ['/recent', { screen: 'recent' }],
    ['/recent?x=1#y', { screen: 'recent' }],
    ['/player', { screen: 'player' }],
    ['/recent/', NOT_FOUND],
    ['/Recent', NOT_FOUND],
    ['/rec%65nt', NOT_FOUND],
    ['/hymns', NOT_FOUND],
    ['/hymns/', NOT_FOUND],
    ['/hymns/abc', NOT_FOUND],
    ['/nothing', NOT_FOUND],
    ['//', NOT_FOUND],
  ] as const)
    all.push([path, place]);
  return all;
};

/** Text no case above names, drawn from the characters an address may hold and many it may not. */
const arbitrary = (seed: number) => {
  const random = seeded(seed);
  return Array.from({ length: 4000 }, () =>
    Array.from({ length: below(random, 24) }, () => pick(random, [...ARBITRARY])).join(''),
  );
};

describe('the address rule', () => {
  test('each generated address opens its screen', () => {
    for (const seed of [1, 2, 3]) {
      const wrong = cases(seed).flatMap(([path, place]) => {
        const got = placeOf(book, path);
        const same =
          got.screen === place.screen &&
          (got.screen !== 'hymn' || place.screen !== 'hymn' || got.number === place.number);
        return same ? [] : [{ path, got, place }];
      });
      expect({ seed, wrong: wrong.slice(0, 5) }).toEqual({ seed, wrong: [] });
    }
  });

  test('a hymn is answered for exactly the numbers the book holds, in their own form', () => {
    const answered = new Set<number>();
    for (const text of [...cases(4).map(([path]) => path), ...arbitrary(5)]) {
      const place = placeOf(book, text);
      if (place.screen === 'hymn') {
        expect(forms.has(String(place.number))).toBe(true);
        answered.add(place.number);
      }
    }
    expect([...answered].toSorted((a, b) => a - b).map(String)).toEqual([...forms]);
    expect(hymnPages(book)).toEqual([...forms]);
  });

  test("every screen it answers is a route of app.contract's table", () => {
    const routes = routeNames();
    const screens = new Set(
      [...cases(6).map(([path]) => path), ...arbitrary(7)].map(
        (path) => placeOf(book, path).screen,
      ),
    );
    expect([...screens].map(String).toSorted()).toEqual(Object.keys(ROUTE_OF).toSorted());
    expect([...screens].filter((screen) => !routes.has(ROUTE_OF[screen]))).toEqual([]);
  });
});
