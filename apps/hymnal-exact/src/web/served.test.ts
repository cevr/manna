/* oxlint-disable effect/noTernary -- a Bun test whose generators import no effect. */

/**
 * The host's one rule (A2), over a build's files as `web-build --out`
 * and `pagesOf` write them (no build needed): a public file is always served as itself,
 * however its path is escaped; no request names a file outside the build,
 * whatever its dots, escapes or separators; and for any address a browser
 * sends, the host answers 200 exactly when the address rule opens a screen
 * (`placeOf`), so a page the router would call not found arrives as 404.
 */

import { describe, expect, test } from 'bun:test';

import { book } from '../hymns/book.testing.ts';
import { below, pick, seeded } from '../test/random.ts';
import { headsOf } from './pages.ts';
import { hymnPages, placeOf } from './place.ts';
import { NOT_FOUND, isPublic, servedFor } from './served.ts';

const FILES = new Set([
  'shell.html',
  'app.js',
  'app.plan',
  'style.css',
  'routes.json',
  'robots.txt',
  'input-glue-7paqGVo7.js',
  ...headsOf(book).map(([file]) => file),
  '.exact-build.json',
  '.exact/install/index.html',
  '.gen/csp.json',
]);

const PAGES = [
  '/',
  '/recent',
  '/player',
  '/settings',
  '/settings/about',
  ...hymnPages(book).map((n) => `/hymns/${n}`),
];
const PIECES = [
  'hymns',
  '100',
  '696',
  '..',
  '.',
  '%2e',
  '%2E%2e',
  '%2F',
  '%5C',
  '%00',
  '%',
  '%zz',
  '\\',
  '',
  'index.html',
  '.exact',
  'C:',
  'etc',
  'passwd',
  '%31',
];

/** Paths a request may carry, absolute or not, from pieces that try to leave the build. */
const paths = (seed: number) => {
  const random = seeded(seed);
  return Array.from({ length: 5000 }, () => {
    const parts = Array.from({ length: 1 + below(random, 5) }, () => pick(random, PIECES));
    return `${pick(random, ['/', '', '//', '/./'])}${parts.join(pick(random, ['/', '/', '\\']))}`;
  });
};

/** `path` with one of its characters written as an escape, as a client may send it. */
const escapedOnce = (path: string, at: number) =>
  `${path.slice(0, at)}%${path.charCodeAt(at).toString(16).toUpperCase().padStart(2, '0')}${path.slice(at + 1)}`;

describe("the host's one rule", () => {
  test('a public file is always served as itself, plain or escaped', () => {
    const random = seeded(1);
    for (const file of [...FILES].filter(isPublic)) {
      expect(servedFor(FILES, `/${file}`)).toEqual({ file, status: 200 });
      const at = 1 + below(random, file.length);
      if (file.charAt(at - 1) !== '/')
        expect(servedFor(FILES, escapedOnce(`/${file}`, at))).toEqual({ file, status: 200 });
    }
  });

  test('every page is its folder’s index.html, and a dot file is never served', () => {
    for (const page of PAGES)
      expect(servedFor(FILES, page)).toEqual({
        file: page === '/' ? 'index.html' : `${page.slice(1)}/index.html`,
        status: 200,
      });
    for (const file of [...FILES].filter((name) => !isPublic(name)))
      expect(servedFor(FILES, `/${file}`)).toEqual(NOT_FOUND);
  });

  test('no request names a file outside the build', () => {
    for (const seed of [2, 3]) {
      const outside = paths(seed).flatMap((path) => {
        const served = servedFor(FILES, path);
        const escapes =
          /(^|[/\\])(\.|%2e)(\.|%2e)?([/\\]|$)/iu.test(path) || /%2f|%5c|%00/iu.test(path);
        return FILES.has(served.file) && !(escapes && served.status === 200)
          ? []
          : [{ path, served }];
      });
      expect({ seed, outside: outside.slice(0, 5) }).toEqual({ seed, outside: [] });
    }
  });

  test('an address a browser sends is 200 exactly when it opens a screen', () => {
    const random = seeded(4);
    const addresses = [
      ...PAGES,
      ...Array.from({ length: 3000 }, () => {
        const n = below(random, 1006) - 5;
        return pick(random, [
          `/hymns/${n}`,
          `/hymns/0${n}`,
          `/hymns/${n}/`,
          `/hymns/${n}?q=1`,
          `/hymns/${n}#x`,
          `/hymns/./${n}`,
          `/a/../hymns/${n}`,
          `/hymns/%3${String(n).charAt(0)}${String(n).slice(1)}`,
          `/hymns/${n}.0`,
        ]);
      }),
      '/recent/',
      '/Recent',
      '/hymns',
      '/hymns/',
      '/hymns/abc',
      '/nothing',
    ];
    const wrong = addresses.flatMap((address) => {
      const sent = new URL(address, 'http://127.0.0.1').pathname;
      const opens = placeOf(book, address).screen !== 'notfound';
      return (servedFor(FILES, sent).status === 200) === opens ? [] : [{ address, sent, opens }];
    });
    expect(wrong.slice(0, 5)).toEqual([]);
  });
});
