/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part h: device 0
 * of seed 166, twelve commands from its launch on home, with `Start` on home
 * after a wait (`waitBegin`), held to the walk's oracle on the screen its
 * model names after every command and to the screens', the root's and
 * home A's rules on every frame. Its floor `home:wait-begin` is a wait of
 * hours on home, no visit or hold kept, after which a plan made at the
 * later instant would show Today otherwise: Today must still show the plan
 * made at home's first show. Its other floors: `Start`, `Your field`, a
 * landed remove and a return to the foreground on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:wait-begin',
  'root:begin',
  'home:begin',
  'root:back',
  'home:remove',
  'home:wake',
];

describe('home A, walked (h)', () => {
  it("keeps the plan made at home's first show when Start follows a wait on home", async () => {
    const { failure, cover } = await walkHome(166, [0], 12, 'read', { waits: true });
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
