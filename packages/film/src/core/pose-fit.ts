// The fit of a puppet's pose to a kept view (`film concept fit`): the bone
// numbers, the root's place and the one scale whose CPU raster (`rasterOf`),
// laid over the view's paper, is nearest the view. Pure and deterministic.
//
// - **Loss.** The mean, over the view's pixels, of the squared RGB
//   difference between the view and the puppet's raster laid over the
//   view's paper (its top-left pixel, unless given).
// - **Coordinates.** Each named bone's turn from the start in the world
//   (its number less its nearest named forebear's), so a bone's pixels
//   answer its own coordinate, and a child keeps its world angle while its
//   parent turns; then the root's x and y, and the scale.
// - **Search.** Coordinate descent from a fixed start (the rest pose, or
//   `start`): at each step size, sweep the coordinates, each tried a step up
//   and a step down; take a move only when it lowers the loss, and sweep
//   again until a sweep moves nothing; then halve every step, from 16° (8
//   px, 0.04 of scale) down to 1/256 of that (0.0625°). The same input
//   gives the same pose. A bone turns no further from its start than
//   `reach`, when given.

import type { Rgb } from './cast-sheet-pixels.ts';
import { type Puppet, type PuppetPose, rasterOf } from './puppet.ts';
import type { Raster } from './raster.ts';

/** What a fit searches: the bones it turns (none unless named), from where, against which paper. */
export interface PoseFitOptions {
  readonly bones?: ReadonlyArray<string>;
  readonly start?: PuppetPose;
  readonly paper?: Rgb;
  /** How far a bone may turn from its start, degrees: any turn unless given. */
  readonly reach?: number;
}

/** A fitted pose, its loss (lower is nearer the view) and how many rasters the search drew. */
export interface PoseFit extends PuppetPose {
  readonly loss: number;
  readonly rasters: number;
}

/** The first steps: a bone's turn, degrees; the root's move, px; the scale's change. */
const FIRST = { turn: 16, move: 8, scale: 0.04 } as const;

/** How many times the steps halve: 16° down to 0.0625°. */
const HALVINGS = 8;

/** The most sweeps at one step size: a guard, never reached by a loss that only falls. */
const SWEEPS = 64;

/** The mean squared RGB difference between `target` and `drawn` laid over `paper`. */
const lossOf = (target: Raster, drawn: Raster, paper: Rgb) => {
  const a = target.rgba;
  const b = drawn.rgba;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    const k = b[i + 3]! / 255;
    for (let c = 0; c < 3; c++) {
      const d = a[i + c]! - (b[i + c]! * k + paper[c]! * (1 - k));
      sum += d * d;
    }
  }
  return sum / (target.width * target.height);
};

/** The search's coordinates: each named bone's world turn from the start, the root's x and y, the scale. */
type Coords = number[];

/** For each named bone, the index among `bones` of its nearest forebear also named, or -1. */
const forebearsOf = (puppet: Puppet, bones: ReadonlyArray<string>) =>
  bones.map((name) => {
    const parentOf = (n: string) => puppet.bones.find((b) => b.name === n)?.parent;
    for (let up = parentOf(name); up !== undefined; up = parentOf(up)) {
      const i = bones.indexOf(up);
      if (i >= 0) return i;
    }
    return -1;
  });

/** The pose at `at`: each named bone's number its world turn less its named forebear's, on the start's. */
const poseOf = (
  bones: ReadonlyArray<string>,
  up: ReadonlyArray<number>,
  at: Coords,
  start: PuppetPose,
): PuppetPose => ({
  numbers: {
    ...start.numbers,
    ...Object.fromEntries(
      bones.map((b, i) => {
        const parent = up[i]!;
        const less = parent < 0 ? 0 : at[parent]!;
        return [b, (start.numbers[b] ?? 0) + at[i]! - less];
      }),
    ),
  },
  root: [at[bones.length]!, at[bones.length + 1]!],
  scale: at[bones.length + 2]!,
});

/**
 * The pose of `puppet` whose raster, over the paper, is nearest `target`:
 * its named bones' numbers, its root and its scale, by coordinate descent
 * with halving steps from `start` (the rest pose unless given), in the
 * target's frame (the puppet's sheet frame, `target`'s size).
 */
