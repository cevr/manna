/* oxlint-disable effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so no row is `undefined`. */

/**
 * The home list follows the drums as the current app's does: over
 * generated lists (every tab, generated favourites and recents) and
 * generated numbers, the row the port scrolls to is the one the current
 * app's `foundOffset` picks from the same rows, laid out one after another,
 * and none (the list stays) where it picks none.
 */

import { describe, expect, test } from 'bun:test';

import { TAB_NAMES } from '@manna/hymnal-app/home/tabs';
import { foundOffset } from '@manna/hymnal-app/player/drums';
import indexes from 'virtual:hymnal-indexes';

import { book } from '../hymns/book.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import { followRow, listedRows } from './follow.ts';

const source = { book, indexes };

const numbersOf = (random: Random): Array<number> =>
  Array.from({ length: below(random, 10) }, () => 1 + below(random, 695));

describe('the list follows the drums', () => {
  test('to the row `foundOffset` picks, over generated lists and numbers', () => {
    const random = seeded(1863);
    let found = 0;
    let stayed = 0;
    for (let run = 0; run < 200; run++) {
      const name = pick(random, TAB_NAMES);
      const rows = listedRows(source, name, numbersOf(random), numbersOf(random));
      const placed = rows.map((row, at) => ({
        number: row.number,
        offset: at * 44 + below(random, 3),
      }));
      for (let asked = 0; asked < 10; asked++) {
        const n = 1 + below(random, 695);
        const offset = foundOffset(placed, n);
        const row = followRow(rows, n);
        if (offset._tag === 'None') {
          stayed += 1;
          expect(row).toBe('');
        } else {
          found += 1;
          const at = placed.findIndex((each) => each.offset === offset.value);
          expect(row).toBe(rows[at]?.id ?? 'none');
          expect(row).toBe(`hymn-${n}`);
        }
      }
    }
    expect(found).toBeGreaterThan(200);
    expect(stayed).toBeGreaterThan(50);
  });
});
