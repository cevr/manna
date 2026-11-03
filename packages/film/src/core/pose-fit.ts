import type { Rgb } from './cast-sheet-pixels.ts';
import { type Puppet, type PuppetPose, rasterOf } from './puppet.ts';
import type { Raster } from './raster.ts';

interface PoseFitOptions {
  readonly bones?: ReadonlyArray<string>;
  readonly start?: PuppetPose;
  readonly paper?: Rgb;
  readonly reach?: number;
}

interface PoseFit extends PuppetPose {
  readonly loss: number;
  readonly rasters: number;
}

const FIRST = { turn: 16, move: 8, scale: 0.04 } as const;

const HALVINGS = 8;

const SWEEPS = 64;

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

type Coords = number[];

const forebearsOf = (puppet: Puppet, bones: ReadonlyArray<string>) =>
  bones.map((name) => {
    const parentOf = (n: string) => puppet.bones.find((b) => b.name === n)?.parent;
    for (let up = parentOf(name); up !== undefined; up = parentOf(up)) {
      const i = bones.indexOf(up);
      if (i >= 0) return i;
    }
    return -1;
  });

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
    if (bones.some((b) => Math.abs((pose.numbers[b] ?? 0) - (start.numbers[b] ?? 0)) > reach))
      return Infinity;
    rasters++;
    return lossOf(target, rasterOf(puppet, pose, size), paper);
  };
  const turns = bones.map(() => FIRST.turn);
  const held = descend(
    { at: [...bones.map(() => 0), start.root[0], start.root[1], start.scale], loss: Infinity },
    [...turns, 0, 0, 0],
    score,
  );
  const all = descend(held, [...turns, FIRST.move, FIRST.move, FIRST.scale], score);
  return { ...poseOf(bones, up, all.at, start), loss: all.loss, rasters };
};

interface Reached {
  readonly at: Coords;
  readonly loss: number;
}

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

const OFF_PAPER = 24;

const FEET = 0.1;

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
