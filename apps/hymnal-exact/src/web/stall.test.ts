/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise, effect/noNewError, effect/noThrowStatement, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a Bun test of a host watchdog, a timer itself: its checks are awaited functions that settle, throw or never settle, and one takes its steps in turn across real time longer than the bound. */

/**
 * drive-web's watchdog (`tools/web/stall.ts`): a check that never settles
 * ends `stalled` within its bound with the step it was at, one that keeps
 * marking steps runs past the bound to its end, and one that throws ends
 * with its step and error.
 */

import { describe, expect, test } from 'bun:test';

import { makeStall } from '../../tools/web/stall.ts';

const STALL_MS = 40;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a drive check under the stall watchdog', () => {
  test('a wait that never resolves ends stalled within the bound, its step named', async () => {
    const stall = makeStall(STALL_MS, 5);
    const started = Date.now();
    const ended = await stall.watch(async () => {
      stall.mark('open /hymns/1');
      await new Promise(() => {});
    });
    const took = Date.now() - started;
    expect(ended).toMatchObject({ ended: 'stalled', step: 'open /hymns/1' });
    expect(took).toBeGreaterThanOrEqual(STALL_MS);
    expect(took).toBeLessThan(STALL_MS * 5);
  });

  test('a check that marks a step within each bound runs past it to its end', async () => {
    const stall = makeStall(STALL_MS, 5);
    const ended = await stall.watch(async () => {
      for (let i = 0; i < 6; i++) {
        stall.mark(`step ${i}`);
        await sleep(STALL_MS / 4);
      }
    });
    expect(ended).toEqual({ ended: 'done' });
  });

  test('a check that throws ends with its step and error', async () => {
    const stall = makeStall(STALL_MS, 5);
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
    const stall = makeStall(STALL_MS, 5);
    stall.mark('a step long ago');
    await sleep(STALL_MS * 2);
    expect(await stall.watch(async () => sleep(STALL_MS / 2))).toEqual({ ended: 'done' });
  });
});
