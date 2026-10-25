/**
 * A dial's physics, pure: a row of detents, `DETENT` points apart, that a
 * finger drags past a notch and flings. A dial of `count` detents either
 * wraps (the twelve keys: past the last comes the first) or stops at its
 * ends (the capo's frets, the text sizes). A dial's place is in points
 * along its row, detent `i` at `i * DETENT`; a finger dragged left brings
 * the higher detents to the notch.
 *
 * Let go, a dial glides on at the speed it was flung (held under the fling
 * cap), slowing by `DECAY` each 16 ms frame until it creeps, and then snaps
 * to the nearest detent. A stopping dial that reaches an end stops there at
 * once and gives a `wall` cue. Each detent the glide passes gives a `detent`
 * cue, in order. Every function here is a worklet, so the dial runs it on
 * the UI thread as the finger lets go.
 */

import type { Cue, DialName } from '~/feel/cue';

/** The space between two detents, in points: a tap target and more, card J's 44 a little bigger. */
export const DETENT = 52;

/** How much of its speed a glide keeps each frame. */
export const DECAY = 0.955;

/** A frame, in milliseconds. */
export const FRAME = 16;

/** The fastest fling a dial takes, in points a second. */
export const FLING_CAP = 3000;

/** The speed, in points a second, under which a glide ends and the dial snaps. */
const CREEP = 20;

/** The most frames a glide takes from the fling cap to a creep, and a snap's frame. */
export const MOST_FRAMES = Math.ceil(Math.log(CREEP / FLING_CAP) / Math.log(DECAY)) + 1;

export interface Detents {
  /** Which dial it is: its detents' cues name it. */
  readonly name: DialName;
  /** How many detents the dial has. */
  readonly count: number;
  /** Whether the dial wraps from its last detent to its first. */
  readonly wrap: boolean;
}

/** Where a glide comes to rest. */
export interface Rest {
  /** The detent it rests on, as a place on the row (unbounded on a wrapping dial). */
  readonly at: number;
  /** That detent among the dial's own, 0 to `count - 1`. */
  readonly index: number;
  /** How many frames the glide takes. */
  readonly frames: number;
  /** Each detent passed on the way, the one it rests on last, as the dial's own. */
  readonly crossed: ReadonlyArray<number>;
  /** The cues the glide gives: a `detent` for each one passed, then a `wall` if it hit an end. */
  readonly cues: ReadonlyArray<Cue>;
}

/** `n` among a dial's own detents: wrapped on a wrapping dial, held to the ends on a stopping one. */
export const ownDetent = (dial: Detents, n: number): number => {
  'worklet';
  if (dial.wrap) return ((n % dial.count) + dial.count) % dial.count;
  return Math.min(Math.max(n, 0), dial.count - 1);
};

/** The detent nearest a place on the row (unbounded). */
export const detentAt = (place: number): number => {
  'worklet';
  return Math.round(place / DETENT);
};

/** The row's last place a stopping dial reaches. */
const end = (dial: Detents): number => {
  'worklet';
  return (dial.count - 1) * DETENT;
};

/** A place a finger drags the dial to, held to a stopping dial's ends; `wall` when it was held. */
export const dragTo = (dial: Detents, place: number) => {
  'worklet';
  if (dial.wrap) return { place, wall: false };
  const held = Math.min(Math.max(place, 0), end(dial));
  return { place: held, wall: held !== place };
};

/**
 * The detents a row passes going from detent `before` to detent `now` (both
 * unbounded places on the row), one step at a time, in order, each among
 * the dial's own; the last is `now`'s. None when they are the same.
 */
export const passed = (dial: Detents, before: number, now: number): ReadonlyArray<number> => {
  'worklet';
  const step = Math.sign(now - before);
  return Array.from({ length: Math.abs(now - before) }, (_, k) =>
    ownDetent(dial, before + step * (k + 1)),
  );
};

/**
 * Where a dial let go at `place`, moving `speed` points a second (toward
 * the higher detents when positive), comes to rest.
 */
export const glide = (dial: Detents, place: number, speed: number): Rest => {
  'worklet';
  const from = detentAt(dragTo(dial, place).place);
  let at = dragTo(dial, place).place;
  let v = Math.min(Math.max(speed, -FLING_CAP), FLING_CAP);
  let frames = 0;
  let wall = false;
  while (Math.abs(v) >= CREEP && !wall) {
    const moved = dragTo(dial, at + (v * FRAME) / 1000);
    at = moved.place;
    wall = moved.wall;
    v *= DECAY;
    frames += 1;
  }
  // The snap to the nearest detent takes one frame more.
  const rest = detentAt(at);
  const crossed = passed(dial, from, rest);
  const cues: Array<Cue> = crossed.map((n) => ({ _tag: 'detent', dial: dial.name, at: n }));
  if (wall) cues.push({ _tag: 'wall' });
  return { at: rest * DETENT, index: ownDetent(dial, rest), frames: frames + 1, crossed, cues };
};

/**
 * The place nearest `now` where detent `index` sits: on a wrapping dial,
 * the copy of it the shortest turn reaches, so a dial set from outside
 * turns the short way round.
 */
export const placeOf = (dial: Detents, now: number, index: number): number => {
  'worklet';
  if (!dial.wrap) return ownDetent(dial, index) * DETENT;
  const here = detentAt(now);
  const turn =
    ((((index - here) % dial.count) + dial.count + Math.floor(dial.count / 2)) % dial.count) -
    Math.floor(dial.count / 2);
  return (here + turn) * DETENT;
};
