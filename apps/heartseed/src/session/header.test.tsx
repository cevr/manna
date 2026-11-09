/* oxlint-disable effect/noAsyncFunction -- a React screen test: it drives a launch of the root in happy-dom through React's promise-based `act`. */

/**
 * Today's header holds the minutes and the voice: the pending frame shows
 * no choice and no counts even with the views at hand, and the header's
 * walk (`src/test/header-walk.ts`) over devices 1-4, each with a recall
 * (the passage or another verse) and one of the four valid stored texts.
 * Devices 0 and 5-7 (absent and bad texts, the first minute) are
 * `header-b.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';

import { sessionView, voiceView } from '../app';
import { AT, deviceFor, headerCase } from '../test/header-walk';
import { faultsOf, launch } from '../test/session-rig';
import { initial } from '../voice/reading';

describe('Today’s header holds the minutes and the voice', () => {
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

  headerCase(226, [1, 2, 3, 4], {
    'stored:valid': 4,
    held: 2,
    unread: 2,
    'failed minutes read': 2,
    'failed voice read': 1,
    'relaunch after a landed tap': 3,
    'minutes tap': 6,
    'refused minutes tap': 1,
    'voice tap': 3,
    'voice tap to off': 1,
    'voice tap to her': 1,
    'voice tap to him': 1,
    'refused voice tap': 1,
    'tap while listening': 2,
    recital: 2,
    'new plan at the due': 2,
    'field and back': 2,
    wait: 2,
    'home:begin': 1,
    'home:done': 1,
  });
});
