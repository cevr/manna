/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part a's visits: generated device 1 of seed 3, ten commands, held to the
 * walk's oracle after every command and to the screens' rules on every
 * frame. Its floors: the cards opened, multi-verse visits, a visit said, a
 * visit replaced, a visit over a held result and one kept over the field,
 * and no launch over unread passages (seed 3's one is device 0's,
 * `walk-a.test.tsx`).
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

describe('When I need…, walked (a, the visits)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(3, [1], 10);
    expect(failure).toBeNull();
    expect({
      unread: cover['gen:unread-passages'] ?? 0,
      opened: (cover['need:opened'] ?? 0) >= 5,
      multi: (cover['visit:multi-verse'] ?? 0) >= 4,
      said: (cover['visit:said'] ?? 0) >= 2,
      replaced: (cover['visit:replaced'] ?? 0) >= 4,
      afterHeld: (cover['visit:after-held'] ?? 0) >= 3,
      field: (cover['visit:kept-over-field'] ?? 0) >= 1,
    }).toEqual({
      unread: 0,
      opened: true,
      multi: true,
      said: true,
      replaced: true,
      afterHeld: true,
      field: true,
    });
  });
});
