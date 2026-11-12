/* oxlint-disable effect/noAsyncFunction -- the walk drives the root through React's promise-based act. */

import { describe, expect, it } from 'bun:test';

import { FLOORS, walkDevice } from '../test/tour-walk';

describe('the tour through the root, from a fresh install', () => {
  it('shows the screen and the tips the tour has after the first minute and every generated command after it, the field and the disk unchanged across each replay', async () => {
    const moves = new Set(await walkDevice(1, 24, true));
    expect(FLOORS.filter((move) => !moves.has(move))).toEqual([]);
  });
});
