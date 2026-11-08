/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part a: generated device 0 of seed 3, ten commands, held to the walk's
 * oracle after every command and to the screens' rules on every frame. Its
 * floor: the one launch over unread passages that seed 3 makes. Device 1 of
 * the seed, its visits, is `walk-a-visit.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

describe('When I need…, walked (a)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(3, [0], 10);
    expect(failure).toBeNull();
    expect({ unread: cover['gen:unread-passages'] ?? 0 }).toEqual({ unread: 1 });
  });
});
