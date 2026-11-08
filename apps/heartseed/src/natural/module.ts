/**
 * The natural voice's native module, as the app drives it: Kokoro-82M on
 * the phone, which downloads its pinned files once, loads them, renders a
 * chunk of token ids to audio and the frames each id took, and plays the
 * audio while it sends the voice's own events at each word's start sample.
 * JS plans the ids and the word starts (`plan.ts`); the module owns the
 * clock. On iOS it is `native/natural` (`source.ios.ts`); elsewhere there
 * is none (`source.ts`).
 */

import { Context, Schema } from 'effect';
import type { Effect, Scope } from 'effect';

import type { VoiceEvent } from '../voice';

/** One pinned model file: its path under the revision's folder, its size and its SHA-256. */
export interface ModelFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** What the phone holds, by file sizes alone, and the module's memory. */
export interface NaturalStatus {
  readonly revision: string;
  readonly files: number;
  readonly bytes: number;
  readonly excluded: boolean;
  readonly crashed: boolean;
  readonly loaded: boolean;
  readonly installing: boolean;
  readonly footprint: number;
  readonly peak: number;
}

/** A download's progress or end; `reason` is `network`, `check`, `space` or `cancelled` when it failed, else empty. */
export interface InstallEvent {
  readonly kind: 'progress' | 'waiting' | 'done' | 'failed';
  readonly bytes: number;
  readonly total: number;
  readonly reason: string;
}

/** A word's start within its chunk's audio, and the range of the verse it lights. */
export interface WordStart {
  readonly sample: number;
  readonly location: number;
  readonly length: number;
}

/** A rendered chunk: the frames each id took, the audio's sample count, and the render's time. */
export interface Rendered {
  readonly frames: ReadonlyArray<number>;
  readonly samples: number;
  readonly millis: number;
}

/** The natural voice could not do what was asked: no module here, or the module refused. */
export class NaturalUnavailable extends Schema.TaggedError<NaturalUnavailable>()(
  'NaturalUnavailable',
  { reason: Schema.String },
) {}

/** The natural voice's native module. */
export class NaturalModule extends Context.Service<
  NaturalModule,
  {
    readonly status: (
      revision: string,
      files: ReadonlyArray<ModelFile>,
    ) => Effect.Effect<NaturalStatus>;
    readonly install: (
      base: string,
      revision: string,
      files: ReadonlyArray<ModelFile>,
    ) => Effect.Effect<void, NaturalUnavailable>;
    readonly cancelInstall: Effect.Effect<void>;
    readonly remove: Effect.Effect<void, NaturalUnavailable>;
    readonly load: (
      revision: string,
      files: ReadonlyArray<ModelFile>,
      voice: string,
    ) => Effect.Effect<number, NaturalUnavailable>;
    readonly render: (
      utterance: number,
      chunk: number,
      ids: ReadonlyArray<number>,
    ) => Effect.Effect<Rendered, NaturalUnavailable>;
    readonly play: (
      utterance: number,
      chunk: number,
      starts: ReadonlyArray<WordStart>,
      last: boolean,
    ) => Effect.Effect<void, NaturalUnavailable>;
    readonly pause: Effect.Effect<void>;
    readonly resume: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly subscribe: (
      listener: (event: VoiceEvent) => void,
    ) => Effect.Effect<void, never, Scope.Scope>;
    readonly subscribeInstall: (
      listener: (event: InstallEvent) => void,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()('heartseed/natural/NaturalModule') {}
