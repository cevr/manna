/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * A planted Handbook list's furrow on home (hshandbook R13, R14, E) on
 * generated readers through `test/lists-walk.ts`, devices 2 and 3: its
 * `Remove` asks, `Keep` keeps it, the ask's `Remove` takes the list away
 * once (twice in one turn makes one remove and no alert), a refused write
 * leaves the alert, an id stored twice goes whole, the plants stay (a verse
 * only the list named is a row of its own again), one verse shows one
 * stage in two furrows, the limit line counts the lists held, an uproot
 * lifts it, and a relaunch shows the stored lists again.
 *
 * It catches an ask named by the list's id, a remove without its busy ref,
 * an uproot of the first equal entry only, and a limit on home counted by
 * passages alone.
 */

import { expect, it } from 'bun:test';

import { walkListBars } from '../test/lists-walk';

it('removes a planted list once its write lands, after one ask, keeping its plants', async () => {
  const { faults, reached } = await walkListBars([2, 3], 4);
  expect(faults).toEqual([]);
  const floors: ReadonlyArray<readonly [string, number]> = [
    ['uproot:Removed', 2],
    ['uproot:Failed', 1],
    ['uproot:Keep', 1],
    ['uproot:twice', 1],
    ['uproot:an id stored twice, both gone', 1],
    ['uproot:a loose row returns', 1],
    ['limit:with a list held', 2],
    ['limit lifted by an uproot', 1],
    ['relaunch', 1],
    ['shared verse', 1],
  ];
  expect(floors.filter(([floor, n]) => (reached.get(floor) ?? 0) < n)).toEqual([]);
});
