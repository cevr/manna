/**
 * The natural voice as a `VoiceSource`: it plans a verse with `planOf`,
 * loads the pinned model in the natural voice the speak names
 * (`Speaking.natural`, one of `VOICES`; any other name fails the speak once
 * its stop is sent), then renders it at that voice's speed (`SPEEDS`) and
 * plays it chunk by chunk, one render in flight, each chunk's edge silence
 * cut to `EDGE_KEEP` (`cutOf`, its word starts moved by `startsWithin`) and
 * its rest after it, and forwards the module's events for the reading it
 * holds. Each chunk runs in two module calls: `prosody` gives its frames
 * and pitch curve, and `render` voices it on a curve the source sends,
 * fallen with `fallOf` (the Gentle fall) when the chunk ends a phrase or
 * the reading, and Prosody's own inside a phrase, so the audio's length is
 * the prosody's. A speak succeeds once its first chunk plays, or at once
 * when its reading is let go (stopped, replaced, or ended by a forwarded
 * terminal event); a late answer for a reading let go is ignored. A first
 * chunk whose prosody fails or does not fit (frames, two finite points a
 * frame), or that does not render, fit its render (frames, samples and
 * audible span) or play, fails the speak; a later one stops the module and
 * ends the reading with an `interrupt` of its own.
 */

import { Deferred, Effect, Exit, Layer, Option, Result } from 'effect';

import { VoiceSource, VoiceUnavailable, type VoiceEvent } from '../voice';
import type { Lexicon } from './lexicon';
import { FILES, REVISION, SPEEDS, VOICES, type NaturalVoice } from './manifest';
import { fallOf } from './fall';
import { NaturalModule, type Prosody, type Rendered } from './module';
import {
  cutOf,
  planOf,
  SAMPLES_PER_FRAME,
  startsOf,
  startsWithin,
  type Chunk,
  type Cut,
  type WordStart,
} from './plan';

/** The reading the source holds: its utterance, its chunks, its voice's speed, and the signal a speak waiting on it ends at. */
interface Reading {
  readonly utterance: number;
  readonly chunks: ReadonlyArray<Chunk>;
  readonly speed: number;
  readonly letGo: Deferred.Deferred<void>;
}

/** What one chunk came to: played, failed, or answered for a reading no longer held. */
type Played = 'played' | 'failed' | 'gone';

const TERMINAL: ReadonlySet<VoiceEvent['kind']> = new Set(['finish', 'cancel', 'interrupt']);

/** Whether a render's audible span lies in its audio: whole indices, `0 ≤ first ≤ samples` and `-1 ≤ last < samples`. */
const spanned = (rendered: Rendered) =>
  Number.isInteger(rendered.first) &&
  Number.isInteger(rendered.last) &&
  rendered.first >= 0 &&
  rendered.first <= rendered.samples &&
  rendered.last >= -1 &&
  rendered.last < rendered.samples;

/**
 * What of the chunk plays and its word starts within that, when the render
 * fits it: a whole frame or more per id, the audio exactly its frames long,
 * and its audible span inside the audio.
 */
const playOf = (
  chunk: Chunk,
  rendered: Rendered,
): Option.Option<{ readonly starts: ReadonlyArray<WordStart>; readonly cut: Cut }> =>
  Option.map(
    Option.filter(
      startsOf(chunk, rendered.frames),
      () =>
        rendered.samples ===
          SAMPLES_PER_FRAME * rendered.frames.reduce((sum, each) => sum + each, 0) &&
        spanned(rendered),
    ),
    (starts) => {
      const cut = cutOf(rendered.samples, rendered.first, rendered.last);
      return { starts: startsWithin(starts, cut), cut };
    },
  );

/** Whether a prosody fits its chunk: a whole frame or more per id, and two finite points a frame. */
const curveFits = (chunk: Chunk, prosody: Prosody) =>
  Option.isSome(startsOf(chunk, prosody.frames)) &&
  prosody.f0.length === 2 * prosody.frames.reduce((sum, each) => sum + each, 0) &&
  prosody.f0.every(Number.isFinite);

/**
 * The curve a chunk renders on, when its prosody fits it: fallen (`fallOf`)
 * when the chunk ends a phrase or (`last`) the reading, else Prosody's own;
 * none when the prosody does not fit. The source and the probe's soak both
 * send this curve.
 */
export const curveFor = (
  chunk: Chunk,
  last: boolean,
  prosody: Prosody,
): Option.Option<ReadonlyArray<number>> => {
  if (!curveFits(chunk, prosody)) return Option.none();
  if (chunk.rest > 0 || last) return Option.some(fallOf(prosody.f0));
  return Option.some(prosody.f0);
};

/** Whether `voice` names a voice of the download. */
const isNatural = (voice: string): voice is NaturalVoice => VOICES.some((each) => each === voice);

