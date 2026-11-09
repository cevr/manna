/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test: it drives the root in happy-dom through the need rig's promise-based taps over a disk in a plain map, the rig's `promises` part left out as null. */

/**
 * When the way to When I need… is offered (N1, R5) with a plan made,
 * through the need rig (`src/test/need-rig.tsx`), which faults any frame
 * that shows `When I need…` off home or beside `Listening`, and counts the
 * frames that offer it: home's bar offers it, Today never does, so a
 * recital's frames show `Listening` with no `When I need…`, and home
 * offers it again after the result. Where it is never offered is
 * `offer.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { launchNeed, needDevice, recordOf } from '../test/need-rig';
import { DAY } from '../test/session-model';

const NEED = 'When I need…';

const NOW = Date.UTC(2026, 4, 12, 15);

describe('the way to When I need…', () => {
  it('is home’s, never Today’s: not while Say it listens, and home offers it again after the result', async () => {
    const time = { now: NOW };
    const rig = await launchNeed(
      needDevice([recordOf(passage.reference, NOW - 3 * DAY)]),
      time,
      null,
      8,
    );
    expect(await rig.until(() => rig.has(NEED) && rig.has('Begin'))).toBe(true);
    await rig.tap('Begin');
    expect(await rig.until(() => rig.has('Say it'))).toBe(true);
    const offered = rig.frames.offer;
    time.now += 60_000;
    await rig.tap('Say it');
    expect(await rig.until(() => rig.has('Next'))).toBe(true);
    expect({
      listening: rig.frames.listening > 0,
      today: rig.has(NEED),
      offered: rig.frames.offer === offered,
    }).toEqual({ listening: true, today: false, offered: true });
    await rig.tap('Your field');
    expect(await rig.until(() => rig.has(NEED))).toBe(true);
    expect(rig.faults).toEqual([]);
    await rig.leave();
  });
});
