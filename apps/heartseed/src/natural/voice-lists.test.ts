/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the generator and the model are plain branches over plain records, and a wrong reading is named and compared by its JSON. */

/**
 * Which list the natural source plans a speak by, over seeded readings on a
 * stand-in module that records its calls: two hand lists over one vocab,
 * whose entries differ in phonemes and in length and which each lack a key
 * the other holds, read in Her, in Him, and in a voice outside the
 * download. A speak in a voice of the download is exactly its two stops,
 * the load of `<voice>.bin`, then per chunk of `planOf` over that voice's
 * own list its prosody at the voice's speed, its render and its play with
 * the starts that list's marks give; a text the voice's own list cannot plan
 * fails the speak after its two stops. A list is asked for only by the
 * speak's own voice, and never for a voice outside `VOICES`.
 *
 * It catches a source that plans every voice by one list, asks for the list
 * before it knows the voice is one of the download, or plans by a list other
 * than the speak's own. It misses the app's own lists: `lexicon.test.ts`
 * and `route.test.ts` hold those.
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
const READINGS = 260;
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

/** The calls a reading of `chunks` in `voice` makes on the stand-in. */
const wanted = (chunks: ReadonlyArray<Chunk>, voice: NaturalVoice): ReadonlyArray<Call> => [
  { _tag: 'stop' },
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

/** Speaks `text` in `voice` over `lexiconFor`; the speak's exit and the module's calls once `awaited` are in. */
const spoken = (
  lexiconFor: (voice: NaturalVoice) => Lexicon,
  text: string,
  voice: string,
  awaited: number,
) => {
  const calls: Array<Call> = [];
  return Effect.gen(function* () {
    const source = yield* VoiceSource;
    const exit = yield* Effect.exit(
      source.speak(7, text, { system: '', natural: voice as NaturalVoice }),
    );
    for (let turn = 0; turn < 900 && calls.length < awaited; turn++) yield* Effect.yieldNow;
    for (let turn = 0; turn < 20; turn++) yield* Effect.yieldNow;
    return { exit, calls };
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

/** Speaks one reading; what it drew, and each rule it broke. */
const judged = (voice: string, text: string) =>
  Effect.gen(function* () {
    const asked: Array<string> = [];
    const lexiconFor = (named: NaturalVoice) => {
      asked.push(named);
      return OWN[named];
    };
    const wrong: Array<string> = [];
    if (!isNatural(voice)) {
      const { exit, calls } = yield* spoken(lexiconFor, text, voice, 2);
      if (!Exit.isFailure(exit)) wrong.push('a voice outside the download read');
      if (calls.length !== 2) wrong.push(`calls ${JSON.stringify(calls)}`);
      if (asked.length > 0) wrong.push(`a list was asked for ${asked.join(',')}`);
      return { kind: 'stranger' as Kind, chunks: 0, wrong };
    }
    const planned = planOf(OWN[voice].words, VOCAB, text);
    const chunks = planned._tag === 'Some' ? planned.value.chunks : [];
    const want = planned._tag === 'Some' ? wanted(chunks, voice) : wanted([], voice).slice(0, 2);
    const { exit, calls } = yield* spoken(lexiconFor, text, voice, want.length);
    const kind: Kind =
      planned._tag === 'None' ? 'unplanned' : voice === 'bm_george' ? 'him' : 'her';
    if (kind === 'unplanned' && !Exit.isFailure(exit))
      wrong.push('a text its list cannot plan read');
    if (kind !== 'unplanned' && !Exit.isSuccess(exit)) wrong.push('the speak failed');
    if (asked.some((named) => named !== voice)) wrong.push(`lists asked ${asked.join(',')}`);
    if (JSON.stringify(calls) !== JSON.stringify(want))
      wrong.push(`calls ${JSON.stringify(calls).slice(0, 300)}`);
    return { kind, chunks: chunks.length, wrong };
  });

/** Whether Him's plan of `text` differs from Her's: the readings must tell the two lists apart. */
const listsDiffer = (text: string) =>
  JSON.stringify(planOf(GB.words, VOCAB, text)) !== JSON.stringify(planOf(US.words, VOCAB, text));

describe('the list the natural source plans by', () => {
  it(`plans each speak by its own voice's list, asked for only by a voice of the download, over ${READINGS} seeded readings`, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const next = random(SEED);
        const wrong: Array<string> = [];
        const floors = { her: 0, him: 0, unplanned: 0, stranger: 0, himDiffers: 0, manyChunks: 0 };
        for (let reading = 0; reading < READINGS && wrong.length < 6; reading++) {
          const { voice, text } = readingOf(next);
          const found = yield* judged(voice, text);
          floors[found.kind]++;
          if (found.kind === 'him' && listsDiffer(text)) floors.himDiffers++;
          if (found.chunks > 2) floors.manyChunks++;
          wrong.push(
            ...found.wrong.map((each) => `${reading} ${voice} ${JSON.stringify(text)}: ${each}`),
          );
        }
        expect(wrong).toEqual([]);
        for (const [name, floor] of Object.entries(floors)) expect(floor, name).toBeGreaterThan(5);
      }),
    ));
});
