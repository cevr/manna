/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based act. */

import { describe, expect, it } from 'bun:test';

import { TWO_REPLAYS, FLOORS, walkDevice } from '../test/tour-walk';

describe('the tour through the root, on a planted garden', () => {
  it('shows the screen and the tips the tour has after both replays, then every generated command on a planted device, the field and the disk unchanged across each replay', async () => {
    const moves = new Set<string>();
    for (const move of await walkDevice(1, 20, false, TWO_REPLAYS)) moves.add(move);
    expect(FLOORS.filter((move) => move !== 'off>tips' && !moves.has(move))).toEqual([]);
  });
});
