/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- each case launches the service over the device stand-in through its promise-run calls, and writes and compares the stored keys as JSON text. */

/**
 * The single verses at the service's seam (hsminlist): `add` of fewer than
 * 3 verses answers `Short` and writes nothing; `join` puts each verse of a
 * short pick not single already last among the single verses, answers
 * `Held` when each is single already, `Full` past 20 and `Failed` with the
 * view kept when its write is refused; `part` takes a single verse out,
 * `Absent` when it is not one. None of them counts toward the 3 lists or
 * touches the passages' key.
 *
 * It catches a list of one or two verses stored, a verse doubled among the
 * single verses, a cap counted on the lists or not at all, a refused write
 * that changes the view, and a join or part that writes the passages.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Exit, Scope } from 'effect';

import { PASSAGES_KEY, SINGLES_KEY, type Range } from '../passages';
import { device } from '../test/one';
import { launchPassages } from '../test/passages-rig';

const one = (verse: number): Range => ({ book: 20, chapter: 4, first: verse, last: verse });
const PAIR: Range = { book: 20, chapter: 3, first: 5, last: 6 };
const PSALM: Range = { book: 19, chapter: 23, first: 1, last: 3 };

/** Runs `body` over the service launched on the device as it stands, then closes it. */
const withPassages = async <A>(
  body: (live: Effect.Success<typeof launchPassages>) => Promise<A>,
): Promise<A> => {
  const live = await Effect.runPromise(launchPassages);
  return body(live).finally(() => Effect.runPromise(Scope.close(live.scope, Exit.void)));
};

describe('the single verses at the service', () => {
  it('answers Short for an add of 1 or 2 verses, joins a short pick verse by verse once, and parts a single verse', async () => {
    device.launch([[PASSAGES_KEY, JSON.stringify([PSALM])]]);
    await withPassages(async (live) => {
      const answers = [
        await live.run(live.passages.add(one(23))),
        await live.run(live.passages.add(PAIR)),
        await live.run(live.passages.join(PAIR)),
        await live.run(live.passages.join({ ...PAIR, first: 6, last: 6 })),
        await live.run(live.passages.join(one(23))),
        await live.run(live.passages.part({ ...PAIR, first: 5, last: 5 })),
        await live.run(live.passages.part(one(1))),
      ];
      expect(answers).toEqual(['Short', 'Short', 'Added', 'Held', 'Added', 'Removed', 'Absent']);
      expect(await live.run(live.passages.view)).toEqual({
        _tag: 'Read',
        passages: [PSALM],
        lists: [],
        singles: [{ ...PAIR, first: 6, last: 6 }, one(23)],
      });
    });
    expect({
      passages: device.disk.get(PASSAGES_KEY),
      singles: device.disk.get(SINGLES_KEY),
    }).toEqual({
      passages: JSON.stringify([PSALM]),
      singles: JSON.stringify([{ ...PAIR, first: 6, last: 6 }, one(23)]),
    });
  });

  it('answers Full past 20 single verses whatever the lists held, and Failed with the view kept when the write is refused', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => one(index + 1));
    device.launch([[SINGLES_KEY, JSON.stringify(twenty.slice(0, 19))]]);
    await withPassages(async (live) => {
      device.fail('set', 1);
      const refused = await live.run(live.passages.join(one(20)));
      device.fail('set', 0);
      const before = await live.run(live.passages.view);
      const answers = [
        refused,
        await live.run(live.passages.join(one(20))),
        await live.run(live.passages.join(one(21))),
        await live.run(live.passages.add(PSALM)),
      ];
      expect(answers).toEqual(['Failed', 'Added', 'Full', 'Added']);
      expect(before).toEqual({
        _tag: 'Read',
        passages: [],
        lists: [],
        singles: twenty.slice(0, 19),
      });
    });
    expect(device.disk.get(SINGLES_KEY)).toBe(JSON.stringify(twenty));
  });
});
