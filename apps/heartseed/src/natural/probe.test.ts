/* oxlint-disable effect/noNullish, effect/noTernary -- a view's absent range and ending are null in the voice's view contract, and the generator's branches are plain. */

/**
 * The natural voice probe's pure parts: the link's voice and the source
 * that speaks in it, its lines for an empty and a full
 * view, a read's tally over the voice's views (order ok only for each word
 * current once, in order, to a finish; broken for a skip, a repeat, a
 * reversal or an early end; the replayed view before the reading skipped),
 * a render's frame check and the real-time factor, the soak's link count
 * and tally, and one soaked verse over a stand-in module: unplanned,
 * rendered, a malformed render and a refused one, the module stopped after
 * each. The texts are made-up words over a lexicon written here.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { VoiceSource, type VoiceView } from '../voice';
import type { Lexicon } from './lexicon';
import { VOICES, type NaturalVoice } from './manifest';
import { NaturalModule, NaturalUnavailable, type Rendered } from './module';
import { planOf } from './plan';
import {
  framesHold,
  linesOf,
  probeBegun,
  probeVoice,
  speakingIn,
  readBegun,
  readRendered,
  readSeen,
  SOAK_VERSES,
  soakAsked,
  soakBegun,
  soakCounted,
  soakVerse,
  type ProbeView,
  type ReadTally,
  type SoakOutcome,
} from './probe';

const SEED = 61_207;

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const idle: VoiceView = {
  enabled: true,
  choice: 'her',
  status: 'idle',
  verse: null,
  words: 0,
  lit: 0,
  current: null,
  ended: null,
};

/** The view while word `index` (or none) of `words` is lit. */
const reading = (words: number, lit: number, index: number | null): VoiceView => ({
  enabled: true,
  choice: 'her',
  status: 'reading',
  verse: 'bel cor dun',
  words,
  lit,
  current: index === null ? null : { first: index, last: index },
  ended: null,
});

const finished = (words: number): VoiceView => ({
  ...reading(words, words, null),
  status: 'idle',
  ended: 'finished',
});

/** Folds views, the k-th seen at 100·k ms. */
const tallyOf = (views: ReadonlyArray<VoiceView>, from: ReadTally = readBegun) =>
  views.reduce((tally, view, at) => readSeen(tally, view, at * 100), from);

/** A clean reading of `words` words: the start view, each word lit in order, the finish. */
const cleanViews = (words: number) => [
  reading(words, 0, null),
  ...Array.from({ length: words }, (_, index) => reading(words, index + 1, index)),
  finished(words),
];

const lineOf = (lines: ReadonlyArray<string>, key: string) =>
  lines.find((line) => line.startsWith(`${key} `)) ?? '';

const withRead = (read: ReadTally): ProbeView => ({ ...probeBegun(10, 'af_heart'), read });

describe('the probe lines', () => {
  it('shows an empty probe', () => {
    expect(linesOf(probeBegun(SOAK_VERSES, 'af_heart'))).toEqual([
      'voice af_heart',
      'installed 0/39',
      'bytes 0',
      'excluded false',
      'crashed false',
      'loaded false',
      'install none',
      'load none',
      'read none',
      'lit 0/0',
      'order broken',
      'chunks 0',
      'frames ok 0/0',
      'first-word none',
      'rtf none',
      'peak 0',
      'soak 0/31102 unplanned 0 failed 0 nonfinite 0',
    ]);
  });

  it('shows a full probe, each line keyed by its first word', () => {
    const renders: ReadonlyArray<Rendered> = [
      { frames: [2, 3, 5], samples: 6000, millis: 100 },
      { frames: [4, 4], samples: 4801, millis: 140 },
    ];
    const read = renders.reduce(readRendered, tallyOf(cleanViews(3)));
    const view: ProbeView = {
      voice: 'bm_george',
      status: {
        revision: '2568276a60ff',
        files: 39,
        bytes: 83_332_513,
        excluded: true,
        crashed: true,
        loaded: true,
        installing: false,
        footprint: 1,
        peak: 300 * 1_048_576,
      },
      install: Option.some({ kind: 'done', bytes: 83_332_513, total: 83_332_513, reason: '' }),
      load: Option.some({ _tag: 'Loaded', millis: 1234.4 }),
      read,
      soak: { asked: 200, done: 200, unplanned: 3, failed: 2, nonfinite: 1 },
    };
    const lines = linesOf(view);
    expect(lines).toEqual([
      'voice bm_george',
      'installed 39/39',
      'bytes 83332513',
      'excluded true',
      'crashed true',
      'loaded true',
      'install done 83332513/83332513',
      'load 1234',
      'read finished',
      'lit 3/3',
      'order ok',
      'chunks 2',
      'frames ok 1/2',
      'first-word 100',
      'rtf 0.53',
      'peak 300',
      'soak 200/200 unplanned 3 failed 2 nonfinite 1',
    ]);
    expect(new Set(lines.map((line) => line.split(' ')[0])).size).toBe(lines.length);
  });

  it('shows a failed install and a refused load with their reasons', () => {
    const lines = linesOf({
      ...probeBegun(1, 'af_heart'),
      install: Option.some({ kind: 'failed', bytes: 0, total: 83_332_513, reason: 'check' }),
      load: Option.some({ _tag: 'Refused', reason: 'missing' }),
    });
    expect(lineOf(lines, 'install')).toBe('install failed 0/83332513 check');
    expect(lineOf(lines, 'load')).toBe('load failed missing');
  });
});