export const fitPose = (puppet: Puppet, target: Raster, options: PoseFitOptions = {}): PoseFit => {
  const bones = options.bones ?? [];
  const start = options.start ?? { numbers: {}, root: puppet.root, scale: 1 };
  const paper: Rgb = options.paper ?? [target.rgba[0]!, target.rgba[1]!, target.rgba[2]!];
  const size = [target.width, target.height] as const;
  const up = forebearsOf(puppet, bones);
  let rasters = 0;
  const reach = options.reach ?? Infinity;
  const score = (at: Coords) => {
    const pose = poseOf(bones, up, at, start);
    // a pose past the reach is no pose: its loss is never lower
    if (bones.some((b) => Math.abs((pose.numbers[b] ?? 0) - (start.numbers[b] ?? 0)) > reach))
      return Infinity;
    rasters++;
    return lossOf(target, rasterOf(puppet, pose, size), paper);
  };
  const turns = bones.map(() => FIRST.turn);
  // The bones first, the root and scale held at the start; then all together.
  const held = descend(
    { at: [...bones.map(() => 0), start.root[0], start.root[1], start.scale], loss: Infinity },
    [...turns, 0, 0, 0],
    score,
  );
  const all = descend(held, [...turns, FIRST.move, FIRST.move, FIRST.scale], score);
  return { ...poseOf(bones, up, all.at, start), loss: all.loss, rasters };
};

/** A point of the search and its loss. */
interface Reached {
  readonly at: Coords;
  readonly loss: number;
}

/** One sweep at `steps`: each coordinate a step up, then down, a move kept when it lowers the loss (a step of 0 holds its coordinate). */
const sweepOnce = (from: Reached, steps: ReadonlyArray<number>, score: (at: Coords) => number) => {
  let best = from;
  for (let i = 0; i < best.at.length; i++)
    for (const sign of [1, -1].filter(() => steps[i] !== 0)) {
      const at = best.at.slice();
      at[i] = best.at[i]! + sign * steps[i]!;
      const loss = score(at);
      if (loss < best.loss) best = { at, loss };
    }
  return best;
};

/** Coordinate descent from `from` with steps `first` halved `HALVINGS` times, each size swept until a sweep moves nothing. */
const descend = (
  from: Reached,
  first: ReadonlyArray<number>,
  score: (at: Coords) => number,
): Reached => {
  let best: Reached = Number.isFinite(from.loss) ? from : { at: from.at, loss: score(from.at) };
  for (let h = 0; h <= HALVINGS; h++) {
    const steps = first.map((s) => s / 2 ** h);
    for (let sweep = 0; sweep < SWEEPS; sweep++) {
      const next = sweepOnce(best, steps, score);
      if (next === best) break;
      best = next;
    }
  }
  return best;
};

/** The box `[x0, y0, x1, y1]` of the px of `r` that `on` holds (by the px's byte offset), in rows from `from` down. */
const boxOf = (r: Raster, on: (i: number) => boolean, from = 0) => {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = Math.max(0, Math.floor(from)); y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      if (on((y * r.width + x) * 4)) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x + 1);
        box[3] = Math.max(box[3], y + 1);
      }
  return box;
};

/** How far a px of the view lies off its paper, summed over RGB, to be its figure's. */
const OFF_PAPER = 24;

/** The share of a figure's height, from its bottom, that holds its feet. */
const FEET = 0.1;

/**
 * A start for a fit to a view that draws the figure at another size: the
 * rest pose scaled and moved so its figure's box (the raster's alpha) fills
 * `target`'s figure box (px off its paper by more than `OFF_PAPER`) in
 * height, their bottoms met and their feet (the box of their lowest
 * `FEET` of rows) centred on each other: a raised arm moves no foot.
 */
export const boxStart = (puppet: Puppet, target: Raster, paper?: Rgb): PuppetPose => {
  const p: Rgb = paper ?? [target.rgba[0]!, target.rgba[1]!, target.rgba[2]!];
  const t = target.rgba;
  const rest = rasterOf(puppet, { numbers: {}, root: puppet.root, scale: 1 });
  const onTarget = (i: number) =>
    Math.abs(t[i]! - p[0]) + Math.abs(t[i + 1]! - p[1]) + Math.abs(t[i + 2]! - p[2]) > OFF_PAPER;
  const onRest = (i: number) => rest.rgba[i + 3]! > 0;
  const [, ty0, , ty1] = boxOf(target, onTarget);
  const [, ry0, , ry1] = boxOf(rest, onRest);
  const [tx0, , tx1] = boxOf(target, onTarget, ty1 - FEET * (ty1 - ty0));
  const [rx0, , rx1] = boxOf(rest, onRest, ry1 - FEET * (ry1 - ry0));
  const scale = (ty1 - ty0) / (ry1 - ry0);
  const [px, py] = puppet.root;
  return {
    numbers: {},
    root: [(tx0 + tx1) / 2 - scale * ((rx0 + rx1) / 2 - px), ty1 - scale * (ry1 - py)],
    scale,
  };
};