export const naturalVoiceSource = (
  lexiconFor: (voice: NaturalVoice) => Lexicon,
): Layer.Layer<VoiceSource, never, NaturalModule> =>
  Layer.effect(
    VoiceSource,
    Effect.gen(function* () {
      const module = yield* NaturalModule;
      const scope = yield* Effect.scope;
      const listeners = new Set<(event: VoiceEvent) => void>();
      let held: Option.Option<Reading> = Option.none();

      const holds = (reading: Reading) => Option.exists(held, (each) => each === reading);
      /** Drops the held reading without answering its speak: the speak answers itself. */
      const drop = () => {
        held = Option.none();
      };
      /** Lets go of the held reading: a speak still waiting on it succeeds at once. */
      const letGo = () => {
        const was = held;
        held = Option.none();
        Option.map(was, (reading) => Deferred.doneUnsafe(reading.letGo, Exit.void));
      };
      const send = (event: VoiceEvent) => {
        for (const listener of listeners) listener(event);
      };

      yield* module.stop;
      yield* module.subscribe((event) => {
        if (!Option.exists(held, (reading) => reading.utterance === event.utterance)) return;
        send(event);
        if (TERMINAL.has(event.kind)) letGo();
      });

      /** Runs chunk `k` of `reading`'s prosody, renders it on its curve when the prosody fits, and plays it when the render fits. */
      const chunkOf = (reading: Reading, k: number, chunk: Chunk) =>
        Effect.gen(function* () {
          const found = yield* Effect.result(
            module.prosody(reading.utterance, k, chunk.ids, reading.speed),
          );
          if (!holds(reading)) return 'gone' satisfies Played;
          if (Result.isFailure(found)) return 'failed' satisfies Played;
          const last = k === reading.chunks.length - 1;
          const curve = curveFor(chunk, last, found.success);
          if (Option.isNone(curve)) return 'failed' satisfies Played;
          const rendered = yield* Effect.result(module.render(reading.utterance, k, curve.value));
          if (!holds(reading)) return 'gone' satisfies Played;
          if (Result.isFailure(rendered)) return 'failed' satisfies Played;
          const planned = playOf(chunk, rendered.success);
          if (Option.isNone(planned)) return 'failed' satisfies Played;
          const { starts, cut } = planned.value;
          const played = yield* Effect.result(
            module.play(reading.utterance, k, starts, last, cut.from, cut.to, chunk.rest),
          );
          if (!holds(reading)) return 'gone' satisfies Played;
          if (Result.isFailure(played)) return 'failed' satisfies Played;
          return 'played' satisfies Played;
        });

      /** The chunks after the first, in order; a failed one stops the module and interrupts the reading. */
      const rest = (reading: Reading) =>
        Effect.gen(function* () {
          for (const [k, chunk] of reading.chunks.entries()) {
            if (k === 0) continue;
            const played: Played = yield* chunkOf(reading, k, chunk);
            if (played === 'gone') return;
            if (played === 'failed') {
              drop();
              yield* module.stop;
              send({ utterance: reading.utterance, kind: 'interrupt', location: 0, length: 0 });
              return;
            }
          }
        });

      /** Loads the model in `voice` and plays the first chunk; the rest go on in the source's scope. */
      const read = (reading: Reading, first: Chunk, voice: NaturalVoice) =>
        Effect.gen(function* () {
          const loaded = yield* Effect.result(module.load(REVISION, FILES, `${voice}.bin`));
          if (!holds(reading)) return;
          if (Result.isFailure(loaded)) {
            drop();
            return yield* VoiceUnavailable.make({ reason: loaded.failure.reason });
          }
          const played: Played = yield* chunkOf(reading, 0, first);
          if (played === 'gone') return;
          if (played === 'failed') {
            drop();
            return yield* VoiceUnavailable.make({
              reason: 'the natural voice could not read the first chunk',
            });
          }
          yield* Effect.forkIn(rest(reading), scope);
        });

      return VoiceSource.of({
        voices: Effect.succeed([]),
        speak: (utterance, text, speaking) =>
          Effect.gen(function* () {
            const voice = speaking.natural;
            yield* module.stop;
            letGo();
            if (!isNatural(voice)) {
              return yield* VoiceUnavailable.make({
                reason: 'the natural voice has no such voice',
              });
            }
            const lexicon = lexiconFor(voice);
            const chunks = Option.map(
              planOf(lexicon.words, lexicon.vocab, text),
              (plan) => plan.chunks,
            );
            const first = Option.flatMap(chunks, (each) => Option.fromUndefinedOr(each[0]));
            if (Option.isNone(chunks) || Option.isNone(first)) {
              return yield* VoiceUnavailable.make({
                reason: 'the natural voice cannot plan this text',
              });
            }
            const reading: Reading = {
              utterance,
              chunks: chunks.value,
              speed: SPEEDS[voice],
              letGo: Deferred.makeUnsafe<void>(),
            };
            held = Option.some(reading);
            return yield* Effect.raceFirst(
              read(reading, first.value, voice),
              Deferred.await(reading.letGo),
            );
          }),
        pause: module.pause,
        resume: module.resume,
        stop: Effect.suspend(() => {
          letGo();
          return module.stop;
        }),
        subscribe: (listener) =>
          Effect.asVoid(
            Effect.acquireRelease(
              Effect.sync(() => listeners.add(listener)),
              () => Effect.sync(() => listeners.delete(listener)),
            ),
          ),
      });
    }),
  );
