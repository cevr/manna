import { describe, expect, test } from 'bun:test';
import { Place } from '@manna/url-state';
import { Option, Schema } from 'effect';
import {
  LabHttpApi,
  type AppPage,
  Places,
  filmOfPage,
  labUrls,
  pageAt,
  pageHref,
  reviewFileUrl,
} from './api.ts';
import { declares } from './testing.ts';
import { LONGEST_WAIT, WaitTimeout } from './wait.ts';

type PlaceName = Exclude<keyof typeof Places, 'home'>;

/**
 * Links to every page as the app writes them, each with the place it opens,
 * the page that serves it, and the href the place writes back for it: a
 * canonical link comes back byte for byte; the rest normalise (defaults left
 * out, keys a place does not declare dropped).
 */
const LINKS: ReadonlyArray<
  readonly [href: string, place: PlaceName, page: AppPage, written: string]
> = [
  ['/asks/a0123456780', 'ask', 'ask', '/asks/a0123456780'],
  [
    '/asks/a0123456780?still=board-open.breath',
    'ask',
    'ask',
    '/asks/a0123456780?still=board-open.breath',
  ],
  ['/asks/a0123456780?still=&nope=1', 'ask', 'ask', '/asks/a0123456780'],
  ['/asks/page/a1', 'askPage', 'ask', '/asks/page/a1'],
  ['/films/rbf/export', 'export', 'render', '/films/rbf/export'],
  [
    '/films/rbf%2Fshorts%2Fverdict/export',
    'export',
    'render',
    '/films/rbf%2Fshorts%2Fverdict/export',
  ],
];

describe('page places', () => {
  test.each(LINKS)('%s is the %s place, served by the %s page', (href, name, page, written) => {
    const place: Place.Place<unknown> = Places[name];
    const value = Place.decode(place, href);
    expect(Option.isSome(value)).toBe(true);
    expect(Option.map(value, (v) => Place.href(place, v))).toEqual(Option.some(written));
    expect(pageAt(href.split(/[?#]/)[0] ?? '')).toEqual(Option.some(page));
  });

  test('a written link reads back as the same value', () => {
    for (const [href, name] of LINKS) {
      const place: Place.Place<unknown> = Places[name];
      const value = Place.decode(place, href);
      const again = Option.flatMap(value, (v) => Place.decode(place, Place.href(place, v)));
      expect(again).toEqual(value);
    }
  });

  test.each([
    // Home is no page: the lab sends it on to the newest ask still asking (`tools/lab.ts`).
    '/',
    '/films',
    '/films/rbf',
    '/sets',
    '/api/films',
    '/chunk-abc123.js',
    '/films/%2E%2E/export',
    // The pages that are gone: the studio, the review's sets and folders, a production, a draft.
    '/films/rbf/studio',
    '/sets/f/p',
    '/sets/f',
    '/productions/rbf',
    '/series/s/d',
    '/films/rbf/play',
    '/films/rbf/lab',
  ])('%s serves no page', (path) => {
    expect(pageAt(path)).toEqual(Option.none());
  });

  test("a film's export page is the render page's own place", () => {
    expect(pageAt('/films/rbf/export')).toEqual(Option.some('render'));
    expect(filmOfPage('/films/rbf%2Fshorts%2Fverdict/export?build=3')).toEqual(
      Option.some('rbf/shorts/verdict'),
    );
    for (const href of ['/', '/asks/a1', '/?film=rbf'])
      expect(filmOfPage(href)).toEqual(Option.none());
  });

  test('every link the app prints is its place', () => {
    expect(pageHref.home()).toBe('/');
    expect(pageHref.ask('a1')).toBe('/asks/a1');
    expect(pageHref.askPage('a1')).toBe('/asks/page/a1');
    expect(pageHref.export('rbf/shorts/verdict')).toBe('/films/rbf%2Fshorts%2Fverdict/export');
  });

  test("an ask's still opened full size is a step Back walks", () => {
    const step = { history: 'push' as const, throttle: Option.none() };
    expect(Place.history(Places.ask, '/asks/a1', '/asks/a1?still=x')).toEqual(step);
  });
});

describe('waits', () => {
  const asked = Schema.decodeUnknownSync(Schema.Struct({ timeout: WaitTimeout }));

  test.each([
    [{ timeout: 999 }, LONGEST_WAIT],
    [{}, LONGEST_WAIT],
    [{ timeout: -5 }, 0],
    [{ timeout: 3 }, 3],
  ])('a wait asked %o is held %d s at most, never past the longest', (query, held) => {
    expect(asked(query).timeout).toBe(held);
  });
});

describe('declared routes', () => {
  const declared = declares(LabHttpApi);

  test.each([
    ['GET', '/api/films/rbf/board'],
    ['POST', '/api/asks/a-1/answer'],
    ['GET', '/api/films/rbf%2Fshorts%2Fverdict/board/stale'],
    ['GET', '/api/review/files/out/art/roof.A.md'],
  ])('%s %s is declared', (method, pathname) => {
    expect(declared(method, pathname)).toBe(true);
  });

  test.each([
    ['POST', '/api/films/rbf/board'],
    ['GET', '/api/asks/a-1/answer'],
    ['GET', '/lab/rbf/board'],
    ['GET', '/api/films/rbf/notes'],
    ['POST', '/api/films/rbf/board/pick'],
    ['GET', '/api/films/rbf/board/extra/segments/here'],
  ])('%s %s is not', (method, pathname) => {
    expect(declared(method, pathname)).toBe(false);
  });

  test("the API's paths, as the wire has them", () => {
    expect(labUrls.board.read({ params: { film: 'f' } })).toBe('/api/films/f/board');
    expect(labUrls.script.beats({ params: { film: 'f' } })).toBe('/api/films/f/script');
    expect(labUrls.asks.read({ params: { ask: 'a1' } })).toBe('/api/asks/a1');
    expect(labUrls.review.index({ query: {} })).toBe('/api/review/index');
    expect(labUrls.page.wait({ query: { since: 3, timeout: 9 } })).toBe(
      '/api/review/build?since=3&timeout=9',
    );
    expect(reviewFileUrl('out/a b.mp4')).toBe('/api/review/files/out/a%20b.mp4');
  });
});
