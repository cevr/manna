/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A's field walked through the root (`test/home-walk.ts`), part b:
 * device 0 of seed 10, fourteen commands, held to the walk's oracle after
 * every command and to the screens' and home A's rules on every frame. Its
 * floors, from the counts the device reaches: planted plants without a
 * dot, `Begin` shown and held back in the done state, a moved choice,
 * `Start here` on a planted verse, a landed remove, and the evening's
 * greeting.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:no-dot',
  'home:begin',
  'home:no-begin',
  'home:moved',
  'start:plant',
  'home:remove',
  'greeting:evening',
];

describe('home A, walked (b)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(10, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
