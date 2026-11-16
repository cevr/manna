/* oxlint-disable effect/noAsyncFunction, no-await-in-loop -- each call is awaited in turn, as Exact asks its sources one by one. */

/**
 * A shelf's list planted through Add verses comes up in Today the way a
 * chooser range does: the session's plan is made again once the plant
 * lands, as the current Heartseed's session remakes it on each change of
 * the passages, so the verse is due without a relaunch; a refused plant
 * leaves the plan as it was.
 */

import { expect, it } from 'bun:test';

import { slugOf } from '../garden/view';
import { makeSessionPort } from '../test/session-model';

interface Screen {
  readonly session: {
    readonly wire: { readonly items: readonly { readonly reference: string }[] };
  };
}

const NOW = Date.UTC(2026, 10, 15, 13, 0, 0);

const itemsOf = (screen: Screen) => screen.session.wire.items.map((item) => item.reference);

it("plans a list planted from a shelf, and a short pick's verse, once each lands", async () => {
  for (const [id, verse] of [
    ['pick:psalms:19:1:1-3', 'Psalms 1:1'],
    ['pick:proverbs:20:4:23-23', 'Proverbs 4:23'],
  ] as const) {
    const port = makeSessionPort();
    const open = () => port.call<Screen>('todayOpen', ['home', '', '', '5', 'her', NOW, 7]);
    expect(itemsOf(await open())).toEqual([]);
    const planted = await port.call<{ answer: string }>('addPlant', [slugOf(id), NOW, 0, 7]);
    expect(planted.answer).toBe('Planted');
    expect(itemsOf(await open())).toEqual([verse]);
    const again = await port.call<{ answer: string }>('addPlant', ['nowhere', NOW, 0, 7]);
    expect(again.answer).toBe('Invalid');
    expect(itemsOf(await open())).toEqual([verse]);
  }
});

it("plans the chooser's one or two verses once they join the single verses", async () => {
  const port = makeSessionPort();
  const open = () => port.call<Screen>('todayOpen', ['home', '', '', '5', 'her', NOW, 7]);
  expect(itemsOf(await open())).toEqual([]);
  const joined = await port.call<{ answer: string }>('gardenJoin', [43, 3, 16, 17, NOW, 0, 7]);
  expect(joined.answer).toBe('Planted');
  const planned = itemsOf(await open());
  expect(planned).toEqual(['John 3:16']);
  const again = await port.call<{ answer: string }>('gardenJoin', [43, 3, 16, 17, NOW, 0, 7]);
  expect(again.answer).toBe('Already');
  expect(itemsOf(await open())).toEqual(planned);
});
