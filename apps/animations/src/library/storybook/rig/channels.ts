import { ease } from '../shot.ts';

/** The lead's table key cut into parts (`films/in-its-order/cast/lead-table-rig/cutout/cut.ts`), by name. */
export const RIG_PARTS = ['body', 'head', 'armLeft', 'armRight', 'clothSash'] as const;

/** A part of the rig. */
export type RigPart = (typeof RIG_PARTS)[number];

/** A part's pose about its pivot, after its parent's: turned `angle` degrees (clockwise on screen), stretched `sx`, `sy`, and moved `dx`, `dy` px of its cell. */
export interface PartPose {
  readonly angle: number;
  readonly sx: number;
  readonly sy: number;
  readonly dx: number;
  readonly dy: number;
}

/** A part at rest. */
export const STILL: PartPose = { angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 };

/** Every part's pose at one moment. */
export type RigPose = Readonly<Record<RigPart, PartPose>>;

/** The rig at rest: every channel 0, so it draws its cell as the cell is. */
export const RIG_REST: RigPose = {
  body: STILL,
  head: STILL,
  armLeft: STILL,
  armRight: STILL,
  clothSash: STILL,
};

/** Each part's parent: the body is the root, every other part rides it. */
export const PARENTS: Readonly<Record<RigPart, RigPart | 'none'>> = {
  body: 'none',
  head: 'body',
  armLeft: 'body',
  armRight: 'body',
  clothSash: 'body',
};

/**
 * The layered idle's numbers. The body breathes (stretches up about his
 * soles by `breath` at its fullest) and leans back `lean` degrees with it;
 * his head follows the lean `head.lag` frames late, `head.follow` degrees
 * at its fullest; the raised bottle hand sways `hand.sway` degrees on its
 * elbow `hand.lag` frames behind; the sash's hanging end swings
 * `cloth.swing` degrees on the knot `cloth.lag` frames behind. The accent on
 * the stressed word tilts his head `accent.head` degrees toward the bottle
 * and turns the bottle hand out `accent.hand` degrees and up `accent.lift`
 * px: a rise of `accent.rise` frames that peaks `accent.before` frames
 * before the word's onset, then a settle of `accent.settle` frames.
 */
export const IDLE = {
  breath: 0.008,
  lean: 0.3,
  head: { lag: 4, follow: 1.2 },
  hand: { lag: 10, sway: 0.9 },
  cloth: { lag: 7, swing: 0.9 },
  accent: { rise: 6, before: 1, settle: 24, head: 2, hand: 1.6, lift: 3 },
} as const;

/** What the channels are read on: the film's frame rate, the stressed word's onset (shot s), and the figure's own breath, its period and its start (shot s), as its hold breathes (`shot.ts`, `breathPeriodOf`). */
export interface RigClock {
  readonly fps: number;
  readonly stress: number;
  readonly period: number;
  readonly from: number;
}

/** The breath's fill at `t`: 0 at rest, 1 at its fullest, the hold's own phase. */
const fillAt = (clock: RigClock, t: number): number =>
  (1 - Math.cos((2 * Math.PI * (t - clock.from)) / clock.period)) / 2;

/** The accent at `t`, 0 to 1: up over its rise to its peak before the stressed word, then settled back. */
export const accentAt = (clock: RigClock, t: number): number => {
  const { rise, before, settle } = IDLE.accent;
  const peak = clock.stress - before / clock.fps;
  const up = ease((t - (peak - rise / clock.fps)) / (rise / clock.fps));
  const down = ease((t - peak) / (settle / clock.fps));
  return up - down;
};

/**
 * Every part's pose at `t`, a pure function of the time and the clock: the
 * body's breath and lean, the head's follow and nod, the bottle hand's sway
 * and lift, the sash's swing; the hand resting on his knee stays still.
 */
export const rigPoseAt = (clock: RigClock, t: number): RigPose => {
  const late = (frames: number) => fillAt(clock, t - frames / clock.fps);
  const accent = accentAt(clock, t);
  return {
    body: { ...STILL, angle: -IDLE.lean * late(0), sy: 1 + IDLE.breath * late(0) },
    head: {
      ...STILL,
      angle: -IDLE.head.follow * late(IDLE.head.lag) + IDLE.accent.head * accent,
    },
    armLeft: {
      ...STILL,
      angle: -IDLE.hand.sway * late(IDLE.hand.lag) + IDLE.accent.hand * accent,
      dy: -IDLE.accent.lift * accent,
    },
    armRight: STILL,
    clothSash: { ...STILL, angle: -IDLE.cloth.swing * late(IDLE.cloth.lag) },
  };
};
