/* oxlint-disable effect/noAsyncFunction -- a React screen test: it drives a launch of the root in happy-dom through React's promise-based `act`. */

/**
 * The reader's choices across launches, read in the Settings sheet: the
 * pending frame shows no choice and no counts even with the views at hand,
 * and the header's walk (`src/test/header-walk.ts`) over devices 1 and 2,
 * each with a recall (the passage or another verse) and the stored texts
 * `2` and `5`: held listings, Minutes trips and Voice trips through the
 * whole cycle (the sheet's radio and pill, refused writes), relaunches over
 * landed writes, and the field and back. Devices 3 and 4 are
 * `header-c.test.tsx`'s;
 * devices 0 and 5-7 (absent and bad texts, the first minute) are
 * `header-b.test.tsx`'s and `header-d.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';

import { sessionView, voiceView } from '../app';
import { AT, deviceFor, headerCase } from '../test/header-walk';
import { faultsOf, launch } from '../test/session-rig';
import { initial } from '../voice/reading';

describe('The reader’s choices across launches, read in Settings', () => {
  it('shows no choice and no counts in the pending frame, even with the session’s and the voice’s views at hand', async () => {
    const seeded = [
      [
        sessionView,
        AsyncResult.success({ minutes: 10, plan: Option.some({ items: [] }) }),
        { skipInitialRun: true },
      ],
      [voiceView, AsyncResult.success(initial('off').view), { skipInitialRun: true }],
    ] as const;
    const app = await launch(
      deviceFor('passage', '10', 'off', 'false'),
      faultsOf({ listing: 'held' }),
      { now: AT },
      seeded,
    );
    await app.until(() => false, 15);
    expect({
      pending: app.frames.pending > 0,
      today: app.frames.today,
      shown: app.frames.shown,
      counts: app.frames.counts,
      faults: app.faults,
    }).toEqual({ pending: true, today: 0, shown: 0, counts: 0, faults: [] });
    await app.leave();
  });

  headerCase(1247, [1, 2], {
    'stored:valid': 2,
    held: 2,
    'failed voice read': 1,
    'relaunch after a landed tap': 3,
    'minutes tap': 6,
    'refused minutes tap': 1,
    'voice tap': 3,
    'settings:minutes': 1,
    'settings:voice': 1,
    'voice tap to off': 1,
    'voice tap to her': 1,
    'voice tap to him': 1,
    'refused voice tap': 1,
    'field and back': 2,
    wait: 2,
    'sheet at launch': 4,
    'home:begin': 1,
  });
});
