/* oxlint-disable effect/noTernary, effect/noGlobals -- the generator and the model are plain branches over plain records, and a wrong reading is named and compared by its JSON. */

/**
 * Which list the natural source plans a speak by, over seeded sessions on a
 * stand-in module that records its calls: one source, as the app builds it
 * once for its life, speaks two to five readings in turn, each in Her, in
 * Him or in a voice outside the download drawn on its own, so a voice
 * follows the other in both orders. Two hand lists over one vocab, whose
 * entries differ in phonemes and in length and which each lack a key the
 * other holds. The source's build stops the module once; a speak in a voice
 * of the download is then exactly its stop, the load of `<voice>.bin`, then
 * per chunk of `planOf` over that voice's own list its prosody at the
 * voice's speed, its render and its play with the starts that list's marks
 * give; a text the voice's own list cannot plan fails the speak after its
 * stop. A list is asked for only by the speak's own voice, and never for a
 * voice outside `VOICES`.
 *
 * It catches a source that plans every voice by one list, keeps the list of
 * an earlier speak, asks for the list before it knows the voice is one of
 * the download, or plans by a list other than the speak's own. It misses the
 * app's own lists: `lexicon.test.ts` and `route.test.ts` hold those.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Exit, Layer } from 'effect';

import { VoiceSource } from '../voice';
import type { Lexicon } from './lexicon';
import { SPEEDS, VOICES, type NaturalVoice } from './manifest';
import { NaturalModule, type WordStart } from './module';
import { planOf, type Chunk } from './plan';
import { naturalVoiceSource } from './voice';

const SEED = 31_007;
const SESSIONS = 80;
const SYMBOLS = [...'abcdefghijklmnop'];
const VOCAB: ReadonlyMap<string, number> = new Map([
  [' ', 16],
  [',', 3],
  ['.', 4],
  [';', 1],
  [':', 2],
  ...SYMBOLS.map((symbol, index) => [symbol, 43 + index] as const),
]);

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

const pick = <A>(next: () => number, from: ReadonlyArray<A>): A =>
  from[Math.floor(next() * from.length)] as A;

/** `length` symbols from the half of `SYMBOLS` that starts at `from`, drawn by `seed`. */
const body = (seed: number, length: number, from: number) =>
  Array.from({ length }, (_, at) => SYMBOLS[from + ((seed * 5 + at * 3) % 8)]).join('');

const SHARED = ['bel', 'cor', 'dun', 'fam', 'gil'];

/** Her's hand list: the shared keys and `hob`, which Him's lacks. */
const US: Lexicon = {
  words: new Map([
    ...SHARED.map((key, index) => [key, body(index, 9 + index, 0)] as const),
    ['hob', body(7, 6, 0)],
  ]),
  vocab: VOCAB,
};

/** Him's hand list: the shared keys (all but `fam` other phonemes of other lengths) and `jax`, which Her's lacks. */
const GB: Lexicon = {
  words: new Map([
    ...SHARED.map(
      (key, index) =>
        [key, key === 'fam' ? body(index, 9 + index, 0) : body(index, 7 + 2 * index, 8)] as const,
    ),
    ['jax', body(9, 5, 8)],
  ]),
  vocab: VOCAB,
};

const OWN: Readonly<Record<NaturalVoice, Lexicon>> = { af_heart: US, bm_george: GB };

type Call =
  | { readonly _tag: 'stop' }
  | { readonly _tag: 'load'; readonly file: string }
  | {
      readonly _tag: 'prosody';
      readonly k: number;
      readonly ids: ReadonlyArray<number>;
      readonly speed: number;
    }
  | { readonly _tag: 'render'; readonly k: number; readonly points: number }
  | {
      readonly _tag: 'play';
      readonly k: number;
      readonly starts: ReadonlyArray<readonly [number, number, number]>;
      readonly last: boolean;
      readonly from: number;
      readonly to: number;
      readonly rest: number;
    };

/** The frames the stand-in gives chunk `k`'s ids: one to three each, by position. */
const framesOf = (ids: ReadonlyArray<number>, k: number) => ids.map((_, at) => 1 + ((at + k) % 3));
const sum = (each: ReadonlyArray<number>) => each.reduce((total, one) => total + one, 0);

