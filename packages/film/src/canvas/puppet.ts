import { Result } from 'effect';
import { BOIL_AMP } from '../core/boil.ts';
import type { ConceptRef } from '../core/match.ts';
import {
  type Puppet,
  type PuppetPose,
  type Skeleton,
  boneTransforms,
  partTurned,
  poseMesh,
} from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import type { BoxEdge } from '../core/unmatte.ts';
import type { Ramp } from './colour.ts';
import { type Dye, dyeKnots } from './dye.ts';
import { probeFigure, probesFigures } from './probe.ts';
import {
  type PuppetDressGl,
  type PuppetGl,
  type PuppetPass,
  UNDRESSED,
  paintPuppetGl,
} from './puppet-gl.ts';

type Pt = readonly [number, number];

export interface PuppetSpec {
  readonly key: string;
  readonly size: Pt;
  readonly parts: ReadonlyArray<{
    readonly name: string;
    readonly png: string;
    readonly ramp?: Ramp;
  }>;
  readonly skeleton: Skeleton;
  readonly origin: Pt;
  readonly concept?: ConceptRef;
  readonly paper?: readonly [number, number, number];
  readonly keep?: ReadonlyArray<readonly [number, number, number]>;
  readonly thin?: ReadonlyArray<string>;
  readonly shadow?: ReadonlyArray<string>;
  readonly open?: ReadonlyArray<BoxEdge>;
  readonly grain?: number;
  readonly underlap?: Readonly<Record<string, number>>;
  readonly drawings?: ReadonlyArray<{
    readonly name: string;
    readonly png: string;
    readonly part?: string;
  }>;
  readonly line?: { readonly width: number; readonly ink: readonly [number, number, number] };
}

interface PuppetPlace {
  readonly s: number;
  readonly dx: number;
  readonly dy: number;
}

interface PuppetSwap {
  readonly part: string;
  readonly drawing: string;
  readonly place: PuppetPlace;
  readonly pivot: Pt;
  readonly theta?: number;
  readonly rides?: boolean;
}

export interface PuppetLook {
  readonly boil: number;
  readonly amp?: number;
  readonly swaps?: ReadonlyArray<PuppetSwap>;
  readonly held?: {
    readonly drawing: string;
    readonly c: Pt;
    readonly at: Pt;
    readonly quiet: number;
    readonly s?: number;
  };
}

export interface PuppetDress {
  readonly hide?: ReadonlyArray<string>;
  readonly dye?: Readonly<Record<string, Ramp>>;
}

export const dressOf = (
  spec: PuppetSpec,
  puppet: Puppet,
  dress: PuppetDress | undefined,
): Result.Result<PuppetDressGl, string> => {
  const index = (name: string) => puppet.parts.findIndex((p) => p.name === name);
  const hidden: number[] = [];
  for (const name of dress?.hide ?? []) {
    const k = index(name);
    if (k < 0) return Result.fail(`the dress hides no part ${name}`);
    hidden.push(k);
  }
  const dyes = new Map<number, Dye>();
  for (const [name, cloth] of Object.entries(dress?.dye ?? {})) {
    const k = index(name);
    if (k < 0) return Result.fail(`the dress dyes no part ${name}`);
    const drawn = spec.parts.find((p) => p.name === name)?.ramp;
    if (drawn === undefined)
      return Result.fail(`the dress dyes part ${name}, which declares no ramp it is drawn in`);
    const made = dyeKnots(drawn, cloth);
    if (Result.isFailure(made)) return Result.fail(`the dress dyes part ${name}: ${made.failure}`);
    dyes.set(k, made.success);
  }
  if (hidden.length === 0 && dyes.size === 0) return Result.succeed(UNDRESSED);
  return Result.succeed({ hidden, dyes });
};

export interface LoadedPuppet {
  readonly puppet: Puppet;
  readonly drawings: ReadonlyMap<string, Raster>;
  readonly paints: boolean;
  readonly gl: PuppetGl;
}

export type { PuppetPose };

const turnedPivots = (puppet: Puppet, m: Float64Array, pose: PuppetPose): ReadonlyArray<Pt> =>
  puppet.bones.flatMap((b, k): ReadonlyArray<Pt> => {
    if ((pose.numbers[b.name] ?? 0) === 0) return [];
    const o = k * 6;
    const [x, y] = b.pivot;
    const [px, py] = [
      m[o]! * x + m[o + 2]! * y + m[o + 4]!,
      m[o + 1]! * x + m[o + 3]! * y + m[o + 5]!,
    ];
    return [
      [
        pose.root[0] + pose.scale * (px - puppet.root[0]),
        pose.root[1] + pose.scale * (py - puppet.root[1]),
      ],
    ];
  });

type Bounds = [number, number, number, number];

