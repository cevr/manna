// A puppet drawn in our frame: a kept view cut into parts (a part sheet),
// each part a mesh of its own pixels skinned on a skeleton
// (`core/puppet.ts`), that a drawing declares (`drawing({ puppets })`) and
// poses by bone numbers each frame (`f.puppet(name, pose, look)`), drawn
// under the frame's own transform. This is the draw path: plain synchronous
// code, no Effect and no Promise. The film loads its puppets before its first
// frame (`src/puppet/load.ts`): each part's pixels and each drawing's,
// decoded once, belong to that load's scope.
//
// A frame is a function of its pose and its look: its vertices are posed
// from the bind vertices by the pose's numbers alone, a drawn key stands in
// for a part where the look lays one, and each is written whole into the
// buffers the page draws them from (`canvas/puppet-gl.ts`), which clear the
// box they draw in first. With a look, the figure's line is drawn again near
// what moved (L3) and the figure boils on the look's tick. Where nothing is
// drawn (Bun, `check --draw`) the puppet is still posed and its figure
// declared (`probeFigure`), as a rig's is.

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
import { probeFigure, probesFigures } from './probe.ts';
import { type PuppetGl, type PuppetPass, paintPuppetGl } from './puppet-gl.ts';

type Pt = readonly [number, number];

/**
 * A puppet as a drawing declares it: its key, its part sheet's size and
 * parts (front to back, each a PNG by the URL or path its module imported
 * it as), its skeleton, the sheet pixel our origin stands at, and the
 * concept it is held to (`film lab match`).
 */
export interface PuppetSpec {
  readonly key: string;
  readonly size: Pt;
  readonly parts: ReadonlyArray<{ readonly name: string; readonly png: string }>;
  readonly skeleton: Skeleton;
  readonly origin: Pt;
  readonly concept?: ConceptRef;
  /** The paper the parts were cut from: their edge pixels are un-matted from it as the puppet is made (`core/unmatte.ts`). */
  readonly paper?: readonly [number, number, number];
  /** His cloth colours, which the un-matte keeps where its line does not reach them (`core/unmatte.ts`, `keep`). */
  readonly keep?: ReadonlyArray<readonly [number, number, number]>;
  /** His thin parts by name, whose rim keeps its hue (`core/unmatte.ts`, `thin`). */
  readonly thin?: ReadonlyArray<string>;
  /** The sheet's box edges his figure leaves through (a bust's bottom): when given, paper the box cuts off on any other edge is un-matted (`core/unmatte.ts`, `open`). */
  readonly open?: ReadonlyArray<BoxEdge>;
  /** The drawings a look lays with it (drawn keys and held hands), each a PNG, loaded with its parts. */
  readonly drawings?: ReadonlyArray<{ readonly name: string; readonly png: string }>;
  /** The sheet's line: its width, sheet px, and its ink, which a look's L3 pass draws near what moved. */
  readonly line?: { readonly width: number; readonly ink: readonly [number, number, number] };
}

