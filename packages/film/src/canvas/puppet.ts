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

/**
 * A puppet as a drawing declares it: its key, its part sheet's size and
 * parts (front to back, each a PNG by the URL or path its module imported
 * it as), its skeleton, the sheet pixel our origin stands at, and the
 * concept it is held to (`film lab match`).
 */
export interface PuppetSpec {
  readonly key: string;
  readonly size: Pt;
  /** Each part's PNG, and, for a part a dress may dye (`PuppetDress`), the ramp it is drawn in: its shade, base and light as drawn. */
  readonly parts: ReadonlyArray<{
    readonly name: string;
    readonly png: string;
    readonly ramp?: Ramp;
  }>;
  readonly skeleton: Skeleton;
  readonly origin: Pt;
  readonly concept?: ConceptRef;
  /** The paper the parts were cut from: their edge pixels are un-matted from it as the puppet is made (`core/unmatte.ts`). */
  readonly paper?: readonly [number, number, number];
  /** His cloth colours, which the un-matte keeps where its line does not reach them (`core/unmatte.ts`, `keep`). */
  readonly keep?: ReadonlyArray<readonly [number, number, number]>;
  /** His thin parts by name, whose rim keeps its hue (`core/unmatte.ts`, `thin`). */
  readonly thin?: ReadonlyArray<string>;
  /** His shadow parts by name, his shadow on the ground, which walls nothing in (`core/unmatte.ts`, `shadow`): the parts his cut names with `role: 'shadow'`. */
  readonly shadow?: ReadonlyArray<string>;
  /** The sheet's box edges his figure leaves through (a bust's bottom): when given, paper the box cuts off on any other edge is un-matted (`core/unmatte.ts`, `open`). */
  readonly open?: ReadonlyArray<BoxEdge>;
  /** His paper's grain, luma: a rim pixel darker than the paper by more than it is kept whole (`core/unmatte.ts`, `grain`). */
  readonly grain?: number;
  /**
   * By a front part's name, how many px each part behind it of another skin
   * reaches under its cut edge, filled with that part's paint (`core/puppet.ts`,
   * `underlapped`): a head cut from his torso along one line shows cloth, not
   * the ground, at the cut as it turns. Name only a part that turns a little
   * over the part behind (a head, a veil); an arm named would leave a ghost of
   * itself on the torso as it moves. The part behind holds the named part's
   * own bottom rows, so a key drawn in its place (`swaps`) must meet them at
   * the cut, as the part does, or a sliver of the part shows under it. A
   * name the sheet lacks, or a length that is not a whole number of 0 or
   * more, refuses the puppet.
   */
  readonly underlap?: Readonly<Record<string, number>>;
  /**
   * The drawings a look lays with it (drawn keys and held hands), each a PNG,
   * loaded with its parts; a key drawn on the sheet's own canvas in place of
   * a part names it (`part`), and its edge is un-matted from the paper as
   * that part's is.
   */
  readonly drawings?: ReadonlyArray<{
    readonly name: string;
    readonly png: string;
    readonly part?: string;
  }>;
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
 * A drawn key laid in place of part `part`: drawing `drawing` laid by
 * `place` at rest, turned `theta` degrees further about `pivot`, then carried
 * as the part's skin carries its pixel at `pivot` (`skinAt`), sheet px, so a
 * head key turns with the head bones it stands on.
 */
interface PuppetSwap {
  readonly part: string;
  readonly drawing: string;
  readonly place: PuppetPlace;
  readonly pivot: Pt;
  /** Degrees it turns about `pivot` past its part's own turn: 0 unless given. */
  readonly theta?: number;
  /** Whether its part's bones carry it: true unless given. False lays it where `place` and `theta` put it, a place already in the pose's frame. */
  readonly rides?: boolean;
}

/**
 * How a frame draws a posed puppet beyond its pose: the boil's tick; the
 * drawings laid in place of parts (drawn keys, `PuppetSwap`), each in place
 * of its own part and carried by its bones, so a head key and an arm key show
 * at once; and a drawing laid over the figure once its line is drawn (a held
 * hand: its centre `c`, drawing px, laid at `at`, sheet px, turned by no
 * bone, sized by `s`), within `quiet` px of which the line is left as the
 * drawings draw it. Each is then moved and sized with the pose's root and
 * scale, as the parts are.
 */
export interface PuppetLook {
  readonly boil: number;
  /** How far the boil moves the figure, px: the house `BOIL_AMP` unless given; 0 turns it off. */
  readonly amp?: number;
  /** The drawn keys, at most one a part: none unless given. */
  readonly swaps?: ReadonlyArray<PuppetSwap>;
  readonly held?: {
    readonly drawing: string;
    readonly c: Pt;
    readonly at: Pt;
    readonly quiet: number;
    /** Sheet px a drawing px: 1 unless given. */
    readonly s?: number;
  };
}

/**
 * What a draw wears, by part name: the parts it leaves undrawn (`hide`: a
 * bare head, no beard, no mantle), and the parts it dyes, each to a cloth's
 * ramp (`dye`: the look's `shaded()` of the cloth), from the ramp its sheet
 * says it is drawn in (`PuppetSpec.parts`, `ramp`), keeping its line, ink and
 * alpha (`canvas/dye.ts`). A part a dress hides shows each part behind it as
 * when it moves away: what its rim hid there, and no seal along their line;
 * a part named in the sheet's `underlap` shows the paint reached under it.
 * A drawn key that stands in for a dyed part (a look's swap) takes that
 * part's dye, so a key of a part a dress may dye is drawn in the part's
 * ramp: paint outside it (skin, say) is carried onto the cloth's ramp too.
 * An empty dress draws as no dress. A name the puppet lacks, a dye of a part
 * that declares no ramp, or a ramp the dye cannot map, refuses the draw.
 */
export interface PuppetDress {
  readonly hide?: ReadonlyArray<string>;
  readonly dye?: Readonly<Record<string, Ramp>>;
}

/** What `dress` asks of the passes for `spec`'s puppet, by part index, or why it cannot be worn. */
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

/** The parts a look's keys stand in for, by index, each with its key, and why they cannot be laid if so: a part the puppet lacks, or one named twice. */
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

/**
 * Every part the dress shows posed at `pose` into its buffer, and, with a
 * look, each part that moved laid where it stood at rest too: the moving
 * parts' indices (a turned bone's, or one a drawing stands in for), with a
 * look or not. A hidden part is neither laid nor counted as moving, and
 * grows neither box.
 */
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

/** Where a sheet point stands at `pose`: moved with its root and sized by its scale, as the parts are (after any bones carry it: a drawn key's, `skinAt`). */
const posedAt = (puppet: Puppet, pose: PuppetPose, [x, y]: Pt): Pt => [
  pose.root[0] + pose.scale * (x - puppet.root[0]),
  pose.root[1] + pose.scale * (y - puppet.root[1]),
];

/** How bones carry a rest sheet point to where they turn it, sheet px. */
type Carry = (p: Pt) => Pt;

const unmoved: Carry = (p) => p;

/**
 * How part `k`'s skin carries its pixel at sheet point `p` under the bones'
 * transforms `m` (`boneTransforms`): the weights of its mesh's vertex nearest
 * `p`, blended over the same slots as `poseMesh` blends that vertex's, so a
 * point at that vertex lands where the vertex does. Unmoved where the part
 * has no vertex, or that one lies on no bone.
 */
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

/** A look's drawings laid at `pose`: each drawn key by its place, turned `theta` about its pivot and carried by its part's bones there (`skinAt`, under `m`) into its part's quad, and its held hand centred where it is held, each moved with the root and sized by the scale. Why not, for a drawing not loaded. */
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

/** What `look` asks of the page's passes, in canvas px. */
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

/** How far a look's box grows past its figure, px: the boil's samples and the line's outer seeds lie there. */
const LOOK_MARGIN = 4;

/**
 * Pose `loaded` (as `spec` declares it) at `pose` and draw it at our origin
 * under the context's transform, as `look` says when given, wearing `dress`
 * when given (on the plain pass, or the look's), declaring its figure:
 * nothing once drawn, else why it cannot be (no WebGL 2 context, a part or
 * drawing the look names that the puppet lacks, a dress it cannot wear,
 * `dressOf`), which the film throws (`f.puppet`).
 */
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