const emptyBounds = (): Bounds => [Infinity, Infinity, -Infinity, -Infinity];

const grow = (b: Bounds, x: number, y: number) => {
  b[0] = Math.min(b[0], x);
  b[1] = Math.min(b[1], y);
  b[2] = Math.max(b[2], x);
  b[3] = Math.max(b[3], y);
};

const layerOf = (t: DOMMatrix, origin: Pt) => {
  const [ox, oy] = origin;
  const figure = emptyBounds();
  const canvas = emptyBounds();
  const at = (p: Pt): Pt => {
    const [sx, sy] = [p[0] - ox, p[1] - oy];
    return [t.a * sx + t.c * sy + t.e, t.b * sx + t.d * sy + t.f];
  };
  const lay = (x: number, y: number, out: Float32Array, i: number, shown: boolean) => {
    const [px, py] = at([x, y]);
    out[i] = px;
    out[i + 1] = py;
    grow(canvas, px, py);
    if (shown) grow(figure, x - ox, y - oy);
  };
  return { figure, canvas, at, lay, scale: Math.hypot(t.a, t.b) };
};

type Layer = ReturnType<typeof layerOf>;

const swappedOf = (puppet: Puppet, swaps: ReadonlyArray<PuppetSwap>) => {
  const swapped = new Map<number, PuppetSwap>();
  for (const swap of swaps) {
    const k = puppet.parts.findIndex((p) => p.name === swap.part);
    if (k < 0) return { swapped, why: `no part ${swap.part} to lay a drawing in place of` };
    if (swapped.has(k)) return { swapped, why: `two drawings laid in place of part ${swap.part}` };
    swapped.set(k, swap);
  }
  return { swapped, why: undefined };
};

const layParts = (
  loaded: LoadedPuppet,
  layer: Layer,
  m: Float64Array,
  pose: PuppetPose,
  swapped: ReadonlyMap<number, PuppetSwap>,
  hidden: ReadonlyArray<number>,
  look: boolean,
) => {
  const { puppet, gl } = loaded;
  const moving: number[] = [];
  const rest = boneTransforms(puppet.bones, {});
  const restPose: PuppetPose = { numbers: {}, root: pose.root, scale: pose.scale };
  for (const [k, part] of puppet.parts.entries()) {
    if (hidden.includes(k)) continue;
    const out = gl.positions[k]!;
    const shown = !swapped.has(k);
    poseMesh(part.mesh, m, puppet.root, pose, out);
    for (let i = 0; i < out.length; i += 2) layer.lay(out[i]!, out[i + 1]!, out, i, shown);
    if (shown && !partTurned(puppet, k, m)) continue;
    moving.push(k);
    if (!look) continue;
    const at = gl.restPositions[k]!;
    poseMesh(part.mesh, rest, puppet.root, restPose, at);
    for (let i = 0; i < at.length; i += 2) layer.lay(at[i]!, at[i + 1]!, at, i, false);
  }
  return moving;
};

const layQuad = (
  loaded: LoadedPuppet,
  layer: Layer,
  name: string,
  out: Float32Array,
  to: (x: number, y: number) => Pt,
) => {
  const d = loaded.drawings.get(name);
  if (d === undefined) return false;
  const corners: ReadonlyArray<Pt> = [
    [0, 0],
    [d.width, 0],
    [d.width, d.height],
    [0, d.height],
  ];
  for (const [i, [x, y]] of corners.entries()) {
    const p = to(x, y);
    layer.lay(p[0], p[1], out, i * 2, true);
  }
  return true;
};

const posedAt = (puppet: Puppet, pose: PuppetPose, [x, y]: Pt): Pt => [
  pose.root[0] + pose.scale * (x - puppet.root[0]),
  pose.root[1] + pose.scale * (y - puppet.root[1]),
];

type Carry = (p: Pt) => Pt;

const unmoved: Carry = (p) => p;

const skinAt = (puppet: Puppet, k: number, m: Float64Array, [x, y]: Pt): Carry => {
  const { vertices, bones, amounts } = puppet.parts[k]!.mesh;
  const n = vertices.length / 2;
  let [nearest, far] = [-1, Infinity];
  for (let i = 0; i < n; i++) {
    const d = (vertices[2 * i]! - x) ** 2 + (vertices[2 * i + 1]! - y) ** 2;
    if (d < far) [nearest, far] = [i, d];
  }
  if (nearest < 0) return unmoved;
  const stride = bones.length / n;
  if (bones[stride * nearest]! < 0) return unmoved;
  const slots = Array.from({ length: stride }, (_, j) => stride * nearest + j).filter(
    (j) => bones[j]! >= 0,
  );
  return ([px, py]) => {
    let [sx, sy] = [0, 0];
    for (const j of slots) {
      const [w, o] = [amounts[j]!, 6 * bones[j]!];
      sx += w * (m[o]! * px + m[o + 2]! * py + m[o + 4]!);
      sy += w * (m[o + 1]! * px + m[o + 3]! * py + m[o + 5]!);
    }
    return [sx, sy];
  };
};

