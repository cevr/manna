/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise -- the player's source answers a Promise, awaited as the host awaits it; a Bun test in an Exact app's folder imports no effect (docs/exact.md: Exact's type check would stage its declarations, and so its Schema JSON codecs), and the sizes it holds are the JSON bytes the build ships. */

import { describe, expect, test } from 'bun:test';

import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { indexOf } from '@manna/hymnal-app/hymns/search';
import { readWords } from '@manna/hymnal-app/vite/words';

import { book } from './hymns/book.ts';
import { BUCKET } from './player/sources.ts';
import { sourcesAt } from './sources.ts';
import { below, pick, query, seeded } from './test/random.ts';

const sources = sourcesAt(BUCKET, []);

/** A route's hymn number as a reader or a stale link writes it. */
const route = (random: () => number): string =>
  pick(random, [
    `${1 + below(random, 695)}`,
    '0',
    '696',
    '007',
    '-1',
    '1.5',
    '',
    'abc',
    `${below(random, 100000)}`,
  ]);

const KINDS = [
  'play',
  'pause',
  'resume',
  'stop',
  'retry',
  'stanza',
  'open',
  'close',
  'title',
  'bar',
  'page',
  'loaded',
  'time',
  'waiting',
  'played',
  'playing',
  'paused',
  'ended',
  'screen',
  'restore',
  'dragStart',
  'dragTo',
  'dragEnd',
  'nudge',
  'seekTo',
  'place',
  'remoteSeek',
  'remoteSkip',
  'seeked',
  'settle',
  'due',
  'nonsense',
] as const;

/** A call of the player's source as the view makes it, any argument of any kind. */
const playerCall = (random: () => number): readonly [string, number, number, number, string] => [
  pick(random, KINDS),
  below(random, 6),
  below(random, 4),
  pick(random, [0, 1, 2, 3, 13, 695, 696, -1, 2.5, Number.NaN, Infinity, below(random, 400)]),
  pick(random, ['', '/', '/ /hymns/1', '/ /hymns/2 /player', '1:1.3,2:2', 'x', '/ /hymns/0']),
];

/** A reader's kept list: hymn numbers, now and then one no hymn has. */
const numbers = (random: () => number): Array<number> =>
  Array.from({ length: below(random, 60) }, () => Number(route(random)));

describe('the data module runs where Exact runs it', () => {
  test('inside the data host, every source answers generated arguments without throwing', () => {
    const random = seeded(41);
    withDataHost(() => {
      indexOf(book.hymns);
      for (let run = 0; run < 200; run++) {
        expect(() => sources.hymnRows([query(random, book.hymns)])).not.toThrow();
        expect(() => sources.hymnPage([route(random)])).not.toThrow();
        expect(() => sources.playerStep(playerCall(random))).not.toThrow();
        expect(() => sources.settingsLooks([route(random)])).not.toThrow();
        const list = numbers(random);
        const tab = pick(random, ['Sections', 'Lists', 'Topics', 'Metres', 'Scripture', '', 'x']);
        expect(() => sources.listTabRows([tab, list, numbers(random)])).not.toThrow();
        expect(() => sources.recentAfter([list, route(random)])).not.toThrow();
        expect(() => sources.favouritesAfter([list, Number(route(random))])).not.toThrow();
        expect(() => sources.recentRows([list])).not.toThrow();
        expect(() =>
          sources.listOpening([`/hymns/${route(random)}`, below(random, 700)]),
        ).not.toThrow();
      }
      expect(() => sources.aboutCredits()).not.toThrow();
      expect(sources.listTabs().length).toBe(5);
      expect(sources.listTitles().length).toBe(695);
    });
    expect(Object.keys(sources).toSorted()).toEqual([
      'aboutCredits',
      'chordsGrip',
      'chordsMove',
      'chordsPage',
      'favouritesAfter',
      'hymnPage',
      'hymnRows',
      'listOpening',
      'listTabRows',
      'listTabs',
      'listTitles',
      'playerStep',
      'recentAfter',
      'recentRows',
      'settingsLooks',
    ]);
  });

  test('inside the data host, a play and its device events step at once, with no clock read', async () => {
    const fresh = sourcesAt(BUCKET, []);
    const answers: Array<
      Promise<{
        readonly phase: string;
        readonly src: string;
        readonly seek: number;
        readonly seekTo: number;
        readonly command: string;
      }>
    > = [];
    withDataHost(() => {
      answers.push(fresh.playerStep(['play', 0, 0, 1, '']));
      answers.push(fresh.playerStep(['playing', 1, 0, 0, '']));
      answers.push(fresh.playerStep(['loaded', 1, 0, 120, '']));
      answers.push(fresh.playerStep(['seekTo', 0, 0, 60, '']));
    });
    const [played, playing, , sought] = await Promise.all(answers);
    expect(played?.src).toBe(`${BUCKET}/audio/warm-1/sdah/1.mp3`);
    expect(playing?.phase).toBe('playing');
    expect(sought?.phase).toBe('playing');
    expect(sought?.command).toBe('seek');
    expect(sought?.seek).toBe(1);
    expect(sought?.seekTo).toBe(60);
  });
});

describe('size', () => {
  test('the words ship once, under 1 MB', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(readWords())).length;
    expect(bytes).toBeLessThan(1_000_000);
  });

  test('the list’s answer holds numbers, titles and sections, never a stanza’s words', () => {
    const answer = sources.hymnRows(['']);
    for (const section of answer) {
      expect(Object.keys(section).toSorted()).toEqual(['name', 'rows', 'slug']);
      for (const row of section.rows)
        expect(Object.keys(row).toSorted()).toEqual(['number', 'title']);
    }
    expect(new TextEncoder().encode(JSON.stringify(answer)).length).toBeLessThan(40_000);
  });
});
