import { Data, Option } from 'effect';

import { detect } from './pitch';

const HOLD_FRAMES = 4;
const LOCK_CENTS = 10;
const FOLLOW_CENTS = 20;
const MISSES = 2;
const FLOOR_HZ = 65;

type State = Data.TaggedEnum<{
  Seeking: { readonly run: ReadonlyArray<number> };
  Holding: { readonly held: number; readonly misses: number };
}>;
const State = Data.taggedEnum<State>();

const state: unique symbol = Symbol('focus');

export interface Focus {
  readonly [state]: State;
}

const focusOf = (at: State): Focus => ({ [state]: at });

interface Heard {
  readonly focus: Focus;
  readonly hz: Option.Option<number>;
}

export const unfocused: Focus = focusOf(State.Seeking({ run: [] }));

const centsBetween = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

const steady = (run: ReadonlyArray<number>) =>
  run.length === HOLD_FRAMES && centsBetween(Math.max(...run), Math.min(...run)) <= LOCK_CENTS;

const seek = (run: ReadonlyArray<number>, reading: Option.Option<number>): Heard =>
  Option.match(reading, {
    onNone: () => ({ focus: unfocused, hz: Option.none() }),
    onSome: (hz) => {
      const next = [...run, hz].slice(-HOLD_FRAMES);
      if (steady(next))
        return { focus: focusOf(State.Holding({ held: hz, misses: 0 })), hz: reading };
      return { focus: focusOf(State.Seeking({ run: next })), hz: Option.none() };
    },
  });

const follow = (held: number, misses: number, reading: Option.Option<number>): Heard => {
  if (Option.isSome(reading) && Math.abs(centsBetween(reading.value, held)) <= FOLLOW_CENTS)
    return { focus: focusOf(State.Holding({ held: reading.value, misses: 0 })), hz: reading };
  if (misses < MISSES)
    return { focus: focusOf(State.Holding({ held, misses: misses + 1 })), hz: Option.some(held) };
  return seek([], reading);
};

export const hear = (focus: Focus, frame: Float32Array, sampleRate: number): Heard => {
  const reading = Option.filter(detect(frame, sampleRate), (hz) => hz >= FLOOR_HZ);
  return State.$match(focus[state], {
    Seeking: ({ run }) => seek(run, reading),
    Holding: ({ held, misses }) => follow(held, misses, reading),
  });
};
