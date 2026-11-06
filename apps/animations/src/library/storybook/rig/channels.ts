import { ease } from '../shot.ts';

/** The lead's table key cut into parts (`films/in-its-order/cast/lead-table-rig/cutout/cut.ts`), by name. */
export const RIG_PARTS = ['body', 'lap', 'head', 'armLeft', 'armRight', 'clothSleeve'] as const;

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
  lap: STILL,
  head: STILL,
  armLeft: STILL,
  armRight: STILL,
  clothSleeve: STILL,
};

/** Each part's parent: the torso (`body`) and the lap are roots, the head and the arms ride the torso, the sleeve's hanging curve rides the raised arm. */
export const PARENTS: Readonly<Record<RigPart, RigPart | 'none'>> = {
  body: 'none',
  lap: 'none',
  head: 'body',
  armLeft: 'body',
  armRight: 'body',
  clothSleeve: 'armLeft',
};

/** A follower's numbers: `lag` frames behind what it follows, `size` degrees at its fullest, and `over`, the share of `size` it swings past each turn of the breath before it settles. */
export interface Follow {
  readonly lag: number;
  readonly size: number;
  readonly over: number;
}

/** The accent's numbers for one part: it rises over the accent's `rise` frames to `size` (degrees, or cell px for the lift) `before` frames before the stressed word's onset, after a wind-up of `anticipate` the other way over the `wind` frames before the rise; it overshoots by the share `over`, holds `hold` frames and settles over the accent's `fall`. */
export interface Beat {
  readonly before: number;
  readonly size: number;
  readonly anticipate: number;
  readonly wind: number;
  readonly over: number;
  readonly hold: number;
}

/** The accent's blink: the eyes shut `frames` frames from `before` frames before the stressed word's onset. */
export interface AccentBlink {
  readonly before: number;
  readonly frames: number;
}

/**
 * The rig's numbers. The torso breathes: it stretches up about his belt by
 * `breath` at its fullest (so his shoulders lift and his lap, stool and feet
 * stay) and leans back `lean` degrees with it, on a breath with a shape: a
 * quick inhale over `inhale` of its period, a slower exhale over `exhale`,
 * and a rest at the bottom. His head follows the lean (`head`), the raised
 * bottle arm sways on his shoulder a quarter breath or more behind (`hand`),
 * each overshooting each turn and settling within `settle` frames; the
 * sleeve's hanging curve trails the arm `cloth.lag` frames late, swinging
 * on past it by `cloth.size` of its turn. The accent on the stressed word
 * (`accent`): his shoulders lift first (`lift`, the torso raised, cell px),
 * then the torso leans toward the bottle, the bottle arm turns out and the
 * head tilts to it, each with a wind-up, a rise of `rise` frames, an
 * overshoot and a settle of `fall` frames; he blinks on the head's rise
 * (`blink`).
 */
export interface RigNumbers {
  readonly breath: number;
  readonly lean: number;
  readonly inhale: number;
  readonly exhale: number;
  readonly settle: number;
  readonly head: Follow;
  readonly hand: Follow;
  readonly cloth: { readonly lag: number; readonly size: number };
  readonly accent: {
    readonly rise: number;
    readonly fall: number;
    readonly body: Beat;
    readonly hand: Beat;
    readonly head: Beat;
    readonly lift: Beat;
    readonly blink: AccentBlink;
  };
}

/** The rig's numbers as the prototype draws them. */
export const IDLE: RigNumbers = {
  breath: 0.018,
  lean: 0.4,
  inhale: 0.35,
  exhale: 0.5,
  settle: 8,
  head: { lag: 5, size: 1, over: 0.4 },
  hand: { lag: 30, size: 1.2, over: 0.4 },
  cloth: { lag: 7, size: 0.6 },
  accent: {
    rise: 4,
    fall: 20,
    lift: { before: 11, size: 5.5, anticipate: 0, wind: 0, over: 0, hold: 10 },
    body: { before: 5, size: 0.8, anticipate: 0.3, wind: 4, over: 0, hold: 3 },
    hand: { before: 4, size: 4.5, anticipate: 0.8, wind: 4, over: 0.15, hold: 3 },
    head: { before: 3, size: 3.4, anticipate: 1.6, wind: 5, over: 0.12, hold: 3 },
    blink: { before: 7, frames: 3 },
  },
};

