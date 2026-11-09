/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a React screen test: it drives a rig's promise-based launch and waits one after another, over a disk whose recall is written as the garden writes it (JSON). */

/**
 * The rig contract (hshomerigs R2, R3), for every rig of Today's run: a
 * launch on an unread garden opens Today alone, with no `Your field` in any
 * frame, and every frame holds to the root's frame rule (`watchedLaunch`).
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { keyOf } from '../test/garden-model';
import { screensOf, watchedLaunch } from '../test/root-rule';
import { deviceOf, launch } from '../test/run-rig';

const T0 = Date.UTC(2026, 3, 1, 9);

/** The passage recalled with Good long before `T0`, so it is due at `T0`. */
const DUE = recallOf(passage.reference, Date.UTC(2020, 0, 1, 12), 3, 0);

describe('every rig of Today’s run launches through home', () => {
  it('an unread garden opens Today alone, with no Your field in any frame', async () => {
    const w = await watchedLaunch('unread', () =>
      launch(
        deviceOf([[keyOf(DUE), JSON.stringify(DUE)]]),
        { unread: true, refuse: false },
        { now: T0 },
      ),
    );
    expect(await w.app.until(() => w.today() && w.app.has('Say it'))).toBe(true);
    expect({
      screens: screensOf(w.watch.frames).filter((each) => each !== 'pending'),
      field: w.watch.frames.some((frame) => frame.headings.includes('Your field')),
      faults: w.watch.faults,
    }).toEqual({ screens: ['Today'], field: false, faults: [] });
    expect(await w.end()).toEqual([]);
  });
});
