/* oxlint-disable effect/noAsyncFunction -- each case plays a fixed device through the rig's promise-based runner. */

/**
 * The root route on fixed devices, through the same runner and oracles as
 * the generated walks (`src/test/first-rig.tsx`): the whole first minute with each
 * kind of tap, reading and recital, and one case for each defect a walk's
 * seed might not reach on its own: an all-missed recital in letters and
 * alone, each unheard ending staying put, refused and down writes before
 * the seed, Next during a reading, two Listen taps queued before a render,
 * an unread launch whose recital lands, and a relaunch mid-recital (the
 * `cancelled` ending: no screen cancels a recital, the runtime closing does).
 */

import { describe, expect, it } from 'bun:test';

import {
  play,
  WORDS,
  type Command,
  type DeviceStart,
  type LaunchKind,
  type Plan,
} from '../test/first-rig';

const OK: LaunchKind = { read: 'ok', held: false, voices: 1 };
const FRESH: DeviceStart = { parts: [], voice: 'absent', launch: OK };
const ALL = WORDS.map((_, index) => index);

const plan = (over: Partial<Plan> = {}): Plan => ({
  fallbacks: [],
  skip: [],
  extras: [],
  every: 3,
  cut: Number.MAX_SAFE_INTEGER,
  close: 'end',
  onFinish: 'end',
  ...over,
});

const say = (recital: Plan, write: 'lands' | 'refused' | 'down' = 'lands'): Command => ({
  _tag: 'Say',
  plan: recital,
  write,
});
const relaunch = (launch: LaunchKind = OK): Command => ({ _tag: 'Relaunch', launch });
const NEXT: Command = { _tag: 'Next' };
const RENEW: Command = { _tag: 'Renew' };
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
      say(plan({ skip: ALL, close: 'denied' })),
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
      say(plan({ skip: [10] })),
      say(plan(), 'refused'),
      say(plan({ skip: ALL, close: 'denied' })),
      say(plan({ skip: [10] })),
      { _tag: 'Continue' },
      relaunch({ read: 'unread', held: false, voices: 1 }),
    ]);
    expect([m.screen, m.passage]).toEqual(['unread', 1]);
  });

  it('goes on from letters and plants the seed after recitals with every word missed', async () => {
    const m = await play(FRESH, [NEXT, say(plan({ skip: ALL })), say(plan({ skip: ALL }))]);
    expect([m.screen, m.passage, m.shown?.record.grade, m.shown?.record.missed]).toEqual([
      'planted',
      1,
      1,
      WORDS.length,
    ]);
  });

  it('stays in letters and in alone after every unheard ending, each showing the alert', async () => {
    const unheard = [
      plan({ fallbacks: ['refuse', 'refuse', 'refuse'] }),
      plan({ fallbacks: ['fail', 'refuse', 'fail'] }),
      plan({ skip: ALL, close: 'denied' }),
      plan({ skip: ALL.slice(5), close: 'interrupted' }),
      plan({ skip: ALL.slice(9), close: 'error' }),
      plan({ skip: ALL, close: 'unavailable' }),
    ];
    const m = await play(FRESH, [
      NEXT,
      ...unheard.map((recital) => say(recital)),
      say(plan()),
      ...unheard.map((recital) => say(recital)),
    ]);
    expect([m.screen, m.said, m.passage]).toEqual(['alone', 'unheard', 0]);
  });

  it('shows no seed while the write is refused or the device is down, and plants it once a write lands', async () => {
    const m = await play(FRESH, [
      NEXT,
      say(plan()),
      say(plan(), 'refused'),
      say(plan(), 'down'),
      say(plan({ skip: [4] })),
      { _tag: 'Recover' },
      say(plan({ skip: [4] })),
    ]);
    expect([m.screen, m.passage]).toEqual(['planted', 1]);
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

  it('keeps the recital of an unread launch for the next launch, which opens Today in the done state, and at a seed once the seed is due and a new plan is made', async () => {
    const unread: DeviceStart = { ...FRESH, launch: { read: 'unread', held: false, voices: 0 } };
    const next = await play(unread, [say(plan({ skip: [2] })), relaunch()]);
    expect([next.screen, next.passage, next.plan?.passage]).toEqual(['today', 1, false]);
    const due = await play(unread, [say(plan({ skip: [2] })), relaunch(), RENEW]);
    expect([due.screen, due.passage, due.plan?.passage]).toEqual(['today', 1, true]);
  });

  it('cancels a recital held open when the app relaunches, in letters and in alone, and starts again at hear', async () => {
    const m = await play(FRESH, [
      NEXT,
      say(plan({ cut: 2 })),
      relaunch(),
      NEXT,
      say(plan()),
      say(plan({ cut: 4 })),
      relaunch({ read: 'ok', held: true, voices: 1 }),
      { _tag: 'Resolve' },
    ]);
    expect([m.screen, m.passage, m.disk.size]).toEqual(['hear', 0, 0]);
  });
});