/** The rig's numbers with no accent: its idle alone. */
export const idleOnly = (n: RigNumbers): RigNumbers => {
  const none: Beat = { before: 0, size: 0, anticipate: 0, wind: 0, over: 0, hold: 0 };
  return {
    ...n,
    accent: {
      ...n.accent,
      body: none,
      hand: none,
      head: none,
      lift: none,
      blink: { before: 0, frames: 0 },
    },
  };
};

/** What the channels are read on: the film's frame rate, the stressed word's onset (shot s), and the figure's own breath, its period and its start (shot s), as its hold breathes (`shot.ts`, `breathPeriodOf`). */
export interface RigClock {
  readonly fps: number;
  readonly stress: number;
  readonly period: number;
  readonly from: number;
}

/** The breath's fill at phase `u` of one breath (0 to 1): a quick inhale, a slower exhale, then rest. */
const curveAt = (n: RigNumbers, u: number): number => {
  if (u < n.inhale) return (1 - Math.cos((Math.PI * u) / n.inhale)) / 2;
  return (1 + Math.cos(Math.PI * Math.min(1, (u - n.inhale) / n.exhale))) / 2;
};

/** The breath's fill at `t` (s): 0 at rest, 1 at its fullest, on the hold's own period and start. */
export const fillAt = (n: RigNumbers, clock: RigClock, t: number): number => {
  const cycles = (t - clock.from) / clock.period;
  return curveAt(n, cycles - Math.floor(cycles));
};

/** A swing past a turn `s` frames after it, settling: 0 at the turn, out to about 0.6 and back within half of `settle`, then a smaller swing back. */
const swingAfter = (n: RigNumbers, s: number): number => {
  if (s <= 0) return 0;
  return Math.exp(-(2 * s) / n.settle) * Math.sin((Math.PI * s) / (n.settle * 0.75));
};

/** The swings past the breath's two turns (its top, outward; its bottom, back) at `t` s, as a follower that turns with the breath sees them. */
const overAt = (n: RigNumbers, clock: RigClock, t: number): number => {
  const cycles = (t - clock.from) / clock.period;
  const first = Math.floor(cycles) - 1;
  return [first, first + 1].reduce((sum, c) => {
    const top = (c + n.inhale - cycles) * clock.period * clock.fps;
    const bottom = (c + n.inhale + n.exhale - cycles) * clock.period * clock.fps;
    return sum + swingAfter(n, -top) - swingAfter(n, -bottom);
  }, 0);
};

/** A follower's angle at `t` s: the breath `lag` frames late, `size` degrees at its fullest (back, so negative), with its swing past each turn. */
const followAt = (n: RigNumbers, clock: RigClock, f: Follow, t: number): number => {
  const late = t - f.lag / clock.fps;
  return -f.size * (fillAt(n, clock, late) + f.over * overAt(n, clock, late));
};

/** A beat's pose at `t` s: still, a wind-up the other way over `wind` frames, a rise of `rise` frames to `size` past which it overshoots by `over`, a hold of `hold` frames, then the settle over `fall` frames back to 0. */
export const beatAt = (n: RigNumbers, clock: RigClock, b: Beat, t: number): number => {
  const s = (t - clock.stress) * clock.fps + b.before;
  const { rise, fall } = n.accent;
  const anticipation = Math.sin(
    Math.PI * Math.min(1, Math.max(0, (s + rise + b.wind) / (b.wind + 1.5))),
  );
  const up = ease((s + rise) / rise);
  const overshoot = Math.sin(Math.PI * Math.min(1, Math.max(0, s / 4)));
  const down = ease((s - b.hold) / fall);
  return b.size * (up * (1 + b.over * overshoot) - down) - b.anticipate * anticipation * (1 - up);
};