describe('the voice', () => {
  it("takes the link's voice when it is one of VOICES, else af_heart", () => {
    for (const voice of VOICES) expect(probeVoice(Option.some(voice))).toBe(voice);
    for (const asked of [
      '',
      'AF_HEART',
      'bm_george ',
      'bm_george.bin',
      'am_michael',
      'af_bella',
      'him',
    ]) {
      expect(probeVoice(Option.some(asked))).toBe('af_heart');
    }
    expect(probeVoice(Option.none())).toBe('af_heart');
  });

  it('speaks every utterance in its voice, whatever voice the speak names, and passes the rest through', () => {
    for (const voice of VOICES) {
      const calls: Array<string> = [];
      const under = Layer.succeed(
        VoiceSource,
        VoiceSource.of({
          voices: Effect.succeed([]),
          speak: (utterance, text, named) =>
            Effect.sync(() => {
              calls.push(`speak ${utterance} ${text} ${named.system} ${named.natural}`);
            }),
          pause: Effect.sync(() => {
            calls.push('pause');
          }),
          resume: Effect.die('resume'),
          stop: Effect.sync(() => {
            calls.push('stop');
          }),
          subscribe: () => Effect.die('subscribe'),
        }),
      );
      Effect.runSync(
        Effect.gen(function* () {
          const source = yield* VoiceSource;
          yield* source.speak(1, 'bel', { system: '', natural: 'af_heart' });
          yield* source.speak(2, 'cor', { system: 'com.apple.x', natural: 'af_heart' });
          yield* source.speak(3, 'bel', { system: '', natural: 'bm_george' });
          yield* source.pause;
          yield* source.stop;
        }).pipe(Effect.provide(speakingIn(voice).pipe(Layer.provide(under)))),
      );
      expect(calls).toEqual([
        `speak 1 bel  ${voice}`,
        `speak 2 cor com.apple.x ${voice}`,
        `speak 3 bel  ${voice}`,
        'pause',
        'stop',
      ]);
    }
  });
});

