/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part a: two generated devices of seed 3, ten commands each, held to the
 * walk's oracle after every command and to the screens' rules on every
 * frame. Its floors: unread passages, a visit over a held result, a
 * multi-verse visit said, a visit replaced and one kept over the field.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

describe('When I need…, walked (a)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(3, 2, 10);
    expect(failure).toBeNull();
    expect({
      unread: cover['gen:unread-passages'] ?? 0,
      opened: (cover['need:opened'] ?? 0) >= 3,
      multi: (cover['visit:multi-verse'] ?? 0) >= 2,
      said: (cover['visit:said'] ?? 0) >= 1,
      replaced: (cover['visit:replaced'] ?? 0) >= 2,
      afterHeld: (cover['visit:after-held'] ?? 0) >= 1,
      field: (cover['visit:kept-over-field'] ?? 0) >= 1,
    }).toEqual({
      unread: 1,
      opened: true,
      multi: true,
      said: true,
      replaced: true,
      afterHeld: true,
      field: true,
    });
  });
});