/** Whether his eyes are shut by the accent's blink at `t` s: from `blink.before` frames before the stressed word's onset, for `blink.frames` frames. */
export const blinkAt = (n: RigNumbers, clock: RigClock, t: number): boolean => {
  const s = Math.round((t - clock.stress) * clock.fps * 1000) / 1000 + n.accent.blink.before;
  return s >= 0 && s < n.accent.blink.frames;
};

/**
 * Every part's pose at `t`, a pure function of the time and the clock: the
 * torso's breath, lift and lean about his belt; the head's follow and its beat,
 * carried up the torso unstretched; the bottle arm's sway and its beat, also
 * unstretched; the sleeve's curve trailing the arm; the hand on his knee and
 * his lap still.
 */
export const rigPoseAt = (clock: RigClock, t: number, n: RigNumbers = IDLE): RigPose => {
  const fill = fillAt(n, clock, t);
  const breath = 1 + n.breath * fill;
  const arm = (at: number) => followAt(n, clock, n.hand, at) + beatAt(n, clock, n.accent.hand, at);
  return {
    body: {
      ...STILL,
      angle: -n.lean * fill + beatAt(n, clock, n.accent.body, t),
      sy: breath,
      dy: -beatAt(n, clock, n.accent.lift, t),
    },
    lap: STILL,
    head: {
      ...STILL,
      angle: followAt(n, clock, n.head, t) + beatAt(n, clock, n.accent.head, t),
      sy: 1 / breath,
    },
    armLeft: { ...STILL, angle: arm(t), sy: 1 / breath },
    armRight: STILL,
    clothSleeve: { ...STILL, angle: n.cloth.size * arm(t - n.cloth.lag / clock.fps) },
  };
};

/** The guest man's neutral key cut into parts (`films/in-its-order/cast/man-table-rig/cutout/cut.ts`), front to back. */
export const MAN_PARTS = ['head', 'body'] as const;

/** A part of the man's rig. */
export type ManPart = (typeof MAN_PARTS)[number];

/** The man's parts' parents: his head rides his still body. */
export const MAN_PARENTS: Readonly<Record<ManPart, ManPart | 'none'>> = {
  head: 'body',
  body: 'none',
};

/**
 * The man's stare as a turn of parts, in frames from the turn's start: his
 * head turns on its pivot toward the lead, `angle` degrees and `dx`, `dy`
 * cell px at its fullest, eased over `rise` frames; his eyes shut at frame
 * `shut` for `blink` frames; the drawing swaps from the turn's first cell to
 * its last at frame `swap`, inside the blink, and the last is drawn whole
 * from there. The rig draws the turn's first `span` frames (today's turn's
 * length), then today's hold goes on.
 */
export interface TurnNumbers {
  readonly rise: number;
  readonly angle: number;
  readonly dx: number;
  readonly dy: number;
  readonly shut: number;
  readonly blink: number;
  readonly swap: number;
  readonly span: number;
}

/** The man's turn as the prototype draws it. */
export const STARE_TURN: TurnNumbers = {
  rise: 3,
  angle: 3,
  dx: 3,
  dy: 0,
  shut: 2,
  blink: 2,
  swap: 3,
  span: 9,
};

/** The man's turn at one frame: whether the rig draws it, the drawing (`'from'` or `'to'`), whether his eyes are shut, and each part's pose. */
export interface TurnPose {
  readonly drawn: boolean;
  readonly cell: 'from' | 'to';
  readonly shut: boolean;
  readonly head: PartPose;
  readonly body: PartPose;
}

/** The man's turn at `t` s, the turn starting at `at` s at `fps`: a pure function of the time. */
export const turnAt = (n: TurnNumbers, fps: number, at: number, t: number): TurnPose => {
  const k = Math.floor(Math.round((t - at) * fps * 1000) / 1000);
  const cell = (['from', 'to'] as const)[Number(k >= n.swap)] ?? 'from';
  const u = ease((k + 1) / n.rise) * Number(k < n.swap);
  return {
    drawn: k >= 0 && k < n.span,
    cell,
    shut: k >= n.shut && k < n.shut + n.blink,
    head: { ...STILL, angle: n.angle * u, dx: n.dx * u, dy: n.dy * u },
    body: STILL,
  };
};
