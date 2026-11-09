/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based `act`, one awaited tap at a time. */

/**
 * A planted Handbook list's `Remove` beside ids this build does not know
 * (hshandbook R2, R5, R13, E) on generated readers through
 * `test/lists-walk.ts`, devices 11 and 20: an unknown stored id shows no
 * furrow, counts toward no limit, and stays stored in place through every
 * remove; an id stored twice goes whole; a refused write leaves the alert
 * and a retry lands.
 *
 * It catches an uproot that drops unknown ids and a field that shows or
 * counts one.
 */

import { expect, it } from 'bun:test';

import { walkListBars } from '../test/lists-walk';

it('keeps every unknown stored id in place through a planted list’s remove', async () => {
  const { faults, reached } = await walkListBars([11, 20], 4);
  expect(faults).toEqual([]);
  const floors: ReadonlyArray<readonly [string, number]> = [
    ['lists:unknown', 2],
    ['uproot:unknown kept', 2],
    ['uproot:an id stored twice, both gone', 1],
    ['uproot:Failed', 1],
    ['uproot:retry landed', 1],
  ];
  expect(floors.filter(([floor, n]) => (reached.get(floor) ?? 0) < n)).toEqual([]);
});
