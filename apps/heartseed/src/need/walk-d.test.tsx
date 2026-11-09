/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part d: generated device 0 of seed 512, twenty-eight commands, held to
 * the walk's oracle on the screen its model names after every command and
 * to the screens' and the root's rules on every frame. Its floors, the
 * visits' counts that `walk-a-visit.test.tsx`'s device reached while When
 * I need… was a way from Today: the cards opened five times, four
 * multi-verse visits, two said, four replaced, and three over a held
 * result, each over home's way in.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-visit', 'root:back'];

describe('When I need…, walked (d)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(512, [0], 28);
    expect(failure).toBeNull();
    expect({
      opened: (cover['need:opened'] ?? 0) >= 5,
      multi: (cover['visit:multi-verse'] ?? 0) >= 4,
      said: (cover['visit:said'] ?? 0) >= 2,
      replaced: (cover['visit:replaced'] ?? 0) >= 4,
      afterHeld: (cover['visit:after-held'] ?? 0) >= 3,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({
      opened: true,
      multi: true,
      said: true,
      replaced: true,
      afterHeld: true,
      root: ROOT,
    });
  });
});
