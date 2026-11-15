/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test awaits each answer in turn, as the host asks them one by one, and its storage stub answers as Exact's does. */

/**
 * The data module runs where Exact runs it: inside `withDataHost`, where
 * the clock, randomness and the timers throw as they do on Hermes, every
 * source is called through `app.ts`'s `answer` for seeded sequences of
 * calls, over a storage that answers at once (so every rule a call starts
 * runs inside the host) and sometimes fails. No call throws, and every
 * answer is a screen.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { writePassage } from '../tools/passage';
import { seeded, type Random } from './test/random';
import { RECALL_FILE } from './today/sources';
import type { TodayView } from './today/view';

writePassage();
const app = await import('./test/app.js');

const SEQUENCES = 40;
const CALLS = 30;

/** Kept files: one result as Next writes it, one with help, and texts it never writes. */
const KEPT = [
  '{"reference":"Isaiah 41:10","recall":{"reference":"Isaiah 41:10","startedAt":1763000000000,"offset":-300,"grade":3,"suggested":3,"words":37,"missed":0,"peeked":0,"extra":0},"help":null}',
  '{"reference":"Isaiah 41:10","recall":{"reference":"Isaiah 41:10","startedAt":1763000000000,"offset":-300,"grade":2,"suggested":2,"words":37,"missed":1,"peeked":1,"extra":0},"help":{"reference":"Isaiah 41:10","peeked":[4],"shownAt":null,"cap":2}}',
  '{"right":3,"total":37}',
  '{"reference":"Isaiah 41:10","recall":{"grade":9}}',
  '',
];

/** A promise that never settles: what a stub's `then` hands back, since `settle` reads only its callbacks. */
const pending: PromiseLike<never> = { then: () => pending };

/** An answer already there: its callbacks run inside the call that asked. */
const now = <A>(value: A, fails: boolean): PromiseLike<A> => ({
  then: (ok, bad) => {
    if (fails) bad?.(new Error('stub storage refused'));
    else ok?.(value);
    return pending;
  },
});

const storageOf = (random: Random) => {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    fs: {
      readFile: (path: string) => {
        const file = files.get(path);
        return now(file ?? new ArrayBuffer(0), file === undefined || random.chance(0.1));
      },
      atomicWriteFile: (path: string, bytes: Uint8Array) => {
        const fails = random.chance(0.1);
        if (!fails) files.set(path, Uint8Array.from(bytes).buffer);
        return now(undefined, fails);
      },
    },
  };
};

const callOf = (
  random: Random,
  last: TodayView | undefined,
): readonly [string, readonly unknown[]] => {
  const id = random.pick(['', 'utterance-1', 'recognition-1', 'x']);
  const words = last?.words.length ?? 1;
  const at = random.pick([1_763_000_000_000, 0, -1, Number.NaN]);
  switch (random.below(17)) {
    case 9:
      return ['todayCue', [random.pick(['none', 'initials', 'full', 'x'])]];
    case 10:
      return ['todayPeek', [random.below(words + 2) - 1]];
    case 11:
      return ['todayPeekEnded', [random.below(words + 2) - 1]];
    case 12:
      return ['todayShowAll', [at]];
    case 13:
      return ['todayGrade', [random.below(6)]];
    case 14:
    case 15:
      return ['todayNext', []];
    case 16:
      return ['todayAgain', []];
    case 0:
      return ['todayBoot', []];
    case 1:
      return ['todayHear', [id]];
    case 2:
      return ['todayVoice', [id, random.below(300) - 5, random.below(words) - 1]];
    case 3:
      return ['todayVoiceEnded', [id, random.pick(['end', 'error', 'cancel'])]];
    case 4:
      return ['todayStop', []];
    case 5:
      return ['todaySay', [id, at]];
    case 6:
      return [
        'todayHeard',
        [id, random.pick(['', 'fear thou not', 'the thigh yeah', 'Ω 42']), random.chance(0.5)],
      ];
    case 7:
      return ['todayFinish', []];
    default:
      return ['todayDenied', []];
  }
};