/** A drawing laid by a similarity, drawing px to sheet px: `s · p + (dx, dy)`. */
interface PuppetPlace {
  readonly s: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * How a frame draws a posed puppet beyond its pose: the boil's tick; a
 * drawing laid in place of a part (a drawn key: laid by `place`, then turned
 * `theta` degrees about `pivot`, sheet px); and a drawing laid over the
 * figure once its line is drawn (a held hand: its centre `c`, drawing px,
 * laid at `at`, sheet px, unturned, sized by `s`), within `quiet` px of which
 * the line is left as the drawings draw it. Both are then moved and sized
 * with the pose's root and scale, as the parts are.
 */
export interface PuppetLook {
  readonly boil: number;
  /** How far the boil moves the figure, px: the house `BOIL_AMP` unless given; 0 turns it off. */
  readonly amp?: number;
  readonly swap?: {
    readonly part: string;
    readonly drawing: string;
    readonly place: PuppetPlace;
    readonly pivot: Pt;
    readonly theta: number;
  };
  readonly held?: {
    readonly drawing: string;
    readonly c: Pt;
    readonly at: Pt;
    readonly quiet: number;
    /** Sheet px a drawing px: 1 unless given. */
    readonly s?: number;
  };
}

/** A puppet as its load leaves it: made from its parts' pixels, its drawings decoded, whether this host paints, and its GL state. */
export interface LoadedPuppet {
  readonly puppet: Puppet;
  readonly drawings: ReadonlyMap<string, Raster>;
  readonly paints: boolean;
  readonly gl: PuppetGl;
}

/** A puppet's pose: its bone numbers in degrees, where its root stands and its one scale (`core/puppet.ts`). */
export type { PuppetPose };

/** Where each bone turned from rest has its pivot at `pose`, sheet px: its parent's transform `m` carries it, its own turn holds it. */
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

/** A box `[x0, y0, x1, y1]` that grows to hold the points laid in it. */
type Bounds = [number, number, number, number];

const emptyBounds = (): Bounds => [Infinity, Infinity, -Infinity, -Infinity];

const grow = (b: Bounds, x: number, y: number) => {
  b[0] = Math.min(b[0], x);
  b[1] = Math.min(b[1], y);
  b[2] = Math.max(b[2], x);
  b[3] = Math.max(b[3], y);
};

/**
 * Where sheet points land on the canvas under the frame's transform `t`, our
 * origin at the sheet's `origin`: `lay` writes one into a buffer and grows
 * the drawn box (`canvas`), and the figure's (`figure`, from our origin)
 * when it is shown.
 */
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

/**
 * Every part posed at `pose` into its buffer, and, with a look, each part
 * that moved laid where it stood at rest too: the moving parts' indices (a
 * turned bone's, or the one a drawing stands in for), with a look or not.
 */
const layParts = (
  loaded: LoadedPuppet,
  layer: Layer,
  m: Float64Array,
  pose: PuppetPose,
  swapped: number,
  look: boolean,
) => {
  const { puppet, gl } = loaded;
  const moving: number[] = [];
  const rest = boneTransforms(puppet.bones, {});
  const restPose: PuppetPose = { numbers: {}, root: pose.root, scale: pose.scale };
  for (const [k, part] of puppet.parts.entries()) {
    const out = gl.positions[k]!;
    poseMesh(part.mesh, m, puppet.root, pose, out);
    for (let i = 0; i < out.length; i += 2) layer.lay(out[i]!, out[i + 1]!, out, i, k !== swapped);
    if (k !== swapped && !partTurned(puppet, k, m)) continue;
    moving.push(k);
    if (!look) continue;
    const at = gl.restPositions[k]!;
    poseMesh(part.mesh, rest, puppet.root, restPose, at);
    for (let i = 0; i < at.length; i += 2) layer.lay(at[i]!, at[i + 1]!, at, i, false);
  }
  return moving;
};

/** Drawing `name`'s quad laid into `out`, its corners drawing px to sheet px by `to`; false for a drawing not loaded. */
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

/** Where a sheet point stands at `pose`: moved with its root and sized by its scale, as the parts are (a look's drawings turn no bone). */
const posedAt = (puppet: Puppet, pose: PuppetPose, [x, y]: Pt): Pt => [
  pose.root[0] + pose.scale * (x - puppet.root[0]),
  pose.root[1] + pose.scale * (y - puppet.root[1]),
];

/** A look's drawings laid at `pose`'s root and scale: its drawn key by its place, turned about its pivot, and its held hand centred where it is held. Why not, for a drawing not loaded. */
const layDrawings = (loaded: LoadedPuppet, layer: Layer, pose: PuppetPose, look: PuppetLook) => {
  const { swap, held } = look;
  const at = (p: Pt) => posedAt(loaded.puppet, pose, p);
  if (swap !== undefined) {
    const a = (swap.theta * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const { place, pivot } = swap;
    const to = (x: number, y: number): Pt => {
      const [qx, qy] = [place.s * x + place.dx - pivot[0], place.s * y + place.dy - pivot[1]];
      return at([pivot[0] + c * qx - s * qy, pivot[1] + s * qx + c * qy]);
    };
    if (!layQuad(loaded, layer, swap.drawing, loaded.gl.swapPositions, to))
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

/** What `look` asks of the page's passes, in canvas px. */
const passOf = (
  spec: PuppetSpec,
  loaded: LoadedPuppet,
  layer: Layer,
  pose: PuppetPose,
  look: PuppetLook,
  moving: ReadonlyArray<number>,
  swapped: number,
  joints: ReadonlyArray<Pt>,
): PuppetPass => {
  const { scale } = layer;
  const { swap, held } = look;
  return {
    moving,
    swap: swap && { part: swapped, drawing: swap.drawing },
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

/** How far a look's box grows past its figure, px: the boil's samples and the line's outer seeds lie there. */
const LOOK_MARGIN = 4;

/**
 * Pose `loaded` (as `spec` declares it) at `pose` and draw it at our origin
 * under the context's transform, as `look` says when given, declaring its
 * figure: nothing once drawn, else why it cannot be (no WebGL 2 context, a
 * part or drawing the look names that the puppet lacks), which the film
 * throws (`f.puppet`).
 */
export const drawPuppet = (
  ctx: CanvasRenderingContext2D,
  spec: PuppetSpec,
  loaded: LoadedPuppet,
  pose: PuppetPose,
  look?: PuppetLook,
): string | undefined => {
  const { puppet } = loaded;
  const m = boneTransforms(puppet.bones, pose.numbers);
  const layer = layerOf(ctx.getTransform(), spec.origin);
  const swapped = puppet.parts.findIndex((p) => p.name === look?.swap?.part);
  if (look?.swap !== undefined && swapped < 0)
    return `puppet ${spec.key}: no part ${look.swap.part} to lay a drawing in place of`;
  const moving = layParts(loaded, layer, m, pose, swapped, look !== undefined);
  const missing = look && layDrawings(loaded, layer, pose, look);
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
  const why = paintPuppetGl(ctx, loaded, [x0, y0, x1, y1], moving, pass);
  return why && `puppet ${spec.key}: ${why}`;
};
