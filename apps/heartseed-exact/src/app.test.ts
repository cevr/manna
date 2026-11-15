/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType, effect/noTernary, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test awaits each answer in turn, as the host asks them one by one, its storage stub answers as Exact's does, and its generated voices are Apple's or the web's by a plain branch. */

/**
 * The data module runs where Exact runs it: inside `withDataHost`, where
 * the clock, randomness and the timers throw as they do on Hermes, every
 * source is called through `app.ts`'s `answer` for seeded sequences of
 * calls, over a storage that sometimes fails. No call throws, every answer
 * is a screen, and no file is written but the garden's.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { writeLicences } from '../tools/licences';
import { GARDEN_FILE } from './garden/program';
import { seeded, type Random } from './test/random';
import type { TodayScreen } from './today/sources';

writeLicences();
const app = await import('./test/app.js');

const SEQUENCES = 40;
const CALLS = 30;

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

/** One Today call over the screen last answered: a route opened, a recital's input, Next, or a plant, as the Contract sends them. */
const todayCallOf = (
  random: Random,
  last: TodayScreen | undefined,
  now: number,
): readonly [string, readonly unknown[]] => {
  const id = random.pick(['', 'utterance-1', 'recognition-1', 'x']);
  const words = last?.words.length ?? 1;
  const at = random.pick([now, now + 0.5, 0, -1, Number.NaN]);
  const seed = random.below(2 ** 32);
  const offset = random.pick([-300, 0, 330]);
  switch (random.below(19)) {
    case 0:
      return ['todayBoot', []];
    case 1:
    case 17:
      return [
        'todayOpen',
        [
          random.pick(['today', 'home', 'start', 'cued', 'verses', 'settings', '']),
          random.pick(['', 'John-3-16', '1-John-3-16', 'Psalms-119-1', 'x']),
          random.pick(['none', 'initials', 'full', 'x', '']),
          random.pick(['', '2', '5', '10', '20', '7']),
          random.pick(['', 'off', 'her', 'him', 'x']),
          now,
          seed,
        ],
      ];
    case 2:
      return ['todayHear', [id]];
    case 3:
      return ['todayVoice', [id, random.below(300) - 5, random.below(words) - 1]];
    case 4:
      return ['todayVoiceEnded', [id, random.pick(['end', 'error', 'cancel'])]];
    case 5:
      return ['todayStop', []];
    case 6:
      return ['todaySay', [id, at, seed]];
    case 7:
      return [
        'todayHeard',
        [id, random.pick(['', 'for god so loved', 'the thigh yeah', 'Ω 42']), random.chance(0.5)],
      ];
    case 8:
      return ['todayFinish', []];
    case 9:
      return ['todayDenied', []];
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
      return ['todayNext', [offset, now, seed]];
    case 16:
      return ['todayAgain', []];
    default:
      return ['gardenPlant', [43, 3, 16, random.pick([16, 18]), now, offset, seed]];
  }
};

it('answers every Today source inside the data host, writing no file but the garden', async () => {
  for (let seed = 1; seed <= SEQUENCES; seed++) {
    const random = seeded(seed);
    const storage = gardenStorageOf(random);
    let now = START;
    let last: TodayScreen | undefined;
    for (let n = 0; n < CALLS; n++) {
      const [source, args] = todayCallOf(random, last, now);
      const answered: Record<string, unknown> = await withDataHost(() =>
        Reflect.apply(app.answer, undefined, [source, args, {}, storage, {}]),
      );
      if (source === 'gardenPlant') expect(typeof answered['answer']).toBe('string');
      else {
        last = answered as unknown as TodayScreen;
        expect(Array.isArray(last.words)).toBe(true);
        expect(typeof last.session.counts).toBe('string');
      }
      expect([...storage.files.keys()].every((path) => path === GARDEN_FILE)).toBe(true);
      now += random.below(3_600_000);
    }
  }
});

