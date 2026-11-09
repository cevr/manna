/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part d: generated device 0 of seed 131, twenty-eight commands, held to
 * the walk's oracle on the screen its model names after every command and
 * to the screens' and the root's rules on every frame. Its floors, the
 * visits' counts over home's way in: the cards opened five times, four
 * multi-verse visits and four replaced. Two said and three over a held
 * result are `walk-d2.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-visit'];

describe('When I need…, walked (d)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(131, [0], 28);
    expect(failure).toBeNull();
    expect({
      opened: (cover['need:opened'] ?? 0) >= 5,
      multi: (cover['visit:multi-verse'] ?? 0) >= 4,
      replaced: (cover['visit:replaced'] ?? 0) >= 4,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({
      opened: true,
      multi: true,
      replaced: true,
      root: ROOT,
    });
  });
});
