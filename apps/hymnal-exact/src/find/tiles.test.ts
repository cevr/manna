/* oxlint-disable effect/noTernary -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so the playing hymn's Option is built by its shapes. */

/**
 * All at once's tiles against the current app's `tilesOf`, over every tab,
 * generated favourites and recents (stale numbers among them) and a
 * generated playing hymn: the port's tiles are One's, tile for tile, by
 * name, count, strip and the playing outline; the count and VoiceOver name
 * say what One's tile says; and a tile's tap lands on its group's first
 * row, by the id the home list gives that row.
 */

import { describe, expect, test } from 'bun:test';

import { TAB_NAMES, tabsOf, tilesOf } from '@manna/hymnal-app/home/tabs';
import indexes from 'virtual:hymnal-indexes';

import { book } from '../hymns/book.testing.ts';
import { rowsOf } from '../list/rows.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import { listedRows } from './follow.ts';
import { tabGroups } from '../home/tabs.ts';
import { groupTiles, tileAt } from './tiles.ts';

const source = { book, indexes };

const numbersOf = (random: Random): Array<number> =>
  Array.from({ length: below(random, 12) }, () =>
    below(random, 10) === 0 ? pick(random, [0, -1, 696, 1.5]) : 1 + below(random, 695),
  );

describe('All at once opens at the group at the list’s top', () => {
  test('the first box from the list’s top that is a group’s header or row names its tile, the head and the shelf the first', () => {
    const random = seeded(20261123);
    let named = 0;
    for (let run = 0; run < 3; run++) {
      const favourites = numbersOf(random);
      const recent = numbersOf(random);
      for (const name of TAB_NAMES) {
        const groups = tabGroups(source, name, favourites, recent);
        const header = name === 'Sections' ? 'section' : 'group';
        groups.forEach((group, at) => {
          if (at > 2 && below(random, 8) !== 0) return;
          const ids = [
            `${header}-${group.slug}`,
            `${header}-${group.slug}-row`,
            ...[group.numbers[0] ?? 0, pick(random, group.numbers)].flatMap((n) =>
              group.repeats.includes(n)
                ? [`hymn-${group.slug}-${n}`, `star-${group.slug}-${n}`]
                : [`hymn-${n}`, `star-${n}`],
            ),
          ];
          for (const id of ids) {
            const above = pick(random, [[], ['hymn-list'], ['', 'hymn-list']]);
            expect({
              name,
              id,
              at: tileAt(source, name, [...above, id, 'hymn-1'], favourites, recent),
            }).toEqual({ name, id, at });
            named += 1;
          }
        });
        for (const id of ['list-top', 'shelf-12'])
          expect(
            tileAt(
              source,
              name,
              ['hymn-list', id, `hymn-${groups.at(-1)?.numbers[0]}`],
              favourites,
              recent,
            ),
          ).toBe(0);
        expect(tileAt(source, name, ['hymn-list', 'recent-all', ''], favourites, recent)).toBe(0);
      }
    }
    expect(named).toBeGreaterThan(200);
  });

  test('the Sections list’s headers are the tab’s groups, slug for slug', () => {
    expect(rowsOf(book, '').map((section) => section.slug)).toEqual(
      tabGroups(source, 'Sections', [], []).map((group) => group.slug),
    );
  });
});

describe('All at once’s tiles are the current app’s', () => {
  test('over every tab, generated lists and a generated playing hymn', () => {
    const random = seeded(20261122);
    let outlined = 0;
    let repeated = 0;
    for (let run = 0; run < 60; run++) {
      const favourites = numbersOf(random);
      const recent = numbersOf(random);
      const playing = below(random, 3) === 0 ? 0 : 1 + below(random, 700);
      for (const name of TAB_NAMES) {
        const tab = tabsOf({ hymns: book.hymns, favourites, recent, indexes }).find(
          (each) => each.name === name,
        );
        const expected = tab
          ? tilesOf(tab, playing > 0 ? { _tag: 'Some', value: playing } : { _tag: 'None' })
          : [];
        const tiles = groupTiles(source, name, favourites, recent, playing);
        const where = { run, name, playing };
        expect({
          ...where,
          tiles: tiles.map(({ index, name: n, spans, playing: p }) => ({ index, n, spans, p })),
        }).toEqual({
          ...where,
          tiles: expected.map((tile) => ({
            index: tile.index,
            n: tile.name,
            spans: [...tile.spans],
            p: tile.playing,
          })),
        });
        const rows = listedRows(source, name, favourites, recent);
        tiles.forEach((tile, at) => {
          const one = expected[at];
          const count = one?.count === 1 ? '1 hymn' : `${one?.count} hymns`;
          expect(tile.count).toBe(count);
          expect(tile.label).toBe(
            [tile.name, count, ...(one?.playing ? ['playing'] : [])].join(', '),
          );
          if (tile.playing) outlined += 1;
          const groups = tab?.groups ?? [];
          const first = groups[at]?.hymns[0] ?? 0;
          const above = groups.slice(0, at).some((group) => group.hymns.includes(first));
          if (above) repeated += 1;
          expect(tile.row.endsWith(`-${first}`)).toBe(true);
          expect(tile.row === `hymn-${first}`).toBe(!above);
          const start = groups.slice(0, at).reduce((sum, group) => sum + group.hymns.length, 0);
          expect(rows[start]?.id).toBe(tile.row);
        });
      }
    }
    expect(outlined).toBeGreaterThan(30);
    expect(repeated).toBeGreaterThan(0);
  });

  test('the Sections tiles land on the first row of each section the home list draws', () => {
    const sections = rowsOf(book, '');
    const tiles = groupTiles(source, 'Sections', [], [], 0);
    expect(tiles.map((tile) => tile.name)).toEqual(sections.map((section) => section.name));
    expect(tiles.map((tile) => tile.row)).toEqual(
      sections.map((section) => `hymn-${section.rows[0]?.number}`),
    );
  });
});