it('answers every source inside the data host, for seeded call sequences', async () => {
  for (let seed = 1; seed <= SEQUENCES; seed++) {
    const random = seeded(seed);
    const storage = storageOf(random);
    if (random.chance(0.5))
      storage.files.set(
        RECALL_FILE,
        Uint8Array.from(random.pick(KEPT), (c) => c.charCodeAt(0)).buffer,
      );
    let last: TodayView | undefined;
    for (let n = 0; n < CALLS; n++) {
      const [source, args] = callOf(random, last);
      const answered = withDataHost(() =>
        Reflect.apply(app.answer, undefined, [source, args, {}, storage, {}]),
      );
      last = await answered;
      expect(last?.words.length).toBeGreaterThan(0);
    }
  }
});

/** A storage like Exact's for the garden: no file is `ENOENT`, and a read or write fails now and then. */
const gardenStorageOf = (random: Random) => {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    fs: {
      readFile: async (path: string) => {
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        if (random.chance(0.01)) throw Object.assign(new Error('refused'), { code: 'EIO' });
        return file;
      },
      atomicWriteFile: async (path: string, bytes: Uint8Array) => {
        if (random.chance(0.05)) throw Object.assign(new Error('refused'), { code: 'EIO' });
        files.set(path, Uint8Array.from(bytes).buffer);
      },
    },
  };
};

const START = Date.UTC(2026, 10, 15, 13, 0, 0);

/** One garden call: its source and arguments, the zone's offset, the time and the seed last, as the Contract sends them. */
const gardenCallOf = (random: Random, now: number): readonly [string, readonly unknown[]] => {
  const offset = random.pick([-300, 0, 330]);
  const reference = random.pick(['John 3:16', 'John 3:17', 'Psalms 119:1', 'Nowhere 1:1', '']);
  const recall = {
    startedAt: now,
    offset,
    grade: random.pick([1, 2, 3, 4, 7]),
    suggested: random.pick([1, 2, 3]),
    words: 10,
    missed: random.below(11),
    peeked: random.below(3),
    extra: 0,
  };
  const help = random.pick([
    { peeked: [], shownAt: null, cap: 4 },
    { peeked: [0], shownAt: null, cap: 2 },
    { peeked: [0, 1, 2], shownAt: now - 1000, cap: 2 },
    { peeked: 'x', shownAt: null, cap: 4 },
  ]);
  const seed = random.below(2 ** 32);
  switch (random.below(6)) {
    case 0:
      return ['gardenRead', [offset, now, seed]];
    case 1:
      return [
        'gardenPlant',
        [
          random.pick([43, 19, 0]),
          random.pick([3, 119]),
          random.below(20),
          random.below(22),
          now,
          offset,
          seed,
        ],
      ];
    case 2:
      return [
        'gardenRemove',
        [
          random.pick(['passage:0:43.3.16-18', 'single:Psalms 119:1', 'single:x', '']),
          now,
          offset,
          seed,
        ],
      ];
    case 3:
      return ['gardenRecall', [reference, recall, help, now, offset, seed]];
    case 4:
      return ['gardenBack', [reference, now, offset, seed]];
    default:
      return ['gardenDrive', []];
  }
};

it('answers every garden source inside the data host, for seeded call sequences over a failing storage', async () => {
  for (let seed = 1; seed <= SEQUENCES; seed++) {
    const random = seeded(seed);
    const storage = gardenStorageOf(random);
    let now = START;
    for (let n = 0; n < CALLS; n++) {
      const [source, args] = gardenCallOf(random, now);
      const answered: Record<string, unknown> = await withDataHost(() =>
        Reflect.apply(app.answer, undefined, [source, args, {}, storage, {}]),
      );
      if (source === 'gardenRead') expect(Array.isArray(answered['lists'])).toBe(true);
      else if (source === 'gardenDrive') expect(answered).toEqual({ on: false });
      else expect(typeof answered['answer']).toBe('string');
      now += random.below(86_400_000);
    }
  }
});
