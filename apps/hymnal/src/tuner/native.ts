import type { Cause, Effect } from 'effect';
import { Option } from 'effect';

export type ListenEnd = 'stopped' | 'interruption' | 'route' | 'failure';

export interface Listen {
  readonly start: Effect.Effect<number, Cause.UnknownError>;
  readonly stop: Effect.Effect<void>;
  readonly onFrame: (listener: (frame: Float32Array) => void) => () => void;
  readonly onEnd: (listener: (reason: ListenEnd) => void) => () => void;
}

export const listen: Option.Option<Listen> = Option.none();

export const available: boolean = Option.isSome(listen);