const layDrawings = (
  loaded: LoadedPuppet,
  layer: Layer,
  m: Float64Array,
  pose: PuppetPose,
  look: PuppetLook,
  swapped: ReadonlyMap<number, PuppetSwap>,
) => {
  const { held } = look;
  const at = (p: Pt) => posedAt(loaded.puppet, pose, p);
  for (const [k, swap] of swapped) {
    const a = ((swap.theta ?? 0) * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const { place, pivot } = swap;
    const carry = swap.rides === false ? unmoved : skinAt(loaded.puppet, k, m, pivot);
    const to = (x: number, y: number): Pt => {
      const [qx, qy] = [place.s * x + place.dx - pivot[0], place.s * y + place.dy - pivot[1]];
      return at(carry([pivot[0] + c * qx - s * qy, pivot[1] + s * qx + c * qy]));
    };
    if (!layQuad(loaded, layer, swap.drawing, loaded.gl.swapPositions[k]!, to))
      return `no drawing ${swap.drawing} loaded`;
  }
  if (held === undefined) return undefined;
  const k = held.s ?? 1;
  const to = (x: number, y: number): Pt =>
    at([held.at[0] + k * (x - held.c[0]), held.at[1] + k * (y - held.c[1])]);
  return layQuad(loaded, layer, held.drawing, loaded.gl.heldPositions, to)
    ? undefined
    : `no drawing ${held.drawing} loaded`;
};

const passOf = (
  spec: PuppetSpec,
  loaded: LoadedPuppet,
  layer: Layer,
  pose: PuppetPose,
  look: PuppetLook,
  moving: ReadonlyArray<number>,
  swapped: ReadonlyMap<number, PuppetSwap>,
  joints: ReadonlyArray<Pt>,
): PuppetPass => {
  const { scale } = layer;
  const { held } = look;
  return {
    moving,
    swaps: [...swapped].map(([part, { drawing }]) => ({ part, drawing })),
    held: held && {
      drawing: held.drawing,
      at: layer.at(posedAt(loaded.puppet, pose, held.at)),
      quiet: held.quiet * scale * pose.scale,
    },
    boil: look.boil,
    amp: look.amp ?? BOIL_AMP,
    origin: layer.at(spec.origin),
    line: spec.line && { width: spec.line.width * scale, ink: spec.line.ink },
    scale,
    joints: joints.map(layer.at),
  };
};

const LOOK_MARGIN = 4;

export const drawPuppet = (
  ctx: CanvasRenderingContext2D,
  spec: PuppetSpec,
  loaded: LoadedPuppet,
  pose: PuppetPose,
  look?: PuppetLook,
  dress?: PuppetDress,
): string | undefined => {
  const { puppet } = loaded;
  const worn = dressOf(spec, puppet, dress);
  if (Result.isFailure(worn)) return `puppet ${spec.key}: ${worn.failure}`;
  const m = boneTransforms(puppet.bones, pose.numbers);
  const layer = layerOf(ctx.getTransform(), spec.origin);
  const { swapped, why: unlaid } = swappedOf(puppet, look?.swaps ?? []);
  if (unlaid !== undefined) return `puppet ${spec.key}: ${unlaid}`;
  const moving = layParts(loaded, layer, m, pose, swapped, worn.success.hidden, look !== undefined);
  const missing = look && layDrawings(loaded, layer, m, pose, look, swapped);
  if (missing !== undefined) return `puppet ${spec.key}: ${missing}`;
  const [left, top, right, bottom] = layer.figure;
  if (probesFigures(ctx) && left <= right)
    probeFigure(ctx, {
      key: spec.key,
      left,
      top,
      right,
      bottom,
      face: false,
      concept: spec.concept,
    });
  if (!loaded.paints) return undefined;
  const margin = Number(look !== undefined) * LOOK_MARGIN;
  const [minX, minY, maxX, maxY] = layer.canvas;
  const x0 = Math.max(0, Math.floor(minX) - margin);
  const y0 = Math.max(0, Math.floor(minY) - margin);
  const x1 = Math.min(ctx.canvas.width, Math.ceil(maxX) + margin);
  const y1 = Math.min(ctx.canvas.height, Math.ceil(maxY) + margin);
  if (x1 <= x0 || y1 <= y0) return undefined;
  const pass =
    look && passOf(spec, loaded, layer, pose, look, moving, swapped, turnedPivots(puppet, m, pose));
  const why = paintPuppetGl(ctx, loaded, [x0, y0, x1, y1], moving, worn.success, pass);
  return why && `puppet ${spec.key}: ${why}`;
};
