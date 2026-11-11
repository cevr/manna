/* oxlint-disable effect/noAsyncFunction -- each case plays a fixed device through the rig's promise-based runner. */

/**
 * The root route on fixed devices, through the same runner and oracles as
 * the generated walks (`src/test/first-rig.tsx`), the cases `root.test.tsx`
 * leaves to this part: each unheard ending staying put, refused and down
 * writes before the seed, an unread launch whose recital lands and the next
 * launches through home, and a relaunch mid-recital (the `cancelled` ending:
 * no screen cancels a recital, the runtime closing does).
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
const LATER: Command = { _tag: 'Later', launch: LAUNCH_OK };
const BEGIN: Command = { _tag: 'Begin' };

describe('the root route on fixed devices, unheard, refused and unread', () => {
  it('stays in letters and in alone after every unheard ending, each showing the alert', async () => {
    const unheard = [
      recital({ fallbacks: ['refuse', 'refuse', 'refuse'] }),
      recital({ fallbacks: ['fail', 'refuse', 'fail'] }),
      recital({ skip: ALL, close: 'denied' }),
      recital({ skip: ALL.slice(5), close: 'interrupted' }),
      recital({ skip: ALL.slice(9), close: 'error' }),
      recital({ skip: ALL, close: 'unavailable' }),
    ];
    const m = await play(FRESH, [
      NEXT,
      ...unheard.map((each) => sayOf(each)),
      sayOf(recital()),
      ...unheard.map((each) => sayOf(each)),
    ]);
    expect([m.screen, m.said, m.passage]).toEqual(['alone', 'unheard', 0]);
  });

  it('shows no seed while the write is refused or the device is down, and plants it once a write lands', async () => {
    const m = await play(FRESH, [
      NEXT,
      sayOf(recital()),
      sayOf(recital(), 'refused'),
      sayOf(recital(), 'down'),
      sayOf(recital({ skip: [4] })),
      { _tag: 'Recover' },
      sayOf(recital({ skip: [4] })),
    ]);
    expect([m.screen, m.passage]).toEqual(['planted', 1]);
  });

  it('keeps the recital of an unread launch for the next launch, which opens home in its done state, and Today at a seed by Start once Later relaunches at the seed’s due', async () => {
    const unread: DeviceStart = { ...FRESH, launch: { read: 'unread', held: false, voices: 0 } };
    const next = await play(unread, [sayOf(recital({ skip: [2] })), relaunch()]);
    expect([next.screen, next.passage, next.plan?.passage]).toEqual(['home', 1, false]);
    const due = await play(unread, [sayOf(recital({ skip: [2] })), relaunch(), LATER, BEGIN]);
    expect([due.screen, due.passage, due.plan?.passage]).toEqual(['today', 1, true]);
  });

  it('cancels a recital held open when the app relaunches, in letters and in alone, and starts again at hear', async () => {
    const m = await play(FRESH, [
      NEXT,
      sayOf(recital({ cut: 2 })),
      relaunch(),
      NEXT,
      sayOf(recital()),
      sayOf(recital({ cut: 4 })),
      relaunch({ read: 'ok', held: true, voices: 1 }),
      { _tag: 'Resolve' },
    ]);
    expect([m.screen, m.passage, m.disk.size]).toEqual(['hear', 0, 0]);
  });
});