describe('a read tally', () => {
  it('skips the replayed view of the last reading, then counts a clean reading as ok', () => {
    const tally = tallyOf([finished(5), idle, ...cleanViews(3)]);
    const lines = linesOf(withRead(tally));
    expect(lineOf(lines, 'read')).toBe('read finished');
    expect(lineOf(lines, 'lit')).toBe('lit 3/3');
    expect(lineOf(lines, 'order')).toBe('order ok');
    expect(tally.firstWord).toEqual(Option.some(300));
  });

  it('changes nothing after the ending', () => {
    const done = tallyOf(cleanViews(3));
    expect(readSeen(done, reading(9, 0, 0), 5_000)).toBe(done);
  });

  it('breaks the order for a skipped word, a repeat, a reversal and an early end', () => {
    const skipped = [reading(3, 1, 0), reading(3, 3, 2), finished(3)];
    const repeated = [reading(3, 1, 0), reading(3, 2, 1), reading(3, 2, 0), finished(3)];
    const reversed = [reading(3, 1, 1), reading(3, 2, 0), reading(3, 3, 2), finished(3)];
    const stopped = [
      reading(3, 1, 0),
      { ...reading(3, 1, null), status: 'idle' as const, ended: 'stopped' as const },
    ];
    for (const views of [skipped, repeated, reversed, stopped]) {
      expect(lineOf(linesOf(withRead(tallyOf(views))), 'order')).toBe('order broken');
    }
    expect(lineOf(linesOf(withRead(tallyOf(stopped))), 'read')).toBe('read stopped');
  });

  it('holds over seeded readings: ok with repeats and gaps between words, broken once a word is dropped or moved', () => {
    const next = random(SEED);
    for (let round = 0; round < 400; round++) {
      const words = 3 + Math.floor(next() * 40);
      const views: Array<VoiceView> = [reading(words, 0, null)];
      for (let index = 0; index < words; index++) {
        const copies = 1 + Math.floor(next() * 3);
        for (let copy = 0; copy < copies; copy++) views.push(reading(words, index + 1, index));
        if (next() < 0.3) views.push(reading(words, index + 1, null));
      }
      views.push(finished(words));
      expect(lineOf(linesOf(withRead(tallyOf(views))), 'order')).toBe('order ok');
      const lit = views.flatMap((view, at) => (view.current === null ? [] : [at]));
      const at = lit[Math.floor(next() * lit.length)] ?? 1;
      const index = views[at]?.current?.first ?? 0;
      const others = Array.from({ length: words }, (_, word) => word).filter(
        (word) => word !== index && word !== index + 1,
      );
      const elsewhere = others[Math.floor(next() * others.length)] ?? 0;
      const moved =
        next() < 0.5
          ? [
              ...views.slice(0, at + 1),
              reading(words, index + 1, elsewhere),
              ...views.slice(at + 1),
            ]
          : views.filter((view) => view.current?.first !== index);
      expect(lineOf(linesOf(withRead(tallyOf(moved))), 'order')).toBe('order broken');
    }
  });
});

describe('a render', () => {
  it('holds its frames when its samples are 600 per frame exactly', () => {
    expect(framesHold({ frames: [1, 2, 3], samples: 3600, millis: 1 })).toBe(true);
    expect(framesHold({ frames: [1, 2, 3], samples: 3599, millis: 1 })).toBe(false);
    expect(framesHold({ frames: [1, 2, 3], samples: 4200, millis: 1 })).toBe(false);
    expect(framesHold({ frames: [], samples: 0, millis: 1 })).toBe(true);
  });
});

describe('the soak', () => {
  it('takes a whole count of at least 1 from the link, else the whole KJV', () => {
    expect(soakAsked(Option.some('200'))).toBe(200);
    expect(soakAsked(Option.some('1'))).toBe(1);
    for (const asked of ['0', '-3', '2.5', '1e3', '', 'abc', '99999999999999999999']) {
      expect(soakAsked(Option.some(asked))).toBe(SOAK_VERSES);
    }
    expect(soakAsked(Option.none())).toBe(SOAK_VERSES);
  });

  it('counts each outcome, a failure not finite in both failed and nonfinite', () => {
    const outcomes: ReadonlyArray<SoakOutcome> = [
      { _tag: 'Rendered' },
      { _tag: 'Unplanned' },
      { _tag: 'Failed', reason: 'nonfinite' },
      { _tag: 'Failed', reason: 'frames' },
      { _tag: 'Rendered' },
    ];
    expect(outcomes.reduce(soakCounted, soakBegun(9))).toEqual({
      asked: 9,
      done: 5,
      unplanned: 1,
      failed: 2,
      nonfinite: 1,
    });
  });
});

const LEXICON: Lexicon = {
  words: new Map([
    ['bel', 'ab'],
    ['cor', 'cab'],
  ]),
  vocab: new Map([
    [' ', 16],
    [',', 3],
    ['.', 4],
    ['a', 43],
    ['b', 44],
    ['c', 45],
  ]),
};

