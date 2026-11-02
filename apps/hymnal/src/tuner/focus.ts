/**
 * Which of the ear's readings the tuner shows, pure: the string's pitch, not
 * the room's talk.
 *
 * A speaking voice's fundamental (85-255 Hz) lies inside the strings' range
 * and is as harmonic as a string, so no band filter and no harmonicity test
 * parts the two. Time does: a string holds its pitch within a few cents for
 * as long as it rings, while a voice glides through every syllable and voices
 * only 80-280 ms at a time. So a pitch shows only once it has held.
 *
 * - **Lock:** with no pitch held, the frame that completes a run of
 *   `HOLD_FRAMES` frames in a row, each reading a pitch, all within
 *   `LOCK_CENTS` of one another (highest over lowest), shows its pitch, and
 *   that pitch is held.
 * - **Follow:** while a pitch is held, a frame reading a pitch within
 *   `FOLLOW_CENTS` of it shows that pitch, which becomes the held one, so a
 *   peg turned on a ringing string is followed.
 * - **Hold:** up to `MISSES` frames in a row reading no pitch, or one farther
 *   than `FOLLOW_CENTS`, show the held pitch unchanged. The next one lets it
 *   go: that frame shows none and is heard as from the start state, so it
 *   may begin the next run.
 *
 * A reading under `FLOOR_HZ` counts as none: steady mains hum at 60 Hz would
 * otherwise lock.
 */

import { Data, Option } from 'effect';

import { detect } from './pitch';

/** A pitch shows on the frame that completes a run of this many frames reading it. */
const HOLD_FRAMES = 4;
/** A run's readings lie within this many cents of one another, highest over lowest. */
const LOCK_CENTS = 10;
/** While a pitch is held, a reading within this many cents of it is shown and held. */
const FOLLOW_CENTS = 20;
/** A held pitch rides out this many missed frames in a row; the next lets it go. */
const MISSES = 2;
/** A reading under this many Hz counts as none: above 60 Hz mains hum, under the lowest pluck read (a low E down a whole tone and 100 cents flat, 69.3 Hz). */
const FLOOR_HZ = 65;

/** Where the focus stands between frames. Only `hear` reads it. */
export type Focus = Data.TaggedEnum<{
  /** No pitch held: the readings of the frames in a row so far, the latest last, at most `HOLD_FRAMES`. */
  Seeking: { readonly run: ReadonlyArray<number> };
  /** A pitch held, and the frames missed in a row since it was last read. */
  Holding: { readonly held: number; readonly misses: number };
}>;
const Focus = Data.taggedEnum<Focus>();

/** A frame heard: the focus after it, and the pitch the tuner shows for it (none: nothing shown). */
interface Heard {
  readonly focus: Focus;
  readonly hz: Option.Option<number>;
}

/** The start state: nothing held, no run. */
export const unfocused: Focus = Focus.Seeking({ run: [] });

const centsBetween = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

/** The run of `HOLD_FRAMES` readings holds steady within `LOCK_CENTS`. */
const steady = (run: ReadonlyArray<number>) =>
  run.length === HOLD_FRAMES && centsBetween(Math.max(...run), Math.min(...run)) <= LOCK_CENTS;

/** With no pitch held: the reading extends the run (a frame with none ends it), and a steady run locks. */
const seek = (run: ReadonlyArray<number>, reading: Option.Option<number>): Heard =>
  Option.match(reading, {
    onNone: () => ({ focus: unfocused, hz: Option.none() }),
    onSome: (hz) => {
      const next = [...run, hz].slice(-HOLD_FRAMES);
      if (steady(next)) return { focus: Focus.Holding({ held: hz, misses: 0 }), hz: reading };
      return { focus: Focus.Seeking({ run: next }), hz: Option.none() };
    },
  });

/** With `held` held: a near reading is followed, a miss is ridden out, and the miss past `MISSES` lets go. */
const follow = (held: number, misses: number, reading: Option.Option<number>): Heard => {
  if (Option.isSome(reading) && Math.abs(centsBetween(reading.value, held)) <= FOLLOW_CENTS)
    return { focus: Focus.Holding({ held: reading.value, misses: 0 }), hz: reading };
  if (misses < MISSES)
    return { focus: Focus.Holding({ held, misses: misses + 1 }), hz: Option.some(held) };
  // Letting go: this frame shows none and is heard as from `unfocused`, so it may start the next run.
  return seek([], reading);
};

/**
 * Hears one frame (`sampleRate` Hz) from `focus`: what the tuner shows for it,
 * and the focus for the next frame. Reads the frame through `detect` once and
 * leaves it unchanged.
 */
export const hear = (focus: Focus, frame: Float32Array, sampleRate: number): Heard => {
  const reading = Option.filter(detect(frame, sampleRate), (hz) => hz >= FLOOR_HZ);
  return Focus.$match(focus, {
    Seeking: ({ run }) => seek(run, reading),
    Holding: ({ held, misses }) => follow(held, misses, reading),
  });
};
