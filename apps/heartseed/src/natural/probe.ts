/**
 * The natural voice probe's pure parts (`app/probe/natural.tsx`): the voice
 * its link names, the source that reads every speak in that voice, the
 * tally of one `Read` from the voice's views and the module's renders, the
 * tally of a `Soak`, and the lines the probe shows. Counts only, never a
 * word.
 */

import { Effect, Layer, Match, Option } from 'effect';

import { VoiceSource, type VoiceView } from '../voice';
import type { Lexicon } from './lexicon';
import { FILES, REVISION, VOICES, type NaturalVoice } from './manifest';
import {
  NaturalModule,
  NaturalUnavailable,
  type InstallEvent,
  type NaturalStatus,
  type Rendered,
} from './module';
import { planOf, SAMPLES_PER_FRAME, startsOf, type Chunk } from './plan';

/** Kokoro's output rate, samples a second. */
const RATE = 24_000;

/** The voice from the link's `voice`: one of `VOICES`, else `af_heart`. */
export const probeVoice = (asked: Option.Option<string>): NaturalVoice =>
  Option.getOrElse(
    Option.flatMap(asked, (text) => Option.fromNullishOr(VOICES.find((voice) => voice === text))),
    (): NaturalVoice => 'af_heart',
  );

/**
 * The source under it with every speak's natural voice `voice`, whatever
 * the speak names: the `Voice` service names the voice of its choice, and
 * the probe reads in the voice its link names.
 */
export const speakingIn = (voice: NaturalVoice): Layer.Layer<VoiceSource, never, VoiceSource> =>
  Layer.effect(
    VoiceSource,
    Effect.gen(function* () {
      const source = yield* VoiceSource;
      return VoiceSource.of({
        ...source,
        speak: (utterance, text, speaking) =>
          source.speak(utterance, text, { ...speaking, natural: voice }),
      });
    }),
  );

/** Where a `Read` is: waiting for its reading's first view, reading, or ended with the voice's ending. */
export type ReadPhase =
  | { readonly _tag: 'Waiting' }
  | { readonly _tag: 'Reading' }
  | { readonly _tag: 'Ended'; readonly ending: string };

/**
 * One `Read`'s tally: its phase, the last view's lit and word counts,
 * whether lit ever fell, whether a lit word came out of order, the next
 * word index due, the current range last seen, the ms from `Read` to the
 * first lit word, and each chunk's render.
 */
export interface ReadTally {
  readonly phase: ReadPhase;
  readonly lit: number;
  readonly words: number;
  readonly fell: boolean;
  readonly broken: boolean;
  readonly next: number;
  readonly last: Option.Option<{ readonly first: number; readonly last: number }>;
  readonly firstWord: Option.Option<number>;
  readonly renders: ReadonlyArray<Rendered>;
}

/** A `Read` not yet begun. */
export const readBegun: ReadTally = {
  phase: { _tag: 'Waiting' },
  lit: 0,
  words: 0,
  fell: false,
  broken: false,
  next: 0,
  last: Option.none(),
  firstWord: Option.none(),
  renders: [],
};

/** The current range a view lights, if any. */
const currentOf = (view: VoiceView) => Option.fromNullishOr(view.current);

/** A new current range moves the next word due past it when it starts there, else breaks the order. */
const lightOf = (tally: ReadTally, view: VoiceView, at: number): ReadTally =>
  Option.match(currentOf(view), {
    onNone: () => tally,
    onSome: (current) => {
      const same = Option.exists(
        tally.last,
        (seen) => seen.first === current.first && seen.last === current.last,
      );
      if (same) return tally;
      const inOrder = current.first === tally.next && current.last >= current.first;
      return {
        ...tally,
        last: Option.some(current),
        next: current.last + 1,
        broken: tally.broken || !inOrder,
        firstWord: Option.orElse(tally.firstWord, () => Option.some(at)),
      };
    },
  });

/**
 * Folds one voice view, seen `at` ms after `Read`, into the tally. Views
 * before the reading's own (the replayed last one) are skipped; after its
 * ending nothing changes.
 */
