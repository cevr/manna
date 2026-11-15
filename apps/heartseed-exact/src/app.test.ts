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
const app = await import('../app');

const SEQUENCES = 40;
const CALLS = 30;

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
  switch (random.below(9)) {
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
      return ['todaySay', [id]];
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
        Uint8Array.from('{"right":3,"total":37}', (c) => c.charCodeAt(0)).buffer,
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
