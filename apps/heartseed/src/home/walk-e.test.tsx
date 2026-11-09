/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A's field walked through the root (`test/home-walk.ts`), part e:
 * device 0 of seed 14, fourteen commands, held to the walk's oracle after
 * every command and to the screens' and home A's rules on every frame. Its
 * floors, from the counts the device reaches: `Begin` tapped while a said
 * result is held, so Today must still show that result and its `Next`;
 * gold dots and planted plants without one, `Start here` on a phrase of the
 * plan, and the afternoon's greeting.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:begin-held',
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plan',
  'start:phrase',
  'greeting:afternoon',
];

describe('home A, walked (e)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(14, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