/** A stand-in module whose render answers by `answer` and whose calls are logged; any other call dies. */
const moduleOf = (
  calls: Array<string>,
  answer: (ids: ReadonlyArray<number>) => Effect.Effect<Rendered, NaturalUnavailable>,
) =>
  Layer.succeed(
    NaturalModule,
    NaturalModule.of({
      status: () => Effect.die('status'),
      install: () => Effect.die('install'),
      cancelInstall: Effect.die('cancelInstall'),
      remove: Effect.die('remove'),
      load: () => Effect.die('load'),
      render: (utterance, chunk, ids, speed) =>
        Effect.suspend(() => {
          calls.push(`render ${utterance} ${chunk} ${ids.length} ${speed}`);
          return answer(ids);
        }),
      play: () => Effect.die('play'),
      pause: Effect.die('pause'),
      resume: Effect.die('resume'),
      stop: Effect.sync(() => {
        calls.push('stop');
      }),
      subscribe: () => Effect.die('subscribe'),
      subscribeInstall: () => Effect.die('subscribeInstall'),
    }),
  );

const soaked = (
  text: string,
  answer: (ids: ReadonlyArray<number>) => Effect.Effect<Rendered, NaturalUnavailable>,
  voice: NaturalVoice = 'af_heart',
) => {
  const calls: Array<string> = [];
  const outcome = Effect.runSync(
    soakVerse(LEXICON, 7, text, voice).pipe(Effect.provide(moduleOf(calls, answer))),
  );
  return { outcome, calls };
};

const fit = (ids: ReadonlyArray<number>) =>
  Effect.succeed({ frames: ids.map(() => 2), samples: ids.length * 1200, millis: 5 });

describe('a soaked verse', () => {
  it('is unplanned for a word the lexicon lacks, with only the stop', () => {
    expect(soaked('bel zed.', fit)).toEqual({ outcome: { _tag: 'Unplanned' }, calls: ['stop'] });
  });

  it('renders every chunk of its plan in order at its voice’s speed, then stops', () => {
    expect(soaked('bel cor.', fit)).toEqual({
      outcome: { _tag: 'Rendered' },
      calls: ['render 7 0 9 0.85', 'stop'],
    });
    expect(soaked('bel cor.', fit, 'bm_george')).toEqual({
      outcome: { _tag: 'Rendered' },
      calls: ['render 7 0 9 0.9', 'stop'],
    });
    const long = `${Array.from({ length: 30 }, () => 'bel cor bel,').join(' ')} cor.`;
    const plan = Option.getOrThrow(planOf(LEXICON.words, LEXICON.vocab, long));
    expect(plan.chunks.length).toBeGreaterThanOrEqual(2);
    expect(soaked(long, fit)).toEqual({
      outcome: { _tag: 'Rendered' },
      calls: [
        ...plan.chunks.map((chunk, index) => `render 7 ${index} ${chunk.ids.length} 0.85`),
        'stop',
      ],
    });
  });

  it('stops at the first failed chunk of a longer plan', () => {
    const long = `${Array.from({ length: 30 }, () => 'bel cor bel,').join(' ')} cor.`;
    let renders = 0;
    const second = (ids: ReadonlyArray<number>) => {
      renders++;
      if (renders === 2) return Effect.fail(NaturalUnavailable.make({ reason: 'stale' }));
      return fit(ids);
    };
    const { outcome, calls } = soaked(long, second);
    expect(outcome).toEqual({ _tag: 'Failed', reason: 'stale' });
    expect(calls.filter((call) => call.startsWith('render'))).toHaveLength(2);
    expect(calls.at(-1)).toBe('stop');
  });

  it('fails `frames` for audio off its frames or a frame list off its ids, then stops', () => {
    const off = (ids: ReadonlyArray<number>) =>
      Effect.succeed({ frames: ids.map(() => 2), samples: ids.length * 1200 + 600, millis: 5 });
    const short = (ids: ReadonlyArray<number>) =>
      Effect.succeed({
        frames: ids.slice(1).map(() => 2),
        samples: (ids.length - 1) * 1200,
        millis: 5,
      });
    for (const answer of [off, short]) {
      expect(soaked('bel cor.', answer)).toEqual({
        outcome: { _tag: 'Failed', reason: 'frames' },
        calls: ['render 7 0 9 0.85', 'stop'],
      });
    }
  });

  it("fails with the module's reason for a refused render, then stops", () => {
    const refused = () => Effect.fail(NaturalUnavailable.make({ reason: 'nonfinite' }));
    expect(soaked('bel cor.', refused)).toEqual({
      outcome: { _tag: 'Failed', reason: 'nonfinite' },
      calls: ['render 7 0 9 0.85', 'stop'],
    });
  });
});