/** A module that records its calls and answers each chunk with frames by position. */
const standIn = (calls: Array<Call>) => {
  const asked = new Map<number, ReadonlyArray<number>>();
  return Layer.succeed(
    NaturalModule,
    NaturalModule.of({
      status: () => Effect.die('no status'),
      install: () => Effect.die('no install'),
      cancelInstall: Effect.die('no cancel'),
      remove: Effect.die('no remove'),
      load: (_revision, _files, file) =>
        Effect.sync(() => {
          calls.push({ _tag: 'load', file });
          return 1;
        }),
      prosody: (_utterance, k, ids, speed) =>
        Effect.sync(() => {
          calls.push({ _tag: 'prosody', k, ids: [...ids], speed });
          asked.set(k, ids);
          const frames = framesOf(ids, k);
          return {
            frames,
            f0: Array.from({ length: 2 * sum(frames) }, (_, at) => 180 + (at % 7)),
            millis: 1,
          };
        }),
      render: (_utterance, k, curve) =>
        Effect.sync(() => {
          const frames = framesOf(asked.get(k) ?? [], k);
          const samples = 600 * sum(frames);
          calls.push({ _tag: 'render', k, points: curve.length });
          return { frames, samples, millis: 1, first: 0, last: samples - 1 };
        }),
      play: (_utterance, k, starts: ReadonlyArray<WordStart>, last, from, to, rest) =>
        Effect.sync(() => {
          calls.push({
            _tag: 'play',
            k,
            starts: starts.map((start) => [start.location, start.length, start.sample] as const),
            last,
            from,
            to,
            rest,
          });
        }),
      pause: Effect.void,
      resume: Effect.void,
      stop: Effect.sync(() => void calls.push({ _tag: 'stop' })),
      subscribe: () => Effect.void,
      subscribeInstall: () => Effect.void,
    }),
  );
};

/** The calls a speak of `chunks` in `voice` makes on the stand-in after the source's build. */
const wanted = (chunks: ReadonlyArray<Chunk>, voice: NaturalVoice): ReadonlyArray<Call> => [
  { _tag: 'stop' },
  { _tag: 'load', file: `${voice}.bin` },
  ...chunks.flatMap((chunk, k): ReadonlyArray<Call> => {
    const frames = framesOf(chunk.ids, k);
    const total = sum(frames);
    return [
      { _tag: 'prosody', k, ids: [...chunk.ids], speed: SPEEDS[voice] },
      { _tag: 'render', k, points: 2 * total },
      {
        _tag: 'play',
        k,
        starts: chunk.marks.map(
          (mark) => [mark.location, mark.length, 600 * sum(frames.slice(0, mark.token))] as const,
        ),
        last: k === chunks.length - 1,
        from: 0,
        to: 600 * total,
        rest: chunk.rest,
      },
    ];
  }),
];

/** A reading: its voice, its text, and the calls its speak makes after the source's build. */
type Reading = { readonly voice: string; readonly text: string; readonly awaited: number };

/** What one speak did: its exit, the module's calls and the lists asked for from its start to the next. */
type Spoken = {
  readonly exit: Exit.Exit<void, unknown>;
  readonly calls: ReadonlyArray<Call>;
  readonly asked: ReadonlyArray<string>;
};

/** Speaks each reading in turn on one source over the hand lists; the build's calls and asks, and what each speak did once its `awaited` calls are in. */
const session = (readings: ReadonlyArray<Reading>) => {
  const calls: Array<Call> = [];
  const asked: Array<string> = [];
  const lexiconFor = (named: NaturalVoice) => {
    asked.push(named);
    return OWN[named];
  };
  return Effect.gen(function* () {
    const source = yield* VoiceSource;
    const built = { calls: [...calls], asked: [...asked] };
    const spoken: Array<Spoken> = [];
    for (const [at, reading] of readings.entries()) {
      const from = calls.length;
      const fromAsked = asked.length;
      const exit = yield* Effect.exit(
        source.speak(7 + at, reading.text, {
          system: '',
          natural: reading.voice as NaturalVoice,
        }),
      );
      for (let turn = 0; turn < 900 && calls.length - from < reading.awaited; turn++)
        yield* Effect.yieldNow;
      for (let turn = 0; turn < 20; turn++) yield* Effect.yieldNow;
      spoken.push({ exit, calls: calls.slice(from), asked: asked.slice(fromAsked) });
    }
    return { built, spoken };
  }).pipe(Effect.provide(Layer.provide(naturalVoiceSource(lexiconFor), standIn(calls))));
};

const isNatural = (voice: string): voice is NaturalVoice => VOICES.some((each) => each === voice);

