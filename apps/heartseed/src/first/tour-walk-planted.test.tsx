/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based act. */

import { describe, expect, it } from 'bun:test';

import { CHOSEN_REPLAY, FLOORS, walkDevice } from '../test/tour-walk';

describe('the tour through the root, on a planted garden', () => {
  it('shows the screen and the tips the tour has after a verse chosen and two replays, then every generated command on a planted device, the field (the chosen card among it) and the disk unchanged across each replay', async () => {
    const moves = new Set<string>();
    for (const move of await walkDevice(1, 20, false, CHOSEN_REPLAY)) moves.add(move);
    expect(FLOORS.filter((move) => move !== 'off>tips' && !moves.has(move))).toEqual([]);
  });
});
