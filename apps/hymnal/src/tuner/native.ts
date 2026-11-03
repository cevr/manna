/**
 * The tuner's ear off iOS: none. The web is not a target, and Android's
 * input (AudioRecord) is a follow-up, so `available` is false and the
 * tuner's entries hide there.
 *
 * This file also declares the ear's typed shape, which `native.ios.ts`
 * gives on iOS over the Swift module `native/tuner/Listen.swift`.
 */

import type { Cause, Effect } from 'effect';
import { Option } from 'effect';

/** Why listening ended: a `stop`, a call or Siri, an input that came or went, or the media services' reset. */
export type ListenEnd = 'stopped' | 'interruption' | 'route' | 'failure';

export interface Listen {
  /** Takes the microphone (granted beforehand) and answers its sample rate in hertz; fails without the permission or an input. */
  readonly start: Effect.Effect<number, Cause.UnknownError>;
  /** Gives the microphone back and ends with `stopped`; does nothing when not listening. */
  readonly stop: Effect.Effect<void>;
  /** Each frame of 2048 mono samples, hop 2048, at the rate `start` answered. Answers the unsubscribe. */
  readonly onFrame: (listener: (frame: Float32Array) => void) => () => void;
  /** The end of listening, with its reason. Answers the unsubscribe. */
  readonly onEnd: (listener: (reason: ListenEnd) => void) => () => void;
}

export const listen: Option.Option<Listen> = Option.none();

/** Whether this platform has the ear; the tuner's entries show only where it does. */
export const available: boolean = Option.isSome(listen);
