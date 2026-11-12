/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based act. */

import { describe, expect, it } from 'bun:test';

import { FLOORS, walkDevice } from '../test/tour-walk';

describe('the tour through the root, on a planted garden', () => {
  it('shows the screen and the tips the tour has after every generated command on two planted devices, the field and the disk unchanged across each replay', async () => {
    const moves = new Set<string>();
    for (const seed of [1, 13])
      for (const move of await walkDevice(seed, 30, false)) moves.add(move);
    expect(FLOORS.filter((move) => move !== 'off>tips' && !moves.has(move))).toEqual([]);
  });
});
