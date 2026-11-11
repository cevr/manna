/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * The root walked over an unread garden (`test/home-walk.ts`), part f:
 * device 0 of seed 1 in the unread class (every listing fails, so the
 * garden is never read), ten commands. Every launch opens Today and never
 * home (R1); Today shows the app's passage with `Say it` and no counts
 * line, and no frame holds `Your field` (the root's rule over an unread
 * garden). Its floors: launches on Today, the first and relaunches the
 * next morning; recitals kept; Today checked to offer no minutes choice
 * (no `Settings`, no `<n> min`); a return to the foreground on Today, which
 * makes nothing. A minutes choice made is
 * `walk-b`'s floor, on a read garden.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

describe('the root, walked over an unread garden (f)', () => {
  it('opens Today at every launch, with no field in any frame', async () => {
    const { failure, cover } = await walkHome(1, [0], 10, 'unread');
    expect(failure).toBeNull();
    expect({
      launches: (cover['root:launch-unread'] ?? 0) >= 2,
      home: cover['root:launch-home'] ?? 0,
      said: (cover['today:said-unplanned'] ?? 0) >= 1,
      minutes: (cover['minutes:none-unread'] ?? 0) >= 1,
      morning: (cover['day:next-morning'] ?? 0) >= 1,
      wake: (cover['today:wake'] ?? 0) >= 1,
    }).toEqual({
      launches: true,
      home: 0,
      said: true,
      minutes: true,
      morning: true,
      wake: true,
    });
  });
});
