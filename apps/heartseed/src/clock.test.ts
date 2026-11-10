/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the elapsed boundary measures real waits, independently of the test's settable instant; each wait is bounded by a fixed number of turns. */

import { describe, expect, it } from 'bun:test';
import { Clock, Effect } from 'effect';

import { clockOf } from './test/clock';
import { deadline } from './test/elapsed';

const INSTANT = Date.UTC(2026, 10, 10, 15);
const DAY = 86_400_000;

describe('the elapsed boundary', () => {
  it('expires while the test’s instant stands still, never because that instant jumps', async () => {
    const time = { now: INSTANT };
    const read = () => Effect.runSync(Clock.currentTimeMillis.pipe(Effect.provide(clockOf(time))));
    const late = deadline(30);
    expect(late()).toBe(false);
    time.now += 3650 * DAY;
    expect(read()).toBe(INSTANT + 3650 * DAY);
    expect(late()).toBe(false);
    time.now = INSTANT;
    let turns = 0;
    while (!late() && turns < 2000) {
      turns += 1;
      // oxlint-disable-next-line effect/noGlobals -- a real timer is the independent oracle for this elapsed-host-time boundary.
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(late()).toBe(true);
    expect(turns).toBeGreaterThan(0);
    expect(turns).toBeLessThan(2000);
    expect(read()).toBe(INSTANT);
  });

  it('keeps each deadline’s start and expires a zero-length deadline by the next turn', async () => {
    const none = deadline(0);
    const long = deadline(60_000);
    // oxlint-disable-next-line effect/noGlobals -- a real timer establishes the next turn without consulting the logical clock.
    await new Promise((resolve) => setTimeout(resolve, 3));
    expect([none(), long()]).toEqual([true, false]);
  });
});
