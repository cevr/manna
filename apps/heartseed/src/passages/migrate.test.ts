/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish, effect/noThrowStatement, effect/noNewError -- each case launches the service over the device stand-in through its promise-run calls, writes and compares the stored keys as JSON text, reads absent keys as undefined, and refuses a write by throwing from the stand-in disk as a refused device write does. */

/**
 * The upgrade to the single verses (hsminlist), over a stored fixture: a
 * device as an earlier build left it, the passages key holding one-verse
 * passages planted by one tap (Proverbs 4:23, Proverbs 22:6, one of them
 * twice) beside a passage of six verses, and each of those verses' recalls
 * and moves back under their own keys.
 *
 * It catches a one-verse passage left as a list, a verse lost or doubled
 * in the move, the passage of six moved or reordered, a recall key touched
 * (a verse's stage, schedule and history are its records), a migration
 * that runs again at the next launch, the passages' key written before the
 * single verses' key landed, and a refused second write that loses a verse
 * or doubles one at the launch after.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Exit, Scope } from 'effect';

import { LISTS_KEY, PASSAGES_KEY, SINGLES_KEY } from '../passages';
import { device } from '../test/one';
import { launchPassages } from '../test/passages-rig';

const PROVERBS_4_23 = { book: 20, chapter: 4, first: 23, last: 23 };
const PROVERBS_22_6 = { book: 20, chapter: 22, first: 6, last: 6 };
const PSALM_23 = { book: 19, chapter: 23, first: 1, last: 6 };

/** The device as the earlier build left it: three one-verse passages (one repeated) around a psalm, a Handbook list, and the verses' records, opaque to the passages. */
const FIXTURE: ReadonlyArray<[string, string | null]> = [
  [PASSAGES_KEY, JSON.stringify([PROVERBS_4_23, PSALM_23, PROVERBS_22_6, PROVERBS_4_23])],
  [LISTS_KEY, JSON.stringify(['bhb-1695'])],
  ['heartseed/recall/Proverbs 4:23/1767225600000', '{"kept":"as stored, a"}'],
  ['heartseed/recall/Proverbs 4:23/1767312000000', '{"kept":"as stored, b"}'],
  ['heartseed/recall/Proverbs 22:6/1767225600000', '{"kept":"as stored, c"}'],
  ['heartseed/back/Proverbs 22:6/1767398400000', '{"kept":"as stored, d"}'],
];

/** The records of the fixture, every key but the passages', the lists' and the single verses'. */
const recordsOf = (disk: ReadonlyMap<string, string | null>) =>
  [...disk].filter(
    ([key]) => key.startsWith('heartseed/recall/') || key.startsWith('heartseed/back/'),
  );

/** One launch over the device as it stands: the view, the writes it took, and the service closed. */
const launch = async () => {
  device.calls.set = 0;
  const live = await Effect.runPromise(launchPassages);
  const view = await live.run(live.passages.view);
  const writes = device.calls.set;
  await Effect.runPromise(Scope.close(live.scope, Exit.void));
  return { view, writes, logs: live.logs };
};

describe('the upgrade to the single verses, over a stored fixture', () => {
  it('moves each one-verse passage into the single verses once, in stored order, the records untouched, and writes nothing at the next launch', async () => {
    device.launch(FIXTURE);
    const first = await launch();
    expect(first.view).toEqual({
      _tag: 'Read',
      passages: [PSALM_23],
      lists: ['bhb-1695'],
      singles: [PROVERBS_4_23, PROVERBS_22_6],
    });
    expect(first.writes).toBe(2);
    expect(device.disk.get(SINGLES_KEY)).toBe(JSON.stringify([PROVERBS_4_23, PROVERBS_22_6]));
    expect(device.disk.get(PASSAGES_KEY)).toBe(JSON.stringify([PSALM_23]));
    expect(device.disk.get(LISTS_KEY)).toBe(JSON.stringify(['bhb-1695']));
    expect(recordsOf(device.disk)).toEqual(FIXTURE.slice(2));
    expect(first.logs.some((line) => line.startsWith('passages.migrated {"passages":3}'))).toBe(
      true,
    );

    device.launch(device.disk);
    const second = await launch();
    expect(second.view).toEqual(first.view);
    expect(second.writes).toBe(0);
    expect(recordsOf(device.disk)).toEqual(FIXTURE.slice(2));
  });

  it('keeps the passages as stored when the single verses’ write is refused, and moves them at the next launch', async () => {
    device.launch(FIXTURE).fail('set', 1);
    const refused = await launch();
    expect(refused.view).toEqual({
      _tag: 'Read',
      passages: [PROVERBS_4_23, PSALM_23, PROVERBS_22_6, PROVERBS_4_23],
      lists: ['bhb-1695'],
      singles: [],
    });
    expect(device.disk.get(SINGLES_KEY)).toBeUndefined();
    expect(device.disk.get(PASSAGES_KEY)).toBe(FIXTURE[0]?.[1]);

    device.launch(device.disk);
    const next = await launch();
    expect(next.view).toEqual({
      _tag: 'Read',
      passages: [PSALM_23],
      lists: ['bhb-1695'],
      singles: [PROVERBS_4_23, PROVERBS_22_6],
    });
  });

  it('loses and doubles no verse when the passages’ write is refused after the single verses’ landed', async () => {
    device.launch([...FIXTURE, [SINGLES_KEY, JSON.stringify([PROVERBS_22_6])]]);
    device.disk.set(PASSAGES_KEY, JSON.stringify([PROVERBS_4_23, PSALM_23]));
    device.launch(device.disk);
    const want = {
      _tag: 'Read' as const,
      passages: [PSALM_23],
      lists: ['bhb-1695'],
      singles: [PROVERBS_22_6, PROVERBS_4_23],
    };
    const writes: string[] = [];
    const original = device.disk.set.bind(device.disk);
    device.disk.set = (key, value) => {
      writes.push(key);
      if (key === PASSAGES_KEY) throw new Error('test device: set refused');
      return original(key, value);
    };
    const refused = await launch().finally(() => {
      device.disk.set = original;
    });
    expect(writes).toEqual([SINGLES_KEY, PASSAGES_KEY]);
    expect(refused.view).toEqual(want);
    expect(device.disk.get(PASSAGES_KEY)).toBe(JSON.stringify([PROVERBS_4_23, PSALM_23]));

    device.launch(device.disk);
    const next = await launch();
    expect(next.view).toEqual(want);
    expect(device.disk.get(SINGLES_KEY)).toBe(JSON.stringify([PROVERBS_22_6, PROVERBS_4_23]));
    expect(device.disk.get(PASSAGES_KEY)).toBe(JSON.stringify([PSALM_23]));
  });
});
