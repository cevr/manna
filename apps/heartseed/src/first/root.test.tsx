/* oxlint-disable effect/noAsyncFunction -- each case plays a fixed device through the rig's promise-based runner. */

/**
 * The root route on fixed devices, through the same runner and oracles as
 * the generated walks (`src/test/first-rig.tsx`): the whole first minute with each
 * kind of tap, reading and recital, and one case for each defect a walk's
 * seed might not reach on its own: an all-missed recital in letters and
 * alone, Next during a reading, and two Listen taps queued before a render.
 * The rest of the fixed devices are `root-b.test.tsx`'s, in the same part.
 */

import { describe, expect, it } from 'bun:test';

import {
  LAUNCH_OK,
  play,
  recital,
  sayOf,
  WORDS,
  type Command,
  type DeviceStart,
  type LaunchKind,
} from '../test/first-rig';

const FRESH: DeviceStart = { parts: [], voice: 'absent', launch: LAUNCH_OK };
const ALL = WORDS.map((_, index) => index);
const relaunch = (launch: LaunchKind = LAUNCH_OK): Command => ({ _tag: 'Relaunch', launch });
const NEXT: Command = { _tag: 'Next' };
const listen: Command = { _tag: 'Listen', speak: 'lands' };
const range: Command = { _tag: 'Range', kind: 'next', step: 0 };

describe('the root route on fixed devices', () => {
  it('walks the whole first minute: an interrupted reading, a skip, queued taps, each recital, the seed, Continue and an unread launch', async () => {
    const m = await play(FRESH, [
      listen,
      range,
      { _tag: 'Voice', kind: 'interrupt', stale: false },
      listen,
      { _tag: 'Range', kind: 'two', step: 0 },
      NEXT,
      sayOf(recital({ skip: ALL, close: 'denied' })),
      relaunch(),
      { _tag: 'Batch', labels: ['Listen', 'Next'], speak: 'lands' },
      relaunch(),
      { _tag: 'Batch', labels: ['Next', 'Listen'], speak: 'lands' },
      relaunch(),
      listen,
      range,
      range,
      { _tag: 'Range', kind: 'ahead', step: 3 },
      { _tag: 'Range', kind: 'behind', step: 1 },
      { _tag: 'Range', kind: 'stale', step: 0 },
      { _tag: 'Voice', kind: 'finish', stale: false },
      sayOf(recital({ skip: [10] })),
      sayOf(recital(), 'refused'),
      sayOf(recital({ skip: ALL, close: 'denied' })),
      sayOf(recital({ skip: [10] })),
      { _tag: 'Continue' },
      relaunch({ read: 'unread', held: false, voices: 1 }),
    ]);
    expect([m.screen, m.passage]).toEqual(['unread', 1]);
  });

  it('goes on from letters and plants the seed after recitals with every word missed', async () => {
    const m = await play(FRESH, [
      NEXT,
      sayOf(recital({ skip: ALL })),
      sayOf(recital({ skip: ALL })),
    ]);
    expect([m.screen, m.passage, m.shown?.record.grade, m.shown?.record.missed]).toEqual([
      'planted',
      1,
      1,
      WORDS.length,
    ]);
  });

  it('stops a reading at Next without touching the stored switch', async () => {
    const m = await play(FRESH, [listen, range, range, NEXT]);
    expect([m.screen, m.speaks, m.disk.size]).toEqual(['letters', 1, 0]);
  });

  it('reads the verse once for two Listen taps queued before a render', async () => {
    const m = await play(FRESH, [
      { _tag: 'Batch', labels: ['Listen', 'Listen'], speak: 'lands' },
      range,
      { _tag: 'Voice', kind: 'finish', stale: false },
    ]);
    expect([m.screen, m.speaks]).toEqual(['letters', 1]);
  });
});
