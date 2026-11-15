import type { Context, Effect, Stream } from 'effect';

import type { Cue, MatcherView, OrNull } from './matcher.d.ts';

/** Whether a recital listens: at rest, listening, or finishing. */
export type Status = 'idle' | 'listening' | 'finishing';

/** The recognizers a listen may ask for, best first. */
export type Engine = 'analyzer' | 'dictation' | 'recognizer';

/** How a recital ended. */
export type Ending = 'finished' | 'cancelled' | 'denied' | 'unavailable' | 'interrupted' | 'failed';

/** What a screen shows of a recital. */
export interface DictationView {
  readonly status: Status;
  readonly engine: OrNull<Engine>;
  readonly verse: OrNull<string>;
  readonly matcher: OrNull<MatcherView>;
  readonly ended: OrNull<Ending>;
}

/** What an engine can do on this device now. */
export interface EngineReport {
  readonly engine: string;
  readonly status: string;
}

declare const DictationTag: Context.ServiceClass<
  Dictation,
  'heartseed/dictation/Dictation',
  {
    readonly start: (verse: string, cue?: Cue) => Effect.Effect<void>;
    readonly finish: Effect.Effect<void>;
    readonly cancel: Effect.Effect<void>;
    readonly peek: (index: number) => Effect.Effect<void>;
    readonly engines: Effect.Effect<readonly EngineReport[]>;
    readonly view: Effect.Effect<DictationView>;
    readonly changes: Stream.Stream<DictationView>;
    readonly endings: Stream.Stream<DictationView>;
  }
>;

/** One recital of a verse, and what a screen shows of it. */
export declare class Dictation extends DictationTag {}
