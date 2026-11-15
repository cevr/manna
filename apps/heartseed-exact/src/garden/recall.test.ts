/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, eslint/no-await-in-loop -- a test over the port's sources: each call is awaited in turn as Exact asks them, and the storage stand-in throws as Exact's refuses. */

/**
 * A recall after Show all on a grown verse moves it back a stage and keeps
 * the recall: one write of the file, so no later call reads the step back
 * without its recall. When that one write fails, the file is as it was,
 * the call answers `Failed`, and the verse it answers is the file's.
 */

import { expect, it } from 'bun:test';

import { makePort, storageOf } from '../test/garden-model';
import type { GardenVerseChange } from './sources';

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const REFERENCE = 'John 3:16';

const recallAt = (now: number) => ({
  startedAt: now,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 25,
  missed: 0,
  peeked: 0,
  extra: 0,
});

/** A port with John 3:16-18 planted and John 3:16 grown past a seed by Good recalls a few days apart; the instant after. */
const grown = async (stand: ReturnType<typeof storageOf>) => {
  const port = makePort(stand);
  await port.call('gardenPlant', [43, 3, 16, 18, START, 0, 1]);
  let now = START;
  for (let day = 0; day < 12; day++) {
    const kept = await port.call<GardenVerseChange>('gardenRecall', [
      REFERENCE,
      recallAt(now),
      { peeked: [], shownAt: null, cap: 4 },
      now,
      0,
      1,
    ]);
    if (kept.verse.stage !== 'seed')
      return { port, now: now + 3 * DAY, stage: kept.verse.stage, recalls: kept.verse.recalls };
    now += (day + 1) * DAY;
  }
  throw new Error('John 3:16 never grew');
};

const shownAll = (now: number) => [
  REFERENCE,
  recallAt(now),
  { peeked: [], shownAt: now - 1000, cap: 4 },
  now,
  0,
  1,
];

it('writes a step back and its recall in one write', async () => {
  const stand = storageOf();
  const { port, now, stage, recalls } = await grown(stand);
  const before = stand.counts.writes;
  const kept = await port.call<GardenVerseChange>('gardenRecall', shownAll(now));
  expect({ answer: kept.answer, writes: stand.counts.writes - before }).toEqual({
    answer: 'Kept',
    writes: 1,
  });
  expect(kept.verse.stage).not.toBe(stage);
  expect(kept.verse.recalls).toBe(recalls + 1);
});

it('never leaves the step back in the file without its recall, when a write after the first fails', async () => {
  const stand = storageOf();
  const { port, now, stage, recalls } = await grown(stand);
  const write = stand.storage.fs.atomicWriteFile;
  let writes = 0;
  Object.assign(stand.storage.fs, {
    atomicWriteFile: (path: string, data: Uint8Array) => {
      writes++;
      if (writes > 1) throw Object.assign(new Error('refused'), { code: 'EIO' });
      return write(path, data);
    },
  });
  await port.call<GardenVerseChange>('gardenRecall', shownAll(now));
  Object.assign(stand.storage.fs, { atomicWriteFile: write });
  port.relaunch();
  const read = await port.call<{
    lists: { verses: { reference: string; stage: string; recalls: number }[] }[];
  }>('gardenRead', [0, now, 1]);
  const after = read.lists[0]?.verses.find((verse) => verse.reference === REFERENCE);
  const moved = after?.stage !== stage;
  const recalled = (after?.recalls ?? 0) > recalls;
  expect({ moved, recalled }).toEqual({ moved: recalled, recalled });
});

it('leaves the file as it was, and answers Failed, when the one write fails', async () => {
  const stand = storageOf();
  const { port, now } = await grown(stand);
  const file = stand.files.get([...stand.files.keys()][0] ?? '');
  const read = await port.call<{
    lists: { verses: { reference: string; stage: string; recalls: number }[] }[];
  }>('gardenRead', [0, now, 1]);
  const was = read.lists[0]?.verses.find((verse) => verse.reference === REFERENCE);
  const write = stand.storage.fs.atomicWriteFile;
  Object.assign(stand.storage.fs, {
    atomicWriteFile: () => {
      throw Object.assign(new Error('refused'), { code: 'EIO' });
    },
  });
  const failed = await port.call<GardenVerseChange>('gardenRecall', shownAll(now));
  Object.assign(stand.storage.fs, { atomicWriteFile: write });
  expect(failed.answer).toBe('Failed');
  expect([...stand.files.values()][0]).toBe(file);
  expect([failed.verse.stage, failed.verse.recalls]).toEqual([
    was?.stage ?? 'none',
    was?.recalls ?? -1,
  ]);
});
