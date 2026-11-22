/* oxlint-disable effect/noTernary, effect/noNullish, effect/noNodeBuiltinImport -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so a box missed is a plain `undefined` and a header's id a plain branch; it reads the app's own list contract by path under Bun. */

/**
 * All at once opens at the tile of the group at the list's top, as the
 * current app's `AllAtOnce` `at` (`groupAt` over each group's start), at
 * every place the home list may rest. The port names that group by the ids
 * of the boxes at four points under the list's top (`findAimAtTop`,
 * `features/find.contract`), so the property lays the list out as the
 * contract draws it (the head, then each group's sticky header and rows,
 * the header pinned at the top while its group scrolls under it and pushed
 * off by the next) and reads each point as `elementFromPoint` does: the
 * nearest box with an `id`. A header is named only when the contract gives
 * it an id (`ListHeader`, `features/list.contract`), so the property reads
 * that from the contract itself.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { groupAt, TAB_NAMES } from '@manna/hymnal-app/home/tabs';
import indexes from 'virtual:hymnal-indexes';

import { tabGroups } from '../home/tabs.ts';
import { book } from '../hymns/book.ts';
import { below, pick, seeded } from '../test/random.ts';
import { listedRows } from './follow.ts';
import { tileAt } from './tiles.ts';

const source = { book, indexes };

/** The points under the list's top `findAimAtTop` reads, in px. */
const PROBES = [2, 60, 120, 180];
/** How far under its top the list's content always reaches at rest: its port is taller than the deepest point, so the list's rows never end above it. */
const REACH = 200;

const contract = readFileSync(new URL('../../features/list.contract', import.meta.url), 'utf8');
const headerNamed = /component ListHeader\n[\s\S]*?\n {2}view\n {4}column [^\n]*\bid=id\b/u.test(
  contract,
);

interface Layout {
  readonly head: number;
  readonly header: number;
  readonly row: number;
  readonly starts: ReadonlyArray<number>;
  readonly ends: ReadonlyArray<number>;
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

/** The id `elementFromPoint` answers `y` px under the list's top with the list scrolled to `offset`. */
const hitAt = (layout: Layout, offset: number, y: number): string => {
  const { head, header, row, starts, ends, headers, rows } = layout;
  const headerId = (g: number) => (headerNamed ? (headers[g] ?? '') : 'hymn-list');
  const pinned = starts.findLastIndex((start) => start <= offset);
  if (pinned >= 0) {
    const top = Math.min(0, (ends[pinned] ?? 0) - offset - header);
    if (y >= top && y < top + header) return headerId(pinned);
  }
  const at = offset + y;
  if (at < head) return 'list-top';
  const g = starts.findLastIndex((start) => start <= at);
  if (g < 0 || at >= (ends[g] ?? 0)) return 'hymn-list';
  const start = starts[g] ?? 0;
  if (at < start + header) return g === pinned ? 'hymn-list' : headerId(g);
  return rows[g]?.[Math.floor((at - start - header) / row)] ?? 'hymn-list';
};

describe('All at once opens at the current app’s group', () => {
  test('at every place the list rests, on every tab, at generated text sizes', () => {
    const random = seeded(20261122);
    let near = 0;
    let tried = 0;
    const missed: Array<object> = [];
    for (let run = 0; run < 3; run++) {
      const favourites = Array.from({ length: below(random, 10) }, () => 1 + below(random, 695));
      const recent = Array.from({ length: below(random, 10) }, () => 1 + below(random, 695));
      const header = 30 + below(random, 60);
      const row = 40 + below(random, 90);
      const head = pick(random, [0, 120, 320]) + below(random, 80);
      for (const name of TAB_NAMES) {
        const groups = tabGroups(source, name, favourites, recent);
        const listed = listedRows(source, name, favourites, recent);
        const starts: Array<number> = [];
        const ends: Array<number> = [];
        const rows: Array<Array<string>> = [];
        let y = head;
        let taken = 0;
        for (const group of groups) {
          starts.push(y);
          rows.push(listed.slice(taken, taken + group.numbers.length).map((each) => each.id));
          taken += group.numbers.length;
          y += header + group.numbers.length * row;
          ends.push(y);
        }
        const kind = name === 'Sections' ? 'section' : 'group';
        const layout = {
          head,
          header,
          row,
          starts,
          ends,
          headers: groups.map((group) => `${kind}-${group.slug}`),
          rows,
        };
        const sampled = Array.from({ length: 12 }, () => starts[below(random, starts.length)] ?? 0);
        const offsets = [
          ...Array.from({ length: 12 }, () => below(random, Math.max(1, y))),
          ...sampled.flatMap((start) => [
            start - below(random, header + REACH),
            start - 40,
            start - 2,
          ]),
        ].filter((offset) => offset >= 0 && offset < y - REACH);
        for (const offset of offsets) {
          const ids = PROBES.map((probe) => hitAt(layout, offset, probe));
          const at = tileAt(source, name, ids, favourites, recent);
          const one = [groupAt(starts, offset), groupAt(starts, offset + 1)];
          if (one[0] !== one[1]) near += 1;
          tried += 1;
          if (!one.includes(at)) missed.push({ name, header, row, head, offset, ids, at, one });
        }
      }
    }
    expect(missed.slice(0, 3)).toEqual([]);
    expect(tried).toBeGreaterThan(300);
    expect(near).toBeGreaterThan(0);
  });
});
