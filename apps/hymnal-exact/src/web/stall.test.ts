/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise, effect/noNewError, effect/noThrowStatement, eslint/no-await-in-loop -- a Bun test of a host watchdog on a fake clock and timer of its own: its checks are awaited functions that settle, throw or never settle, each step awaited in turn as the test moves the clock. */

/**
 * drive-web's watchdog (`tools/web/stall.ts`) on a fake clock and timer,
 * so its bounds hold exactly at any host load and the test reads no wall
 * time: a check that never settles ends `stalled` at its bound with the
 * step it was at, one that keeps marking steps runs past the bound to its
 * end, and one that throws ends with its step and error.
 */

import { describe, expect, test } from 'bun:test';

import { type Ended, makeStall } from '../../tools/web/stall.ts';

const STALL_MS = 40;
const EVERY_MS = 5;

/** A clock and timer the test moves by hand, with sleeps that end as it passes them. */
const fake = () => {
  let now = 0;
  let looks: Array<{ every: number; due: number; look: () => void }> = [];
  let sleeps: Array<{ due: number; wake: () => void }> = [];
  const clock = { now: () => now };
  const timer = {
    every: (ms: number, look: () => void) => {
      const entry = { every: ms, due: now + ms, look };
      looks.push(entry);
      return () => {
        looks = looks.filter((each) => each !== entry);
      };
    },
  };
  const sleep = (ms: number) =>
    new Promise<void>((wake) => {
      sleeps.push({ due: now + ms, wake });
    });
  /** The clock moved on by `ms`, one millisecond at a time, each look and sleep due run in turn. */
  const tick = async (ms: number) => {
    for (let step = 0; step < ms; step++) {
      now += 1;
      for (const entry of looks.filter((each) => each.due <= now)) {
        entry.due += entry.every;
        entry.look();
      }
      const woken = sleeps.filter((each) => each.due <= now);
      sleeps = sleeps.filter((each) => each.due > now);
      for (const each of woken) each.wake();
      await settle();
    }
  };
  return { clock, timer, sleep, tick, looking: () => looks.length };
};

/** Every promise callback queued so far run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** How `ending` ended once it settles, none before, read without waiting. */
const watched = (ending: Promise<Ended>) => {
  const seen: Array<Ended> = [];
  void ending.then((ended) => {
    seen.push(ended);
  });
  return seen;
};

describe('a drive check under the stall watchdog, on a fake clock', () => {
  test('a wait that never resolves ends stalled exactly at the bound, its step named', async () => {
    const { clock, timer, tick } = fake();
    const stall = makeStall(STALL_MS, EVERY_MS, clock, timer);
    const seen = watched(
      stall.watch(async () => {
        stall.mark('open /hymns/1');
        await new Promise(() => {});
      }),
    );
    await tick(STALL_MS - 1);
    expect(seen).toEqual([]);
    await tick(1);
    expect(seen).toEqual([{ ended: 'stalled', step: 'open /hymns/1', idleMs: STALL_MS }]);
  });

  test('a check that marks a step within each bound runs past it to its end', async () => {
    const { clock, timer, sleep, tick } = fake();
    const stall = makeStall(STALL_MS, EVERY_MS, clock, timer);
    const seen = watched(
      stall.watch(async () => {
        for (let i = 0; i < 6; i++) {
          stall.mark(`step ${i}`);
          await sleep(STALL_MS - 1);
        }
      }),
    );
    await tick(6 * (STALL_MS - 1));
    expect(seen).toEqual([{ ended: 'done' }]);
  });

  test('a check that throws ends with its step and error', async () => {
    const { clock, timer } = fake();
    const stall = makeStall(STALL_MS, EVERY_MS, clock, timer);
    const ended = await stall.watch(async () => {
      stall.mark('tap play');
      throw new Error('Sounds and haptics is on');
    });
    expect(ended).toEqual({
      ended: 'threw',
      step: 'tap play',
      error: 'Error: Sounds and haptics is on',
    });
  });

  test('each check counts from its own start, not the last step of the one before', async () => {
    const { clock, timer, sleep, tick } = fake();
    const stall = makeStall(STALL_MS, EVERY_MS, clock, timer);
    stall.mark('a step long ago');
    await tick(STALL_MS * 2);
    const seen = watched(stall.watch(async () => sleep(STALL_MS - 1)));
    await tick(STALL_MS - 1);
    expect(seen).toEqual([{ ended: 'done' }]);
  });

  test('the watchdog stops looking once its check ends', async () => {
    const { clock, timer, looking } = fake();
    const stall = makeStall(STALL_MS, EVERY_MS, clock, timer);
    expect(await stall.watch(async () => {})).toEqual({ ended: 'done' });
    expect(looking()).toBe(0);
  });
});