it('reads the system voice inside the data host for any voices and choice', async () => {
  const random = seeded(3);
  for (let n = 0; n < CALLS; n++) {
    const voices = Array.from({ length: random.below(4) }, (_, index) => ({
      voiceURI: `v${index}`,
      name: `Voice ${index}`,
      lang: random.pick(['en-US', 'en-GB', 'fr-FR', 'en']),
      localService: true,
      default: false,
      apple: random.chance(0.5)
        ? null
        : {
            quality: random.pick(['default', 'enhanced', 'premium']),
            gender: 'female',
            isPersonalVoice: random.chance(0.2),
            isNoveltyVoice: random.chance(0.2),
          },
      android: null,
    }));
    const kept = random.pick(['', 'off', 'her', 'him', 'x']);
    const answered: Record<string, unknown> = await withDataHost(() =>
      Reflect.apply(app.answer, undefined, [
        'todayReaderOf',
        [voices, kept],
        {},
        gardenStorageOf(random),
        {},
      ]),
    );
    expect(answered['on']).toBe(kept !== 'off');
    expect(typeof answered['voice']).toBe('string');
  }
});

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

/** One home call, a list page's, or a garden call between them: the session's wire whole, empty or garbled, as the Contract may send it. */
const homeCallOf = (random: Random, now: number): readonly [string, readonly unknown[]] => {
  const offset = random.pick([-300, 0, 330]);
  const wire = random.pick([
    { minutes: 5, planned: false, items: [], held: null, visit: [] },
    {
      minutes: 10,
      planned: true,
      items: [{ reference: 'John 3:16', fresh: false, recalls: 1, seconds: 20 }],
      held: null,
      visit: [],
    },
    { minutes: 5, planned: true, items: [{ reference: 'x' }], held: 3, visit: 'x' },
    {},
    'x',
    null,
  ]);
  const key = random.pick(['', 'x', '1|a']);
  const seed = random.below(2 ** 32);
  if (random.chance(0.4)) return gardenCallOf(random, now);
  if (random.chance(0.5)) return ['homeRead', [offset, wire, key, now, seed]];
  return [
    'listRead',
    [
      random.pick(['passage-0-43-3-16-18', 'passage-1-43-3-16-18', 'x', '']),
      offset,
      wire,
      key,
      now,
      seed,
    ],
  ];
};

it('answers every home and list source inside the data host, between garden calls over a failing storage', async () => {
  for (let seed = 1; seed <= SEQUENCES / 2; seed++) {
    const random = seeded(seed);
    const storage = gardenStorageOf(random);
    let now = START;
    for (let n = 0; n < CALLS; n++) {
      const [source, args] = homeCallOf(random, now);
      const answered: Record<string, unknown> = await withDataHost(() =>
        Reflect.apply(app.answer, undefined, [source, args, {}, storage, {}]),
      );
      if (source === 'homeRead') {
        expect(typeof answered['greeting']).toBe('string');
        expect(Array.isArray(answered['rows'])).toBe(true);
      } else if (source === 'listRead') expect(Array.isArray(answered['verses'])).toBe(true);
      expect([...storage.files.keys()].every((path) => path === GARDEN_FILE)).toBe(true);
      now += random.below(86_400_000);
    }
  }
});

/** One text call: a chapter's verses, or a range's words or their sums, over places in the canon and outside it. */
const textCallOf = (random: Random): readonly [string, readonly unknown[]] => {
  const book = random.pick([43, 19, 66, 1, 0, 67, Number.NaN]);
  const chapter = random.pick([3, 119, 22, 1, 0, 151, 1.5]);
  const first = random.below(180) - 2;
  const range = [book, chapter, first, first + random.below(8) - 2];
  return random.pick([
    ['textVerses', [book, chapter]],
    ['textOf', range],
    ['textSum', range],
  ]);
};

it('answers every text source inside the data host, for seeded calls', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const random = seeded(seed);
    for (let n = 0; n < CALLS; n++) {
      const [source, args] = textCallOf(random);
      const answered: unknown = await withDataHost(() =>
        Reflect.apply(app.answer, undefined, [source, args, {}, gardenStorageOf(random), {}]),
      );
      if (source === 'textVerses') expect(Array.isArray(answered)).toBe(true);
      else expect(Array.isArray(Reflect.get(Object(answered), 'verses'))).toBe(true);
    }
  }
});