/** A reading's voice (Her, Him, or one outside the download) and text of one to seven words, some of them a key one list lacks. */
const readingOf = (next: () => number) => {
  const voice = pick(next, ['af_heart', 'bm_george', 'af_heart', 'bm_george', 'am_michael']);
  const count = 1 + Math.floor(next() * 7);
  const keys = next() < 0.75 ? SHARED : [...SHARED, 'hob', 'jax'];
  const ends = (at: number) =>
    at === count - 1 ? pick(next, ['.', '', ';']) : pick(next, [',', ';', ':', '.', '', '', '']);
  const text = Array.from({ length: count }, (_, at) => `${pick(next, keys)}${ends(at)}`).join(
    next() < 0.15 ? '\n' : ' ',
  );
  return { voice, text };
};

/** What a reading drew, for the floors: Her or Him planned, a text the voice's list cannot plan, or a voice outside the download. */
type Kind = 'her' | 'him' | 'unplanned' | 'stranger';

/** Whether Him's plan of `text` differs from Her's: the readings must tell the two lists apart. */
const listsDiffer = (text: string) =>
  JSON.stringify(planOf(GB.words, VOCAB, text)) !== JSON.stringify(planOf(US.words, VOCAB, text));

/** What a drawn reading should do: its kind, its chunks and the calls of its speak. */
const expected = (voice: string, text: string) => {
  if (!isNatural(voice))
    return { kind: 'stranger' as Kind, chunks: 0, want: wanted([], 'af_heart').slice(0, 1) };
  const planned = planOf(OWN[voice].words, VOCAB, text);
  if (planned._tag === 'None')
    return { kind: 'unplanned' as Kind, chunks: 0, want: wanted([], voice).slice(0, 1) };
  const kind: Kind = voice === 'bm_george' ? 'him' : 'her';
  return { kind, chunks: planned.value.chunks.length, want: wanted(planned.value.chunks, voice) };
};

/** Speaks two to five drawn readings on one source; each reading's kind and chunks, and each rule the session broke. */
const judged = (next: () => number) =>
  Effect.gen(function* () {
    const drawn = Array.from({ length: 2 + Math.floor(next() * 4) }, () => readingOf(next)).map(
      ({ voice, text }) => ({ voice, text, ...expected(voice, text) }),
    );
    const wrong: Array<string> = [];
    const { built, spoken } = yield* session(
      drawn.map(({ voice, text, want }) => ({ voice, text, awaited: want.length })),
    );
    if (JSON.stringify(built) !== JSON.stringify({ calls: [{ _tag: 'stop' }], asked: [] }))
      wrong.push(`build ${JSON.stringify(built)}`);
    for (const [at, reading] of drawn.entries()) {
      const { exit, calls, asked } = spoken[at] ?? { exit: Exit.void, calls: [], asked: [] };
      const says = (each: string) =>
        wrong.push(`speak ${at} ${reading.voice} ${JSON.stringify(reading.text)}: ${each}`);
      if (reading.kind === 'stranger' || reading.kind === 'unplanned') {
        if (!Exit.isFailure(exit)) says('read, though it should fail');
      } else if (!Exit.isSuccess(exit)) says('the speak failed');
      if (asked.some((named) => named !== reading.voice)) says(`lists asked ${asked.join(',')}`);
      if (JSON.stringify(calls) !== JSON.stringify(reading.want))
        says(`calls ${JSON.stringify(calls).slice(0, 300)}`);
    }
    return { drawn, wrong };
  });

describe('the list the natural source plans by', () => {
  it(`plans each speak by its own voice's list, asked for only by a voice of the download, over ${SESSIONS} seeded sessions of two to five speaks on one source`, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const next = random(SEED);
        const wrong: Array<string> = [];
        const floors = {
          her: 0,
          him: 0,
          unplanned: 0,
          stranger: 0,
          himDiffers: 0,
          manyChunks: 0,
          himAfterHer: 0,
          herAfterHim: 0,
        };
        for (let at = 0; at < SESSIONS && wrong.length < 6; at++) {
          const found = yield* judged(next);
          for (const [index, reading] of found.drawn.entries()) {
            floors[reading.kind]++;
            if (reading.chunks > 2) floors.manyChunks++;
            const differs = listsDiffer(reading.text);
            if (reading.kind === 'him' && differs) floors.himDiffers++;
            const before = found.drawn.slice(0, index).map((each) => each.voice);
            if (reading.kind === 'him' && differs && before.includes('af_heart'))
              floors.himAfterHer++;
            if (reading.kind === 'her' && differs && before.includes('bm_george'))
              floors.herAfterHim++;
          }
          wrong.push(...found.wrong.map((each) => `session ${at} ${each}`));
        }
        expect(wrong).toEqual([]);
        for (const [name, floor] of Object.entries(floors)) expect(floor, name).toBeGreaterThan(5);
      }),
    ));
});