export const readSeen = (tally: ReadTally, view: VoiceView, at: number): ReadTally => {
  if (tally.phase._tag === 'Ended') return tally;
  if (tally.phase._tag === 'Waiting') {
    if (view.status === 'idle' || Option.isSome(Option.fromNullishOr(view.ended))) return tally;
  }
  const lit = lightOf(tally, view, at);
  const counted: ReadTally = {
    ...lit,
    phase: Option.match(Option.fromNullishOr(view.ended), {
      onNone: (): ReadPhase => ({ _tag: 'Reading' }),
      onSome: (ending): ReadPhase => ({ _tag: 'Ended', ending }),
    }),
    lit: view.lit,
    words: view.words,
    fell: lit.fell || view.lit < tally.lit,
  };
  return counted;
};

/** Adds one chunk's render to the tally. */
export const readRendered = (tally: ReadTally, rendered: Rendered): ReadTally => ({
  ...tally,
  renders: [...tally.renders, rendered],
});

/** Whether a render's audio is exactly its frames' samples. */
export const framesHold = (rendered: Rendered): boolean =>
  rendered.samples === SAMPLES_PER_FRAME * rendered.frames.reduce((sum, frames) => sum + frames, 0);

/** What one soaked verse came to: no plan, every chunk rendered and well formed, or a failure with the module's reason. */
export type SoakOutcome =
  | { readonly _tag: 'Unplanned' }
  | { readonly _tag: 'Rendered' }
  | { readonly _tag: 'Failed'; readonly reason: string };

/** A soak's counts: verses done of `asked`, unplanned, failed, and of the failed those whose render was not finite. */
export interface SoakTally {
  readonly asked: number;
  readonly done: number;
  readonly unplanned: number;
  readonly failed: number;
  readonly nonfinite: number;
}

/** A soak of `asked` verses not yet begun. */
export const soakBegun = (asked: number): SoakTally => ({
  asked,
  done: 0,
  unplanned: 0,
  failed: 0,
  nonfinite: 0,
});

/** Counts one verse's outcome. */
export const soakCounted = (tally: SoakTally, outcome: SoakOutcome): SoakTally => {
  const done = { ...tally, done: tally.done + 1 };
  return Match.type<SoakOutcome>().pipe(
    Match.tagsExhaustive({
      Unplanned: (): SoakTally => ({ ...done, unplanned: tally.unplanned + 1 }),
      Rendered: (): SoakTally => done,
      Failed: ({ reason }): SoakTally => ({
        ...done,
        failed: tally.failed + 1,
        nonfinite: tally.nonfinite + Number(reason.includes('nonfinite')),
      }),
    }),
  )(outcome);
};

/** Renders one chunk; a render whose frames do not fit its chunk or its samples fails with `frames`. */
const soakChunk = (utterance: number, chunk: Chunk, index: number) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    const rendered = yield* module.render(utterance, index, chunk.ids);
    if (framesHold(rendered) && Option.isSome(startsOf(chunk, rendered.frames))) return;
    return yield* NaturalUnavailable.make({ reason: 'frames' });
  });

/**
 * Soaks one verse: plans it, renders every chunk through the module in
 * order (no play), and stops the module after it, whatever the outcome.
 */
export const soakVerse = Effect.fn('NaturalProbe.soakVerse')(function* (
  lexicon: Lexicon,
  utterance: number,
  text: string,
) {
  const module = yield* NaturalModule;
  const outcome = yield* Option.match(planOf(lexicon.words, lexicon.vocab, text), {
    onNone: () => Effect.succeed<SoakOutcome>({ _tag: 'Unplanned' }),
    onSome: (plan) =>
      Effect.forEach(plan.chunks, (chunk, index) => soakChunk(utterance, chunk, index), {
        discard: true,
      }).pipe(
        Effect.map((): SoakOutcome => ({ _tag: 'Rendered' })),
        Effect.catchTag('NaturalUnavailable', (failure) =>
          Effect.succeed<SoakOutcome>({ _tag: 'Failed', reason: failure.reason }),
        ),
      ),
  });
  yield* module.stop;
  return outcome;
});

/** A `Load`'s answer: its ms, or the module's reason for refusing. */
export type LoadOutcome =
  | { readonly _tag: 'Loaded'; readonly millis: number }
  | { readonly _tag: 'Refused'; readonly reason: string };

