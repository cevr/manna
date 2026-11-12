/* oxlint-disable effect/noAsyncFunction, eslint/no-await-in-loop, effect/noGlobals, effect/noNullish -- each case drives the root through the bar rig's promise-based act, one awaited tap at a time, writes the device's passages as JSON text, and reads DOM absence as null. */

/**
 * Two edges of the tour through the root, on a planted garden over the
 * bar rig (`src/test/bar-rig.tsx`, whose every frame holds the root's
 * rule, hsintro's clauses among them), that the generated tour walk does
 * not reach:
 * - a recital that starts listening while home shows the replayed welcome
 *   forces Today and ends the tour, so `Your field` after it shows home,
 *   not the welcome again (a recital started from beside the root, as no
 *   control of home starts one);
 * - with three lists held, the replay's tips show `tip-1` and `tip-3` and
 *   no `tip-2`, which sits only beside `Add a list`.
 */

import { useAtomSet } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { sayAs } from '../app';
import { PASSAGES_KEY } from '../passages';
import type { Recital } from '../sayit';
import { mountBar } from '../test/bar-rig';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { device } from '../test/one';

const PLANTED: readonly (readonly [string, string])[] = [
  record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)),
  record(recallOf(passage.reference, Date.UTC(2026, 9, 2), 3, 0)),
  ['heartseed/voice/enabled', 'false'],
];

/** Three passages held: the most a reader may hold, so home offers no add. */
const THREE: readonly (readonly [string, string])[] = [
  [
    PASSAGES_KEY,
    JSON.stringify([
      { book: 19, chapter: 23, first: 1, last: 3 },
      { book: 43, chapter: 15, first: 1, last: 5 },
      { book: 45, chapter: 8, first: 28, last: 28 },
    ]),
  ],
];

const headingsOf = (host: Element) =>
  [...host.querySelectorAll('[role="heading"]')].map((node) => (node.textContent ?? '').trim());

const tipsOf = (host: Element) =>
  [...host.querySelectorAll('[data-testid^="tip-"]')].map((node) =>
    node.getAttribute('data-testid'),
  );

/** The recital the test starts from beside the root: Say it's own, as a screen's press starts it. */
const reciter = { say: (_: Recital) => {} };

function Reciter() {
  reciter.say = useAtomSet(sayAs);
  return false;
}

describe('the tour’s edges through the root', () => {
  it('ends the replay when a recital starts listening, forcing Today, so Your field shows home', async () => {
    device.launch([...PLANTED]);
    const rig = await mountBar(0, false, <Reciter />);
    expect(await rig.until(() => headingsOf(rig.host).includes('Your field'))).toBe(true);
    expect(await rig.tap('How Heartseed works')).toBe(true);
    expect(await rig.until(() => headingsOf(rig.host).includes('Heartseed'))).toBe(true);
    await act(async () => reciter.say({ cue: 'none', keep: false }));
    expect(await rig.until(() => headingsOf(rig.host).includes('Today'))).toBe(true);
    expect(await rig.until(() => rig.control('Listening') === undefined)).toBe(true);
    expect(await rig.tap('Your field')).toBe(true);
    await rig.until(() => headingsOf(rig.host).includes('Your field'));
    expect({ headings: headingsOf(rig.host), tips: tipsOf(rig.host), faults: rig.faults }).toEqual({
      headings: ['Your field'],
      tips: [],
      faults: [],
    });
    await rig.leave();
  });

  it('shows no tip-2 at the limit of three lists held, tip-1 and tip-3 beside the limit line', async () => {
    device.launch([...PLANTED, ...THREE]);
    const rig = await mountBar(0, false);
    expect(await rig.until(() => headingsOf(rig.host).includes('Your field'))).toBe(true);
    for (const tap of ['How Heartseed works', 'Begin', 'See your field']) {
      expect(await rig.until(() => rig.control(tap) !== undefined)).toBe(true);
      await rig.tap(tap);
    }
    expect(await rig.until(() => tipsOf(rig.host).length > 0)).toBe(true);
    expect({
      tips: tipsOf(rig.host),
      limit: rig.host.querySelector('[data-testid="limit"]') !== null,
      add: rig.host.querySelector('[data-testid="add-list"]') !== null,
      faults: rig.faults,
    }).toEqual({ tips: ['tip-1', 'tip-3'], limit: true, add: false, faults: [] });
    await rig.leave();
  });
});
