/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part a's visits: generated device 1 of seed 3, ten commands, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens' and the root's rules on every frame. Its floors: a visit
 * kept over home, When I need… opened from home, left by its `Your field`
 * and left by a promise, and no launch over unread passages (seed 3's one
 * is device 0's, `walk-a.test.tsx`). The visits' counts this device
 * reached when When I need… was a way from Today (the cards opened five
 * times, four multi-verse visits, two said, four replaced, three over a
 * held result) are `walk-d.test.tsx`'s, whose device reaches them on the
 * root's screens.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-back', 'root:need-visit', 'root:back'];

describe('When I need…, walked (a, the visits)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(3, [1], 10);
    expect(failure).toBeNull();
    expect({
      unread: cover['gen:unread-passages'] ?? 0,
      field: (cover['visit:kept-over-field'] ?? 0) >= 1,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({ unread: 0, field: true, root: ROOT });
  });
});