/** Everything the probe shows. */
export interface ProbeView {
  readonly voice: NaturalVoice;
  readonly status: NaturalStatus;
  readonly install: Option.Option<InstallEvent>;
  readonly load: Option.Option<LoadOutcome>;
  readonly read: ReadTally;
  readonly soak: SoakTally;
}

/** The verses a soak takes by default: the whole KJV. */
export const SOAK_VERSES = 31_102;

/** The soak's count from the link's `soak`: a whole number of at least 1, else the whole KJV. */
export const soakAsked = (asked: Option.Option<string>): number =>
  Option.getOrElse(
    Option.filter(
      Option.map(
        Option.filter(asked, (text) => /^[0-9]+$/u.test(text)),
        (text) => Number(text),
      ),
      (count) => Number.isSafeInteger(count) && count >= 1,
    ),
    () => SOAK_VERSES,
  );

/** The probe in `voice` before anything has been asked: nothing held, nothing read, a soak of `asked` not begun. */
export const probeBegun = (asked: number, voice: NaturalVoice): ProbeView => ({
  voice,
  status: {
    revision: REVISION,
    files: 0,
    bytes: 0,
    excluded: false,
    crashed: false,
    loaded: false,
    installing: false,
    footprint: 0,
    peak: 0,
  },
  install: Option.none(),
  load: Option.none(),
  read: readBegun,
  soak: soakBegun(asked),
});

const shown = (value: Option.Option<string>) => Option.getOrElse(value, () => 'none');

/** The read's ending, or none while it has not ended. */
const endingOf = (phase: ReadPhase) => {
  if (phase._tag === 'Ended') return phase.ending;
  return 'none';
};

/** Σ render ms over the audio's ms, or none before any audio. */
const rtfOf = (renders: ReadonlyArray<Rendered>) => {
  const samples = renders.reduce((sum, rendered) => sum + rendered.samples, 0);
  const millis = renders.reduce((sum, rendered) => sum + rendered.millis, 0);
  if (samples <= 0) return Option.none();
  return Option.some((millis / ((samples / RATE) * 1000)).toFixed(2));
};

const installLine = (install: Option.Option<InstallEvent>) =>
  Option.match(install, {
    onNone: () => 'install none',
    onSome: (event) =>
      `install ${event.kind} ${event.bytes}/${event.total} ${event.reason}`.trimEnd(),
  });

const loadText = (outcome: LoadOutcome) => {
  if (outcome._tag === 'Loaded') return outcome.millis.toFixed(0);
  return `failed ${outcome.reason}`;
};

/** Whether the read ended with lit never falling and each word index current once, in order. */
const orderOf = (read: ReadTally) => {
  const held = read.phase._tag === 'Ended' && !read.fell && !read.broken;
  if (held && read.next === read.words) return 'ok';
  return 'broken';
};

/**
 * The probe's lines, one fact each and keyed by the first word: the voice,
 * what the phone holds, the last download event, the load, the read and the
 * soak.
 */
export const linesOf = (view: ProbeView): ReadonlyArray<string> => {
  const { status, read, soak } = view;
  const held = read.renders.filter(framesHold).length;
  return [
    `voice ${view.voice}`,
    `installed ${status.files}/${FILES.length}`,
    `bytes ${status.bytes}`,
    `excluded ${status.excluded}`,
    `crashed ${status.crashed}`,
    `loaded ${status.loaded}`,
    installLine(view.install),
    `load ${shown(Option.map(view.load, loadText))}`,
    `read ${endingOf(read.phase)}`,
    `lit ${read.lit}/${read.words}`,
    `order ${orderOf(read)}`,
    `chunks ${read.renders.length}`,
    `frames ok ${held}/${read.renders.length}`,
    `first-word ${shown(Option.map(read.firstWord, (ms) => ms.toFixed(0)))}`,
    `rtf ${shown(rtfOf(read.renders))}`,
    `peak ${(status.peak / 1_048_576).toFixed(0)}`,
    `soak ${soak.done}/${soak.asked} unplanned ${soak.unplanned} failed ${soak.failed} nonfinite ${soak.nonfinite}`,
  ];
};
