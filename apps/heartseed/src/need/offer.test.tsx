/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test: it drives the root in happy-dom through the need rig's promise-based taps over a disk in a plain map, the rig's `promises` part left out as null. */

/**
 * When the way to When I need… is offered (N1), through the need rig
 * (`src/test/need-rig.tsx`), which faults any frame that shows
 * `When I need…` off Today (the pending frame, the first minute) or beside
 * `Listening`, and counts the frames that offer it: never in the first
 * minute, an unread garden or over unread passages, where no plan is made;
 * and while Say it listens over a plan made, its button goes, so a frame
 * shows `Listening` with no `When I need…` and the result's frame offers it
 * again.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { launchNeed, needDevice, recordOf } from '../test/need-rig';
import { KEY } from '../test/passages-model';
import { DAY } from '../test/session-model';

const NEED = 'When I need…';

const NOW = Date.UTC(2026, 4, 12, 15);

/** Hands the screen a few more turns, so a late frame would show. */
const SETTLE = 60;

describe('the way to When I need…', () => {
  it('is never offered in the first minute, an unread garden or over unread passages', async () => {
    const first = await launchNeed(needDevice([]), { now: NOW });
    expect(await first.until(() => first.has('Say it') || first.has('Listen'))).toBe(true);
    await first.until(() => false, SETTLE);
    expect({ offer: first.frames.offer, faults: first.faults }).toEqual({ offer: 0, faults: [] });
    await first.leave();

    const unread = needDevice([recordOf(passage.reference, NOW - DAY)]);
    unread.unread = true;
    const garden = await launchNeed(unread, { now: NOW });
    expect(await garden.until(() => garden.has('Say it'))).toBe(true);
    await garden.until(() => false, SETTLE);
    expect({ offer: garden.frames.offer, faults: garden.faults }).toEqual({ offer: 0, faults: [] });
    await garden.leave();

    const garbled = needDevice([
      recordOf(passage.reference, NOW - DAY),
      [KEY, '[{"book":43,"chapter":15,"first":1}]'],
    ]);
    const passages = await launchNeed(garbled, { now: NOW });
    expect(await passages.until(() => passages.has('Your field'))).toBe(true);
    await passages.until(() => false, SETTLE);
    expect({ offer: passages.frames.offer, faults: passages.faults }).toEqual({
      offer: 0,
      faults: [],
    });
    await passages.leave();
  });

  it('goes while Say it listens, and comes back with the result', async () => {
    const time = { now: NOW };
    const rig = await launchNeed(
      needDevice([recordOf(passage.reference, NOW - 3 * DAY)]),
      time,
      null,
      8,
    );
    expect(await rig.until(() => rig.has(NEED) && rig.has('Say it'))).toBe(true);
    time.now += 60_000;
    await rig.tap('Say it');
    expect(await rig.until(() => rig.has('Next'))).toBe(true);
    expect({
      listening: rig.frames.listening > 0,
      offered: rig.has(NEED),
      faults: rig.faults,
    }).toEqual({ listening: true, offered: true, faults: [] });
    await rig.leave();
  });
});
