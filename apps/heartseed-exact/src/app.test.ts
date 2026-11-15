/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test awaits each answer in turn, as the host asks them one by one, and its storage stub answers as Exact's does. */

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
