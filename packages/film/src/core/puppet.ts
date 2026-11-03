// A puppet: a part sheet (`core/part-sheet.ts`) on a skeleton, each part a
// mesh of its own pixels skinned on the bones its skin names, posed by bone
// numbers (`puppetOf`, `rasterOf`). It is the CPU reference
// the page's draw (`canvas/puppet.ts`) is held to, and what a fitter searches
// with in Bun. Pure.
//
// - **Skeleton.** Each bone turns about its pivot, after its parent: its
//   number (degrees, positive from +x toward +y, as a canvas turns) is
//   relative to its parent. A bone a pose does not name stays at 0, so the
//   rest pose is the bind pose. The shared control names are the bones'
//   names: `lean`, `neck`, `head`, and `shoulder`, `elbow`, `wrist` by side
//   (`shoulderRight`, `shoulderLeft`), named from the character's own side.
// - **Mesh.** A part's mesh is a 3 px grid (`MESH_STEP`) over the cells that
//   hold any pixel of it, two triangles a cell; a vertex is a grid point.
// - **Weights.** A vertex lies only on bones its part's skin names. Each
//   joint of the skin has a k: a smoothstep of how much nearer the child's
//   segments (its own and its descendants' on the skin) the vertex lies
//   than the parent's: 0 at `blend` px nearer the parent (narrowed by how
//   tightly the joint is folded at rest, `spread`), 1 at `blend` px nearer
//   the child. The weights compose the k from the skin's root down (on an
//   arm: upper 1 - k1, forearm k1 (1 - k2), hand k1 k2), so they are
//   continuous everywhere, also where two joints' blends overlap on a short
//   bone, and are the nearest bone's alone outside every blend. A part
//   whose skin names no bone moves with the root alone.
//   Continuous weights still shear where a limb folds its far end back
//   beside its near one: weights that hold the near paint and turn the far
//   cross 0 to 1 over the joint's ramp, blend × (1 + spread), so a turn t
//   stretches an edge there by about 2 sin(t/2) of its length times its
//   distance from the joint over the ramp. Sower's poses-3 right hand lies
//   beside his upper arm 75 px from the elbow, over a 28.4 px ramp: a 60°
//   elbow turn stretches an edge there by 21 px. A wider blend lowers it
//   only by carrying the upper arm's own paint with the forearm, on every
//   view, so that shear is a named gap: closing it needs a drawn key, or the
//   hand cut as its own part.
// - **Shoulder flap.** A flap gives an arm the body's pixels round its cap
//   (`PuppetFlap.region`): they join the arm's texture. Each vertex of the
//   arm lies on its arm weights, of which the flap's bone (the shoulder)
//   gives the body's bone a share w of its own amount: w is 0 at the cap and
//   1 at `reach` px (34) from the shoulder's pivot, above the pivot along the
//   arm. Every other arm bone keeps its amount, so a hand that rests by the
//   shoulder turns whole with its forearm, and each weight stays continuous
//   (a product of continuous terms). At rest those pixels are the body's
//   own, where no part in front shows paint, so the rest pose shows the
//   sheet.
// - **Skinning.** Linear blend: a vertex is its bones' world transforms of
//   it, by its weights; then the root moves it (`root` less the rest root)
//   and the pose's one scale sizes it about the root.
// - **Raster.** `rasterOf` lays the parts back to front over transparent
//   ground, each pixel inverse-mapped through the posed triangle that holds
//   its centre to the part's texture, sampled bilinear on premultiplied
//   texels, every triangle laid in turn under a top-left fill rule, as the
//   GL path draws them (`canvas/puppet-gl.ts`). At rest every pixel maps to its own
//   texel's centre, so the raster is the sheet's recompose byte for byte.
// - **Paper.** A sheet that names the paper its parts were cut from has its
//   edge pixels un-matted from it once, here (`core/unmatte.ts`): the rest
//   raster laid over that paper is then the sheet's recompose within 1 a
//   channel, and on another paper the figure carries no ring of the sheet's.

import { Option, Result, Schema } from 'effect';
import { IDENTITY } from './affine.ts';
import type { Rgb } from './cast-sheet-pixels.ts';
import {
  LimbRefused,
  type PuppetLimb,
  type PuppetPartLimb,
  limbBlend,
  limbOf,
  limbShares,
} from './limb.ts';
import { limbStroke } from './limb-stroke.ts';
import type { Raster } from './raster.ts';
import { type BoxEdge, unmatte } from './unmatte.ts';

type Pt = readonly [number, number];

/** The grid a part's mesh is laid on, px. */
const MESH_STEP = 3;

/** How much nearer one bone than the other a vertex at a joint may lie and still be shared by both, px (at most half the shorter bone). */
const BLEND = 18;

/** How many weights a mesh holds a vertex: a chain of four bones (a body bone, shoulder, elbow, wrist) may share one vertex at once. A vertex with more keeps its heaviest, scaled to total 1. */
const WEIGHTS = 4;

/** How far from a shoulder's pivot a flap's vertex lies wholly on the body, px. */
const FLAP_REACH = 34;

/** A bone: its name, its parent's, the joint it turns about and the end it points to, sheet px. */
interface PuppetBone {
  readonly name: string;
  readonly parent?: string;
  readonly pivot: Pt;
  readonly tip: Pt;
}

/**
 * A shoulder flap: `part` (an arm) takes the pixels of `from` (the body's
 * part) inside `region` (a polygon about the shoulder) into its texture;
 * its vertices there lie on `body` (a bone its skin names) by how far they
 * lie from `bone`'s pivot, 0 within `cap` px, 1 at `reach` px, above the
 * pivot along `bone`.
 */
interface PuppetFlap {
  readonly part: string;
  readonly from: string;
  readonly bone: string;
  readonly body: string;
  readonly cap: number;
  readonly reach?: number;
  readonly region: ReadonlyArray<Pt>;
}

/** A skeleton: its bones (each parent before its children), each part's skin (the bones it lies on), its flaps, its stroke limbs (`core/limb.ts`), and the root (rest: the first bone's pivot). */
export interface Skeleton {
  readonly bones: ReadonlyArray<PuppetBone>;
  readonly skin: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly flaps?: ReadonlyArray<PuppetFlap>;
  readonly limbs?: ReadonlyArray<PuppetLimb>;
  readonly root?: Pt;
}

/** A pose: each bone's number in degrees (one left out is 0), where the root stands, and the one scale about it. */
export interface PuppetPose {
  readonly numbers: Readonly<Record<string, number>>;
  readonly root: Pt;
  readonly scale: number;
}

/** A part's mesh: its vertices (flat x, y, sheet px), its triangles (flat, three vertex indices each), and each vertex's weights as bone indices and amounts (`WEIGHTS` a vertex, -1 none). */
interface PuppetMesh {
  readonly vertices: Float64Array;
  readonly triangles: Uint32Array;
  readonly bones: Int16Array;
  readonly amounts: Float64Array;
}

/** A part of a puppet: its name, its pixels (its texture), what each part in front of it hides, its mesh, and its stroke limb, if it has one. */
interface PuppetPart {
  readonly name: string;
  readonly pixels: Raster;
  /** By each part in front of it: the paint the un-matte cleared behind that part's rim (hidden at rest), shown once either of the two parts moves; none where nothing was cleared. */
  readonly revealed: ReadonlyArray<Raster | undefined>;
  /** By each part in front of it of another skin: the seal laid over this part along the line it shares with that part, shown while neither moves (`sealsShown`); none where it seals nothing. */
  readonly seals: ReadonlyArray<Raster | undefined>;
  readonly mesh: PuppetMesh;
  /** Its stroke limb as `limbOf` measured it from its texture, where the skeleton declares one. */
  readonly limb?: PuppetPartLimb;
}

/** A puppet: the sheet's size, its parts front to back, its bones and its rest root. */
export interface Puppet {
  readonly width: number;
  readonly height: number;
  readonly parts: ReadonlyArray<PuppetPart>;
  readonly bones: ReadonlyArray<PuppetBone>;
  readonly root: Pt;
}

/** What a puppet is made from: a part sheet's size and parts, front to back, and the paper they were cut from, if their edges are to be un-matted from it (`core/unmatte.ts`). */
export interface PuppetSheet {
  readonly width: number;
  readonly height: number;
  readonly parts: ReadonlyArray<{ readonly name: string; readonly pixels: Raster }>;
  readonly paper?: Rgb;
  /** His cloth colours, which the un-matte keeps where its line does not reach them (`UnmatteOptions.keep`). */
  readonly keep?: ReadonlyArray<Rgb>;
  /** His thin parts by name, whose rim keeps its hue (`UnmatteOptions.thin`). */
  readonly thin?: ReadonlyArray<string>;
  /** His shadow parts by name, which wall nothing in (`UnmatteOptions.shadow`). */
  readonly shadow?: ReadonlyArray<string>;
  /** The sheet's box edges his figure leaves through: when given, paper the box cuts off on any other edge is un-matted (`UnmatteOptions.open`). */
  readonly open?: ReadonlyArray<BoxEdge>;
  /** His paper's grain, luma: a rim pixel darker than the paper by more than it is kept whole (`UnmatteOptions.grain`). */
  readonly grain?: number;
  /** By a front part's name, how many px each part behind it of another skin reaches under its cut edge (`underlapped`); a part not named gives none. */
  readonly underlap?: Readonly<Record<string, number>>;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The distance from `p` to the segment `a`–`b`. */
const segmentDistance = (p: Pt, a: Pt, b: Pt) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/** `p` along bone `b`'s axis from `from` (its pivot unless given), px. */
const along = (p: Pt, b: PuppetBone, from: Pt = b.pivot) => {
  const [dx, dy] = [b.tip[0] - b.pivot[0], b.tip[1] - b.pivot[1]];
  const len = Math.hypot(dx, dy) || 1;
  return ((p[0] - from[0]) * dx + (p[1] - from[1]) * dy) / len;
};

const boneLength = (b: PuppetBone) => Math.hypot(b.tip[0] - b.pivot[0], b.tip[1] - b.pivot[1]);

/** Whether a pixel centre `(x, y)` lies inside `poly` (even-odd). */
const inside = (poly: ReadonlyArray<Pt>, x: number, y: number) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/**
 * The weights of a vertex at `p` on `skin` (bone indices into `bones`), totalling 1: the
 * joints of the skin's tree that holds the nearest bone, composed from its root down. A
 * bone keeps the share that reaches it less what its child joints pass on, each child's k
 * of it (scaled down where they total over 1), so on a chain each weight is a product of
 * its joints' k (upper 1 - k1, forearm k1 (1 - k2), hand k1 k2). Each k is continuous in
 * `p`, so the weights are too, where two joints' blends overlap on one bone as anywhere.
 */
const weightsAt = (
  p: Pt,
  skin: ReadonlyArray<number>,
  bones: ReadonlyArray<PuppetBone>,
): Array<[number, number]> => {
  if (skin.length === 0) return [];
  if (skin.length === 1) return [[skin[0]!, 1]];
  const parentOf = (k: number) => skin.find((j) => bones[j]!.name === bones[k]!.parent);
  const childrenOf = (k: number) => skin.filter((j) => bones[j]!.parent === bones[k]!.name);
  const distance = (k: number) => segmentDistance(p, bones[k]!.pivot, bones[k]!.tip);
  // the distance to the nearest segment of `k` and its descendants on the skin
  const reach = (k: number): number => Math.min(distance(k), ...childrenOf(k).map(reach));
  let root = nearestBone(p, skin, bones);
  for (let up = parentOf(root); up !== undefined; up = parentOf(root)) root = up;
  const weights: Array<[number, number]> = [];
  const pass = (k: number, share: number) => {
    const ks = childrenOf(k).map((c): [number, number] => {
      const [parent, child] = [bones[k]!, bones[c]!];
      const r = blendOf(parent, child);
      return [c, smooth(-r * spread(parent, child), r, distance(k) - reach(c))];
    });
    const total = ks.reduce((s, [, x]) => s + x, 0);
    const scale = total > 1 ? 1 / total : 1;
    if (total * scale < 1) weights.push([k, share * (1 - total * scale)]);
    for (const [c, x] of ks) if (x > 0) pass(c, share * x * scale);
  };
  pass(root, 1);
  return weights;
};

/** The bone of `skin` whose segment lies nearest `p`. */
const nearestBone = (p: Pt, skin: ReadonlyArray<number>, bones: ReadonlyArray<PuppetBone>) => {
  let near = skin[0]!;
  let best = Infinity;
  for (const k of skin) {
    const d = segmentDistance(p, bones[k]!.pivot, bones[k]!.tip);
    if (d < best) [best, near] = [d, k];
  }
  return near;
};

/** The blend of the joint of `parent` and `child`: `BLEND`, at most half the shorter bone. */
const blendOf = (parent: PuppetBone, child: PuppetBone) =>
  Math.min(BLEND, 0.5 * Math.min(boneLength(parent), boneLength(child)));

/**
 * How much of the blend a joint keeps on its parent's side: (1 - cos α) / 2 of the
 * angle α its bones make at rest (1 straight, 1/2 at a right angle, about 0.15 folded
 * to 45°), at least 0.05. In a fold the parent's paint lies beside the child's, so a
 * wide blend there would carry the parent's own paint with the child.
 */
const spread = (parent: PuppetBone, child: PuppetBone) => {
  const e = child.pivot;
  const [ax, ay] = [parent.pivot[0] - e[0], parent.pivot[1] - e[1]];
  const [bx, by] = [child.tip[0] - e[0], child.tip[1] - e[1]];
  const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return Math.max(0.05, (1 - cos) / 2);
};

/**
 * The weights of a flap's vertex at `p`: its arm weights, the flap's bone (`flapBone`, an
 * index into `bones`) giving the body `w` of its own amount, `w` the flap's share by how far
 * `p` lies from that bone's pivot. Every other arm bone keeps its amount, so a hand that
 * rests by the shoulder turns with its forearm, and each weight is continuous in `p`.
 */
const flapped = (
  p: Pt,
  arm: Array<[number, number]>,
  flap: PuppetFlap,
  bones: ReadonlyArray<PuppetBone>,
  flapBone: number,
  body: number,
): Array<[number, number]> => {
  const bone = bones[flapBone]!;
  const d = Math.hypot(p[0] - bone.pivot[0], p[1] - bone.pivot[1]);
  const w = smooth(2, -6, along(p, bone)) * smooth(flap.cap - 1, flap.reach ?? FLAP_REACH, d);
  if (w <= 0) return arm;
  const own = arm.find(([k]) => k === flapBone)?.[1] ?? 0;
  if (own === 0) return arm;
  const kept = arm.flatMap(([k, a]): Array<[number, number]> =>
    k !== flapBone ? [[k, a]] : w < 1 ? [[k, a * (1 - w)]] : [],
  );
  return [...kept, [body, own * w]];
};

/** A part's mesh over `alpha`'s cells, weighted on `skin`. */
const meshOf = (
  width: number,
  height: number,
  alpha: (x: number, y: number) => boolean,
  weigh: (p: Pt) => Array<[number, number]>,
): PuppetMesh => {
  const cols = Math.ceil(width / MESH_STEP);
  const rows = Math.ceil(height / MESH_STEP);
  const index = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  const xs: number[] = [];
  const tris: number[] = [];
  const vertex = (c: number, r: number) => {
    const k = r * (cols + 1) + c;
    if (index[k] === -1) {
      index[k] = xs.length / 2;
      xs.push(c * MESH_STEP, r * MESH_STEP);
    }
    return index[k]!;
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let any = false;
      for (let y = r * MESH_STEP; y < Math.min(height, (r + 1) * MESH_STEP) && !any; y++)
        for (let x = c * MESH_STEP; x < Math.min(width, (c + 1) * MESH_STEP) && !any; x++)
          any = alpha(x, y);
      if (!any) continue;
      const [a, b, d, e] = [vertex(c, r), vertex(c + 1, r), vertex(c + 1, r + 1), vertex(c, r + 1)];
      tris.push(a, b, d, a, d, e);
    }
  const n = xs.length / 2;
  const boneOf = new Int16Array(n * WEIGHTS).fill(-1);
  const amounts = new Float64Array(n * WEIGHTS);
  for (let i = 0; i < n; i++) {
    const all = weigh([xs[2 * i]!, xs[2 * i + 1]!]);
    const w = all.length > WEIGHTS ? all.toSorted((a, b) => b[1] - a[1]).slice(0, WEIGHTS) : all;
    const total = w.reduce((s, [, amount]) => s + amount, 0);
    w.forEach(([k, amount], j) => {
      boneOf[WEIGHTS * i + j] = k;
      amounts[WEIGHTS * i + j] = w === all ? amount : amount / total;
    });
  }
  return {
    vertices: Float64Array.from(xs),
    triangles: Uint32Array.from(tris),
    bones: boneOf,
    amounts,
  };
};

/**
 * Why a skeleton cannot skin a sheet: a bone named twice or before its
 * parent, a skin, flap or stroke limb naming what is not there, a flap on an
 * arm too long for a vertex's weights, a stroke limb that does not fit, or
 * stroke limbs their parts' pixels cannot measure. In that last case `limbs`
 * holds every refused limb, typed, and `reason` their messages.
 */
class PuppetRefused extends Schema.TaggedError<PuppetRefused>()('PuppetRefused', {
  reason: Schema.String,
  limbs: Schema.optionalKey(Schema.Array(LimbRefused)),
}) {
  override get message() {
    return `the skeleton cannot skin the sheet: ${this.reason}`;
  }
}

/** Why `skeleton` cannot skin `sheet`, if it cannot: a bone named twice or before its parent, a skin or flap naming a part or bone that is not there, two flaps on one part, a flap resting on a bone its arm's skin does not name, a flap on an arm of more bones than a vertex holds beside the body, or a stroke limb that does not fit (`limbRefusal`). */
const refusal = (sheet: PuppetSheet, skeleton: Skeleton): string | undefined => {
  const seen = new Set<string>();
  for (const b of skeleton.bones) {
    if (seen.has(b.name)) return `bone ${b.name} is named twice`;
    if (b.parent !== undefined && !seen.has(b.parent))
      return `bone ${b.name}'s parent ${b.parent} is not a bone before it`;
    seen.add(b.name);
  }
  const names = new Set(sheet.parts.map((p) => p.name));
  for (const [part, skin] of Object.entries(skeleton.skin)) {
    if (!names.has(part)) return `the skin names no part ${part} of the sheet`;
    const missing = skin.find((b) => !seen.has(b));
    if (missing !== undefined) return `${part}'s skin names no bone ${missing}`;
  }
  for (const [part, n] of Object.entries(sheet.underlap ?? {})) {
    if (!names.has(part)) return `the underlap names no part ${part} of the sheet`;
    if (!Number.isInteger(n) || n < 0)
      return `${part}'s underlap is ${n} px, not a whole number of 0 or more`;
  }
  return flapRefusal(skeleton, names, seen) ?? limbRefusal(skeleton, names);
};

/**
 * Why `skeleton`'s stroke limbs cannot skin a sheet of the parts `names`, if
 * they cannot: a limb naming a part or bone that is not there, two limbs on
 * one part, bones that are not a parent chain (shoulder, its child the elbow,
 * its child the wrist), a chain bone the part's skin does not name, or a fade
 * or fold whose ends do not increase. A flap on a limb's part is allowed:
 * `limbsOf` masks the body texels it adds out of the sleeve and into the
 * stub, and `limbOf` refuses the limb (`flap-reach`) when one lies on the
 * forearm or past `FLAP_REACH` of the upper arm.
 */
const limbRefusal = (skeleton: Skeleton, names: ReadonlySet<string>): string | undefined => {
  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  const limbed = new Set<string>();
  for (const l of skeleton.limbs ?? []) {
    if (!names.has(l.part)) return `a limb names no part ${l.part} of the sheet`;
    if (limbed.has(l.part)) return `two limbs name part ${l.part}`;
    limbed.add(l.part);
    const missing = l.bones.find((b) => !byName.has(b));
    if (missing !== undefined) return `${l.part}'s limb names no bone ${missing}`;
    const [shoulder, elbow, wrist] = l.bones;
    if (byName.get(elbow)!.parent !== shoulder || byName.get(wrist)!.parent !== elbow)
      return `${l.part}'s limb bones ${l.bones.join(', ')} are not a parent chain`;
    const skin = skeleton.skin[l.part] ?? [];
    const off = l.bones.find((b) => !skin.includes(b));
    if (off !== undefined) return `${l.part}'s limb lies on ${off}, which its skin does not name`;
    for (const [what, r] of [
      ['fade', l.fade],
      ['fold', l.fold],
    ] as const)
      if (r !== undefined && !(Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] < r[1]))
        return `${l.part}'s limb's ${what} ${r[0]}–${r[1]} does not increase`;
  }
  return undefined;
};

/** Why `skeleton`'s flaps cannot skin a sheet of the parts `names` with the bones `seen`, if they cannot. */
const flapRefusal = (
  skeleton: Skeleton,
  names: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): string | undefined => {
  const hasFlap = new Set<string>();
  for (const f of skeleton.flaps ?? []) {
    if (!names.has(f.part) || !names.has(f.from))
      return `a flap names no part ${f.part} or ${f.from} of the sheet`;
    if (hasFlap.has(f.part)) return `two flaps name part ${f.part}`;
    hasFlap.add(f.part);
    if (!seen.has(f.bone)) return `${f.part}'s flap names no bone ${f.bone}`;
    const skin = skeleton.skin[f.part] ?? [];
    if (!skin.includes(f.body))
      return `${f.part}'s flap rests on ${f.body}, which its skin does not name`;
    // a flap vertex holds its arm weights and the body's: past `WEIGHTS` the mesh's cut drops the body's small share near the flap's edge, a step
    const arm = skin.filter((b) => b !== f.body).length;
    if (arm > WEIGHTS - 1)
      return `${f.part}'s flap is on an arm of ${arm} bones, more than the ${WEIGHTS - 1} a vertex holds beside ${f.body}`;
  }
  return undefined;
};

/** Each part's pixels, with its flap's body pixels where it has one (at most one flap a part, `refusal`). */
const flappedParts = (sheet: PuppetSheet, skeleton: Skeleton): ReadonlyArray<Uint8Array> => {
  const flapOf = new Map((skeleton.flaps ?? []).map((f) => [f.part, f]));
  return sheet.parts.map((part) => {
    const flap = flapOf.get(part.name);
    const from = sheet.parts.find((p) => p.name === flap?.from);
    return flap === undefined || from === undefined
      ? part.pixels.rgba
      : withFlap(part.pixels, from.pixels, flap.region);
  });
};

/**
 * Each declared limb measured from its part's texture on its rest joints, by
 * part (at most one a part, `refusal`); else every limb refused. The body
 * pixels a flap took into the part are marked for `limbOf`, which keeps them
 * out of the sleeve's widths and wholly in the stub: the lead's right
 * shoulder band reaches 20.4 px down his upper arm, past the shoulder's line,
 * and the stroke must never redraw it with the arm. A body texel past
 * `FLAP_REACH` of the upper arm, or on the forearm, refuses the limb.
 */
const limbsOf = (
  sheet: PuppetSheet,
  skeleton: Skeleton,
  textures: ReadonlyArray<Uint8Array>,
  withFlaps: ReadonlyArray<Uint8Array>,
): Result.Result<ReadonlyMap<string, PuppetPartLimb>, ReadonlyArray<LimbRefused>> => {
  const { width: W, height: H } = sheet;
  const pivotOf = new Map(skeleton.bones.map((b) => [b.name, b.pivot]));
  const limbs = new Map<string, PuppetPartLimb>();
  const refused: Array<LimbRefused> = [];
  for (const l of skeleton.limbs ?? []) {
    const k = sheet.parts.findIndex((p) => p.name === l.part);
    const [shoulder, elbow, wrist] = l.bones.map((b) => pivotOf.get(b)!);
    const measured = limbOf(
      l.part,
      { width: W, height: H, rgba: textures[k]! },
      { shoulder: shoulder!, elbow: elbow!, wrist: wrist! },
      l,
      flapBody(sheet.parts[k]!.pixels.rgba, withFlaps[k]!),
    );
    if (Result.isFailure(measured)) refused.push(measured.failure);
    else limbs.set(l.part, measured.success);
  }
  return refused.length > 0 ? Result.fail(refused) : Result.succeed(limbs);
};

/** The texels `flapped` holds that `own` does not (a byte a texel, 1 for each): its flap's body pixels; none when the part has no flap. */
const flapBody = (own: Uint8Array, flapped: Uint8Array): Option.Option<Uint8Array> => {
  if (flapped === own) return Option.none();
  const body = new Uint8Array(own.length / 4);
  for (let i = 0; i < body.length; i++)
    body[i] = Number(own[i * 4 + 3] === 0 && flapped[i * 4 + 3]! > 0);
  return Option.some(body);
};

/** How a sheet's parts are un-matted from its paper (`UnmatteOptions`), its named parts by index. */
const unmatteOptions = (sheet: PuppetSheet) => ({
  keep: sheet.keep,
  thin: sheet.parts.flatMap((p, k) => (sheet.thin?.includes(p.name) === true ? [k] : [])),
  shadow: sheet.parts.flatMap((p, k) => (sheet.shadow?.includes(p.name) === true ? [k] : [])),
  open: sheet.open,
  grain: sheet.grain,
});

/**
 * A key drawn on the sheet's own canvas in place of part `part` (a head
 * with its eyes shut), its edge un-matted from the sheet's paper as that
 * part's is, with the key in the part's place among the others; its pixels
 * as given when the sheet has no paper. Refused, naming why, when the sheet
 * has no part of that name or the key is another size than the sheet: such
 * a key would keep its paper rim and pop on the frames it shows.
 */
export const unmattedKey = (
  sheet: PuppetSheet,
  skeleton: Skeleton,
  part: string,
  key: Raster,
): Result.Result<Uint8Array, PuppetRefused> => {
  const k = sheet.parts.findIndex((p) => p.name === part);
  if (k < 0) return Result.fail(PuppetRefused.make({ reason: `the sheet has no part ${part}` }));
  if (key.width !== sheet.width || key.height !== sheet.height)
    return Result.fail(
      PuppetRefused.make({
        reason: `the key is ${key.width}x${key.height}, the sheet ${sheet.width}x${sheet.height}`,
      }),
    );
  const { paper } = sheet;
  if (paper === undefined) return Result.succeed(key.rgba);
  const parts = flappedParts(sheet, skeleton).map((p, n) => (n === k ? key.rgba : p));
  return Result.succeed(
    unmatte(parts, sheet.width, sheet.height, paper, unmatteOptions(sheet))[k]!,
  );
};

/**
 * The puppet of `sheet` on `skeleton`: each part's mesh, weighted on its
 * skin, its texture its pixels (with its flap's body pixels, where it has
 * one), and each stroke limb it declares measured from its part's texture
 * (`limbOf`); refused for a skeleton that does not fit the sheet, or a limb
 * whose part cannot be measured (the refusal's reason is `LimbRefused`'s).
 */
export const puppetOf = (
  sheet: PuppetSheet,
  skeleton: Skeleton,
): Result.Result<Puppet, PuppetRefused> => {
  const why = refusal(sheet, skeleton);
  if (why !== undefined) return Result.fail(PuppetRefused.make({ reason: why }));
  const { bones } = skeleton;
  const at = new Map(bones.map((b, k) => [b.name, k]));
  const { width: W, height: H } = sheet;
  // at most one flap a part (`refusal`)
  const flapOf = new Map((skeleton.flaps ?? []).map((f) => [f.part, f]));
  const withFlaps = flappedParts(sheet, skeleton);
  const { paper } = sheet;
  const options = unmatteOptions(sheet);
  const unmatted = paper === undefined ? withFlaps : unmatte(withFlaps, W, H, paper, options);
  const skins = sheet.parts.map((p) => [...(skeleton.skin[p.name] ?? [])].sort().join(' '));
  const textures = underlapped(sealed(unmatted, skins, W, H), unmatted, sheet, skins);
  // the parts un-matted with part j gone: what each part behind j shows once j moves away
  const without = new Map<number, ReadonlyArray<Uint8Array>>();
  const unmattedWithout = (j: number) => {
    const known = without.get(j);
    if (known !== undefined) return known;
    const gone = withFlaps.map((p, n) => (n === j ? new Uint8Array(p.length) : p));
    const made = paper === undefined ? gone : unmatte(gone, W, H, paper, options);
    without.set(j, made);
    return made;
  };
  const measured = limbsOf(sheet, skeleton, textures, withFlaps);
  if (Result.isFailure(measured)) {
    const refused = measured.failure;
    return Result.fail(
      PuppetRefused.make({ reason: refused.map((r) => r.message).join('; '), limbs: refused }),
    );
  }
  const limbs = measured.success;
  const parts = sheet.parts.map((part, k): PuppetPart => {
    const skin = (skeleton.skin[part.name] ?? []).map((b) => at.get(b)!);
    const flap = flapOf.get(part.name);
    const rgba = textures[k]!;
    const revealed = revealedOf(withFlaps, textures, k, unmattedWithout, W, H);
    const seals = sealsOf(unmatted, textures, skins, k, W, H);
    // its mesh holds what it shows at rest, all it can reveal and its seals
    const holds = (layers: ReadonlyArray<Uint8Array | undefined>, i: number) =>
      layers.some((r) => r !== undefined && r[i * 4 + 3]! > 0);
    const covers = (i: number) => rgba[i * 4 + 3]! > 0 || holds(revealed, i) || holds(seals, i);
    const weigh =
      flap === undefined
        ? (p: Pt) => weightsAt(p, skin, bones)
        : (p: Pt) =>
            flapped(
              p,
              weightsAt(
                p,
                skin.filter((k) => k !== at.get(flap.body)),
                bones,
              ),
              flap,
              bones,
              at.get(flap.bone)!,
              at.get(flap.body)!,
            );
    const made: PuppetPart = {
      name: part.name,
      pixels: { width: W, height: H, rgba },
      revealed: revealed.map((r) => r && { width: W, height: H, rgba: r }),
      seals: seals.map((s) => s && { width: W, height: H, rgba: s }),
      mesh: meshOf(W, H, (x, y) => covers(y * W + x), weigh),
    };
    const limb = limbs.get(part.name);
    return limb === undefined ? made : { ...made, limb };
  });
  return Result.succeed({
    width: W,
    height: H,
    parts,
    bones,
    root: skeleton.root ?? bones[0]?.pivot ?? [0, 0],
  });
};

/**
 * The paint the un-matte cleared from part `k` behind each part in front of
 * it, given back as `k` shows with that part gone: for each front part `j`,
 * at `k`'s pixels where `j` is the frontmost holder, `k`'s pixel was
 * cleared, and it had one, `k`'s pixel un-matted with `j` gone (`without`),
 * so its own rim there (the sheet's paper outside its line) is un-matted as
 * any rim is; none where nothing was given back behind `j`. What a pose
 * shows of `k` once `j` moves away from there.
 */
const revealedOf = (
  before: ReadonlyArray<Uint8Array>,
  after: ReadonlyArray<Uint8Array>,
  k: number,
  without: (j: number) => ReadonlyArray<Uint8Array>,
  W: number,
  H: number,
): ReadonlyArray<Uint8Array | undefined> => {
  const own = before[k]!;
  const out: Array<Uint8Array | undefined> = before.map(() => undefined);
  for (let i = 3; i < own.length; i += 4) {
    if (after[k]![i] !== 0 || own[i] === 0) continue;
    const j = before.findIndex((p, n) => n < k && p[i]! > 0);
    if (j < 0) continue;
    const shown = without(j)[k]!;
    if (shown[i] === 0) continue;
    const layer = out[j] ?? new Uint8Array(own.length);
    layer.set(shown.subarray(i - 3, i + 1), i - 3);
    out[j] = layer;
  }
  for (const layer of out) if (layer !== undefined) borderOf(layer, after[k]!, W, H);
  return out;
};

/**
 * Lays `texture`'s opaque pixels round each pixel `layer` gives back into
 * `layer`, so the bilinear sample along the line between the two is opaque
 * rather than two partial covers `over` leaves light. Each such pixel lies
 * on the same pixel of the texture drawn under it, so it changes nothing else.
 */
const borderOf = (layer: Uint8Array, texture: Uint8Array, W: number, H: number) => {
  const given = Uint8Array.from(layer);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (given[(y * W + x) * 4 + 3] === 0) continue;
      for (const [dx, dy] of AROUND) {
        const [u, v] = [x + dx, y + dy];
        const o = (v * W + u) * 4;
        if (u >= 0 && v >= 0 && u < W && v < H && given[o + 3] === 0 && texture[o + 3] === 255)
          layer.set(texture.subarray(o, o + 4), o);
      }
    }
};

/**
 * Each part's texture sealed under the parts in front of it that move with
 * it (the same skin, `skins` a key a part): one px more of its own paint
 * where it has none and such a front part is opaque (`sealOf`). Two parts
 * cut along one line hold complementary hard edges there; drawn at a
 * fractional scale, each edge's bilinear sample covers part of the pixel the
 * line crosses and `over` leaves a light seam along it. The seal fills it
 * from behind, and at rest the front part hides it.
 */
const sealed = (
  textures: ReadonlyArray<Uint8Array>,
  skins: ReadonlyArray<string>,
  W: number,
  H: number,
): ReadonlyArray<Uint8Array> =>
  textures.map((own, k) => {
    const fronts = textures.filter((_, j) => j < k && skins[j] === skins[k]);
    const seal = sealOf(own, (i) => fronts.some((f) => f[i + 3] === 255), W, H);
    if (seal === undefined) return own;
    const out = Uint8Array.from(own);
    for (let i = 3; i < seal.length; i += 4)
      if (seal[i] !== 0) out.set(seal.subarray(i - 3, i + 1), i - 3);
    return out;
  });

/**
 * Each part's texture reaching under the cut edge of each part in front of
 * it that the sheet names in `underlap`, of another skin: for a front part
 * `f` named with n px, each pixel where the part behind has no paint of its
 * own, `f`'s un-matted pixel is opaque, and a path of at most n 4-way steps
 * through such pixels leads from the part's own paint takes `f`'s pixel.
 * Two skins' parts cut along one line move apart, so a turned head would
 * open the line and show the ground; with this the part behind shows `f`'s
 * paint there, which at rest `f` hides. Where it fills a pixel the un-matte
 * cleared, that is what shows once `f` moves (`revealedOf` gives back
 * nothing there), and it seals the line (`sealsOf` lays none). A part that
 * moves far (an arm) is not named: the part behind would keep a ghost of it.
 * A pixel two named parts reach takes the front one's.
 */
const underlapped = (
  textures: ReadonlyArray<Uint8Array>,
  unmatted: ReadonlyArray<Uint8Array>,
  sheet: PuppetSheet,
  skins: ReadonlyArray<string>,
): ReadonlyArray<Uint8Array> => {
  const { width: W, height: H } = sheet;
  const out = [...textures];
  sheet.parts.forEach((front, f) => {
    const n = sheet.underlap?.[front.name] ?? 0;
    if (n < 1) return;
    for (let b = f + 1; b < textures.length; b++)
      if (skins[b] !== skins[f]) out[b] = laidUnder(out[b]!, textures[b]!, unmatted[f]!, n, W, H);
  });
  return out;
};

/**
 * `texture` with `paint`'s pixels laid in where it has none and `underReach`
 * reaches from `own` (the texture before any underlap): a copy where it lays
 * any, so no sheet's pixels change.
 */
const laidUnder = (
  texture: Uint8Array,
  own: Uint8Array,
  paint: Uint8Array,
  n: number,
  W: number,
  H: number,
) => {
  const reached = underReach(paint, own, n, W, H);
  if (!reached.includes(1)) return texture;
  const out = texture === own ? Uint8Array.from(own) : texture;
  for (let q = 0; q < W * H; q++)
    if (reached[q] === 1 && out[q * 4 + 3] === 0) out.set(paint.subarray(q * 4, q * 4 + 4), q * 4);
  return out;
};

/**
 * The pixels (a mask, 1 a pixel) a path of at most `n` 4-way steps leads to
 * from `own`'s paint through pixels where `paint` is opaque and `own` has none.
 */
const underReach = (paint: Uint8Array, own: Uint8Array, n: number, W: number, H: number) => {
  const reached = new Uint8Array(W * H);
  const open = (u: number, v: number) =>
    u >= 0 &&
    v >= 0 &&
    u < W &&
    v < H &&
    reached[v * W + u] === 0 &&
    paint[(v * W + u) * 4 + 3] === 255 &&
    own[(v * W + u) * 4 + 3] === 0;
  let ring: Array<number> = [];
  for (let p = 0; p < W * H; p++) if (own[p * 4 + 3]! > 0) ring.push(p);
  for (let step = 0; step < n; step++) {
    const next: Array<number> = [];
    for (const p of ring)
      for (const [dx, dy] of BESIDE) {
        const [u, v] = [(p % W) + dx, Math.floor(p / W) + dy];
        if (!open(u, v)) continue;
        reached[v * W + u] = 1;
        next.push(v * W + u);
      }
    ring = next;
  }
  return reached;
};

/**
 * The seals laid over part `k` by each part in front of it of another skin,
 * by that front part: one px more of `k`'s paint where it has none and the
 * frontmost opaque part there is of another skin (`sealOf`: `k`'s colour, so
 * drawn over `k` and under the front part the line blends as one paint's),
 * with `k`'s own opaque pixels beside each, so the bilinear sample along the
 * line is opaque. At rest the front part hides the seal and the opaque pixels
 * lie on themselves; once either part moves the line opens, so a seal shows
 * only while neither does (`sealsShown`). Two skins' parts move apart, so
 * this cannot go into `k`'s texture as `sealed` does for one skin's.
 */
const sealsOf = (
  unmatted: ReadonlyArray<Uint8Array>,
  textures: ReadonlyArray<Uint8Array>,
  skins: ReadonlyArray<string>,
  k: number,
  W: number,
  H: number,
): ReadonlyArray<Uint8Array | undefined> => {
  const own = textures[k]!;
  const out: Array<Uint8Array | undefined> = unmatted.map(() => undefined);
  const holder = (i: number) => unmatted.findIndex((f, j) => j < k && f[i + 3] === 255);
  const holds = (i: number) => {
    const h = holder(i);
    return h >= 0 && skins[h] !== skins[k] && own[i + 3] === 0;
  };
  const seal = sealOf(unmatted[k]!, holds, W, H);
  if (seal === undefined) return out;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (seal[i + 3] === 0) continue;
      const layer = (out[holder(i)] ??= new Uint8Array(own.length));
      layer.set(seal.subarray(i, i + 4), i);
      for (const [dx, dy] of BESIDE) {
        const [u, v] = [x + dx, y + dy];
        const o = (v * W + u) * 4;
        if (u >= 0 && v >= 0 && u < W && v < H && own[o + 3] === 255)
          layer.set(own.subarray(o, o + 4), o);
      }
    }
  return out;
};

/** The eight pixels round one, as `[dx, dy]`: the texels a bilinear sample beside it can reach. */
const AROUND = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].flatMap((dx) => (dx === 0 && dy === 0 ? [] : [[dx, dy] as const])),
);

/** The four pixels beside one, as `[dx, dy]`. */
const BESIDE = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The rounded mean colour, opaque, of `own`'s opaque pixels beside `(x, y)` (4-way); none where none is. */
const meanBeside = (own: Uint8Array, x: number, y: number, W: number, H: number) => {
  const sum = [0, 0, 0];
  let n = 0;
  for (const [dx, dy] of BESIDE) {
    const [u, v] = [x + dx, y + dy];
    if (u < 0 || v < 0 || u >= W || v >= H) continue;
    const o = (v * W + u) * 4;
    if (own[o + 3] !== 255) continue;
    for (let c = 0; c < 3; c++) sum[c]! += own[o + c]!;
    n++;
  }
  if (n === 0) return undefined;
  return [...sum.map((s) => Math.round(s / n)), 255];
};

/**
 * One px more of `own`'s paint, alone: at each pixel (byte offset `i`) where
 * `own` has none, `holds(i)`, and an opaque pixel of its own lies beside it,
 * the mean of those beside it (`meanBeside`); clear elsewhere. None where it
 * seals nothing.
 */
const sealOf = (
  own: Uint8Array,
  holds: (i: number) => boolean,
  W: number,
  H: number,
): Uint8Array | undefined => {
  let out: Uint8Array | undefined;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (own[i + 3] !== 0) continue;
      const mean = meanBeside(own, x, y, W, H);
      if (mean === undefined || !holds(i)) continue;
      out ??= new Uint8Array(own.length);
      out.set(mean, i);
    }
  return out;
};

/** `own`'s pixels with `body`'s inside `region` where `own` has none: an arm's texture with its shoulder flap. */
const withFlap = (own: Raster, body: Raster, region: ReadonlyArray<Pt>) => {
  const { width: W, height: H } = own;
  const rgba = Uint8Array.from(own.rgba);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (rgba[i + 3] === 0 && body.rgba[i + 3]! > 0 && inside(region, x + 0.5, y + 0.5))
        rgba.set(body.rgba.subarray(i, i + 4), i);
    }
  return rgba;
};

/** `puppet` at rest: every bone at 0, the root where it rests, at scale 1. */
export const restPose = (puppet: Puppet): PuppetPose => ({
  numbers: {},
  root: puppet.root,
  scale: 1,
});

/** Each bone's world transform at `numbers`, as `[a, b, c, d, e, f]` (x' = a x + c y + e, y' = b x + d y + f), six a bone. */
export const boneTransforms = (
  bones: ReadonlyArray<PuppetBone>,
  numbers: Readonly<Record<string, number>>,
) => {
  const m = new Float64Array(bones.length * 6);
  const at = new Map<string, number>();
  for (const [k, b] of bones.entries()) {
    at.set(b.name, k);
    const t = ((numbers[b.name] ?? 0) * Math.PI) / 180;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const [px, py] = b.pivot;
    const l = [c, s, -s, c, px - c * px + s * py, py - s * px - c * py];
    const p = b.parent === undefined ? undefined : at.get(b.parent);
    if (p === undefined) m.set(l, k * 6);
    else {
      const q = m.subarray(p * 6, p * 6 + 6);
      m.set(
        [
          q[0]! * l[0]! + q[2]! * l[1]!,
          q[1]! * l[0]! + q[3]! * l[1]!,
          q[0]! * l[2]! + q[2]! * l[3]!,
          q[1]! * l[2]! + q[3]! * l[3]!,
          q[0]! * l[4]! + q[2]! * l[5]! + q[4]!,
          q[1]! * l[4]! + q[3]! * l[5]! + q[5]!,
        ],
        k * 6,
      );
    }
  }
  return m;
};

/** `mesh`'s vertices posed into `out` (flat x, y): its bones' transforms `m` blended by its weights, the root moved by `(dx, dy)` and sized by `scale` about `root`. */
export const poseMesh = <O extends Float64Array | Float32Array>(
  mesh: PuppetMesh,
  m: Float64Array,
  root: Pt,
  pose: PuppetPose,
  out: O,
): O => {
  const v = mesh.vertices;
  const n = v.length / 2;
  for (let i = 0; i < n; i++) {
    const [x, y] = [v[2 * i]!, v[2 * i + 1]!];
    let [px, py] = [x, y];
    const b0 = mesh.bones[WEIGHTS * i]!;
    if (b0 >= 0) {
      px = 0;
      py = 0;
      for (let j = 0; j < WEIGHTS; j++) {
        const b = mesh.bones[WEIGHTS * i + j]!;
        if (b < 0) continue;
        const w = mesh.amounts[WEIGHTS * i + j]!;
        const o = b * 6;
        px += w * (m[o]! * x + m[o + 2]! * y + m[o + 4]!);
        py += w * (m[o + 1]! * x + m[o + 3]! * y + m[o + 5]!);
      }
    }
    out[2 * i] = pose.root[0] + pose.scale * (px - root[0]);
    out[2 * i + 1] = pose.root[1] + pose.scale * (py - root[1]);
  }
  return out;
};

/**
 * Each part's vertices posed at `pose` (flat x, y), in its mesh's vertex order.
 * Exported as the skinning's contract seam: the unit's acceptance reads the posed mesh through it.
 */
export const posedVertices = (puppet: Puppet, pose: PuppetPose): ReadonlyArray<Float64Array> => {
  const m = boneTransforms(puppet.bones, pose.numbers);
  return puppet.parts.map((p) =>
    poseMesh(p.mesh, m, puppet.root, pose, new Float64Array(p.mesh.vertices.length)),
  );
};

/**
 * Whether part `k`'s mesh lies on a bone `m` (`boneTransforms`) turns away from the bind pose.
 * Exact: a bone at 0 under still parents is the identity to the bit (cos 0 is 1, sin 0 is 0).
 */
export const partTurned = (puppet: Puppet, k: number, m: Float64Array): boolean => {
  const bones = puppet.parts[k]!.mesh.bones;
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i]!;
    if (b >= 0 && IDENTITY.some((v, j) => m[b * 6 + j] !== v)) return true;
  }
  return false;
};

/**
 * The seals laid over part `k` this frame (`PuppetPart.seals`, as each draw
 * path holds them): those of front parts that do not move, and none once `k`
 * moves itself, since a seal closes the line two still parts share. The one
 * rule both draw paths follow.
 */
export const sealsShown = <T>(
  seals: ReadonlyArray<T | undefined>,
  k: number,
  moving: (n: number) => boolean,
): ReadonlyArray<T> => {
  if (moving(k)) return [];
  return seals.filter((s, j): s is T => s !== undefined && !moving(j));
};

/**
 * The revealed paint laid over part `k` this frame (`PuppetPart.revealed`, as
 * each draw path holds it): what each part in front of `k` hid under its
 * rim, laid on `k`'s own mesh, shown once either of the two moves, since
 * either move can carry that paint out from under the rim. None while
 * neither moves, so a still figure draws its textures alone. The one rule
 * every draw path follows.
 */
export const revealedShown = <T>(
  revealed: ReadonlyArray<T | undefined>,
  k: number,
  moving: (n: number) => boolean,
): ReadonlyArray<T> => {
  const self = moving(k);
  return revealed.filter((r, j): r is T => r !== undefined && (self || moving(j)));
};

/**
 * `puppet` drawn at `pose` in its sheet's frame (or a frame `size` px from the same origin) over transparent ground: the
 * parts back to front, each pixel whose centre a posed triangle holds
 * inverse-mapped to the part's texture, sampled bilinear on premultiplied
 * texels, laid over what lies under it, then each seal it shows
 * (`sealsShown`) and each revealed paint it shows (`revealedShown`) over it on
 * the same triangles. Each triangle is laid in turn, in its
 * mesh's order, so where a fold turns two triangles of one part over one pixel
 * the later lies over the earlier, as the GL path's blend lays them; a pixel
 * centre on an edge two triangles share goes to one of them (`edgeHolds`).
 */
export const rasterOf = (
  puppet: Puppet,
  pose: PuppetPose,
  size: readonly [number, number] = [puppet.width, puppet.height],
): Raster => {
  const [W, H] = size;
  // Premultiplied, colour in 0..255 and alpha in 0..1.
  const acc = new Float64Array(W * H * 4);
  const posed = posedVertices(puppet, pose);
  const m = boneTransforms(puppet.bones, pose.numbers);
  const moving = (n: number) => partTurned(puppet, n, m);
  for (let k = puppet.parts.length - 1; k >= 0; k--) {
    const part = puppet.parts[k]!;
    const layers = [
      part.pixels,
      ...sealsShown(part.seals, k, moving),
      ...revealedShown(part.revealed, k, moving),
    ];
    Option.match(
      Option.filter(
        Option.fromUndefinedOr(part.limb),
        (limb) => limbBlend(limb, pose.numbers).sleeve > 0,
      ),
      {
        onNone: () => layPart(acc, part, layers, posed[k]!, [0, 0], [W, H]),
        onSome: (limb) => layLimb(acc, puppet, pose, m, part, limb, layers, posed[k]!, [W, H]),
      },
    );
  }
  return unpremultiplied(acc, W, H);
};

/** Each of `layers` (a part's texture, then its seals and revealed paint) laid over `acc` (`W` × `H`, its origin at `origin` of the frame) on `part`'s posed vertices `q`, triangle by triangle in mesh order. */
const layPart = (
  acc: Float64Array,
  part: PuppetPart,
  layers: ReadonlyArray<Raster>,
  q: Float64Array,
  origin: Pt,
  [W, H]: readonly [number, number],
) => {
  const t = part.mesh.triangles;
  const shifted = q.map((c, i) => c - origin[i % 2]!);
  for (const tex of layers)
    for (let i = 0; i < t.length; i += 3)
      layTriangle(acc, tex, part.mesh.vertices, shifted, [t[i]!, t[i + 1]!, t[i + 2]!], [W, H]);
};

/** Each limb's part's pixels kept only on its stub (alpha times the stub's share): what the stroke leaves painted. */
const STUBS = new WeakMap<PuppetPartLimb, Raster>();

const stubOf = (limb: PuppetPartLimb, pixels: Raster): Raster => {
  const known = STUBS.get(limb);
  if (known !== undefined) return known;
  const rgba = Uint8Array.from(pixels.rgba);
  for (let y = 0; y < pixels.height; y++)
    for (let x = 0; x < pixels.width; x++) {
      const o = (y * pixels.width + x) * 4 + 3;
      rgba[o] = Math.round(rgba[o]! * limbShares(limb, x, y)[0]);
    }
  const stub = { width: pixels.width, height: pixels.height, rgba };
  STUBS.set(limb, stub);
  return stub;
};

/** Bone `name`'s drawn map at `pose` (its transform in `m`, then the root's move and scale), inverted: drawn point → rest point. */
const restMap = (puppet: Puppet, pose: PuppetPose, m: Float64Array, name: string) => {
  const o = puppet.bones.findIndex((b) => b.name === name) * 6;
  const s = pose.scale;
  const [a, b, c, d] = [s * m[o]!, s * m[o + 1]!, s * m[o + 2]!, s * m[o + 3]!];
  const e = s * m[o + 4]! + pose.root[0] - s * puppet.root[0];
  const f = s * m[o + 5]! + pose.root[1] - s * puppet.root[1];
  const det = a * d - b * c;
  return Float64Array.from([d, -b, -c, a, c * f - d * e, b * e - a * f], (v) => v / det);
};

/**
 * A part with a stroke limb its pose shows (`limbBlend`'s sleeve over 0)
 * laid over `acc`: over the box its posed mesh and its limb's rigid pieces
 * reach, each pixel the painted part (its `layers` on its mesh) and the
 * stroke (`limbStroke`, over the part's stub as painted) mixed by the
 * sleeve's share.
 */
const layLimb = (
  acc: Float64Array,
  puppet: Puppet,
  pose: PuppetPose,
  m: Float64Array,
  part: PuppetPart,
  limb: PuppetPartLimb,
  layers: ReadonlyArray<Raster>,
  q: Float64Array,
  [W, H]: readonly [number, number],
) => {
  const shown = limbBlend(limb, pose.numbers);
  const frames = {
    upper: restMap(puppet, pose, m, limb.bones[0]),
    fore: restMap(puppet, pose, m, limb.bones[1]),
    hand: restMap(puppet, pose, m, limb.bones[2]),
  };
  const xs: Array<number> = [];
  const ys: Array<number> = [];
  for (let i = 0; i < q.length; i += 2) [xs[xs.length], ys[ys.length]] = [q[i]!, q[i + 1]!];
  const [rx, ry, rw, rh] = limb.regions.box;
  for (const inv of [frames.upper, frames.fore, frames.hand]) {
    const det = inv[0]! * inv[3]! - inv[1]! * inv[2]!;
    const fwd = [inv[3]!, -inv[1]!, -inv[2]!, inv[0]!].map((v) => v / det);
    for (const [cx, cy] of [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh],
    ] as const) {
      const [dx, dy] = [cx - inv[4]!, cy - inv[5]!];
      xs.push(fwd[0]! * dx + fwd[2]! * dy);
      ys.push(fwd[1]! * dx + fwd[3]! * dy);
    }
  }
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
  const bw = Math.min(W, Math.ceil(Math.max(...xs)) + 2) - x0;
  const bh = Math.min(H, Math.ceil(Math.max(...ys)) + 2) - y0;
  if (bw <= 0 || bh <= 0) return;
  const painted = new Float64Array(bw * bh * 4);
  const stub = new Float64Array(bw * bh * 4);
  layPart(painted, part, layers, q, [x0, y0], [bw, bh]);
  layPart(stub, part, [stubOf(limb, part.pixels)], q, [x0, y0], [bw, bh]);
  const stroke = limbStroke(limb, frames, pose.numbers, (sx, sy, into) =>
    sampleAt(part.pixels, sx, sy, into),
  );
  const drawn = new Float64Array(4);
  const mixed = new Float64Array(4);
  const s = shown.sleeve;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const o = (y * bw + x) * 4;
      stroke(x0 + x + 0.5, y0 + y + 0.5, stub.subarray(o, o + 4), drawn);
      for (let c = 0; c < 4; c++) mixed[c] = (1 - s) * painted[o + c]! + s * drawn[c]!;
      if (mixed[3]! > 0) over(acc, ((y0 + y) * W + x0 + x) * 4, mixed);
    }
};

/** The premultiplied bilinear sample of `tex` (a `W` × `H` RGBA texture) at `(sx, sy)` into `into`: colour in 0..255, alpha in 0..1. */
const sampleAt = (tex: Raster, sx: number, sy: number, into: Float64Array) => {
  const { width: W, height: H, rgba } = tex;
  const bx = Math.floor(sx - 0.5);
  const by = Math.floor(sy - 0.5);
  const fx = sx - 0.5 - bx;
  const fy = sy - 0.5 - by;
  into.fill(0);
  for (let d = 0; d < 4; d++) {
    const [ox, oy] = [d & 1, d >> 1];
    const wt = (ox === 1 ? fx : 1 - fx) * (oy === 1 ? fy : 1 - fy);
    const [x, y] = [bx + ox, by + oy];
    const j = (y * W + x) * 4;
    const a = wt === 0 || x < 0 || y < 0 || x >= W || y >= H ? 0 : rgba[j + 3]! / 255;
    if (a === 0) continue;
    into[0]! += rgba[j]! * a * wt;
    into[1]! += rgba[j + 1]! * a * wt;
    into[2]! += rgba[j + 2]! * a * wt;
    into[3]! += a * wt;
  }
};

/** One sample's scratch, rewritten whole by each `sampleAt`. */
const SAMPLE = new Float64Array(4);

/** An edge's function `a·x + b·y + c`, positive inside its triangle, and whether a point on it (0) is the triangle's. */
interface Edge {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly tie: boolean;
}

/**
 * The edge `u`–`v` of a triangle whose signed area has sign `s`. Its function
 * is made from the lower-indexed end, so the two triangles that share an edge
 * hold exact negations of one another; a point on the edge itself goes to the
 * triangle whose inward normal `(a, b)` points down, or right when the edge
 * lies flat: a top-left fill rule.
 */
const edgeOf = (q: Float64Array, u: number, v: number, s: number): Edge => {
  const [lo, hi, f] = u < v ? [u, v, s] : [v, u, -s];
  const lx = q[2 * lo]!;
  const ly = q[2 * lo + 1]!;
  const dx = q[2 * hi]! - lx;
  const dy = q[2 * hi + 1]! - ly;
  const a = -f * dy;
  const b = f * dx;
  return { a, b, c: f * (dy * lx - dx * ly), tie: b > 0 || (b === 0 && a > 0) };
};

/** The weight `(px, py)` has from the vertex across `e`: its edge function, or `NaN` outside. */
const edgeHolds = (e: Edge, px: number, py: number): number => {
  const w = e.a * px + e.b * py + e.c;
  return w > 0 || (w === 0 && e.tie) ? w : Number.NaN;
};

/** A part's posed triangle `tri` (bind vertices `src`, posed `q`) laid over `acc`: each pixel whose centre it holds inverse-mapped to `tex`, the part's texture or one of its seals. */
const layTriangle = (
  acc: Float64Array,
  tex: Raster,
  src: Float64Array,
  q: Float64Array,
  [ia, ib, ic]: readonly [number, number, number],
  [W, H]: readonly [number, number],
) => {
  const [ax, ay, bx, by, cx, cy] = [
    q[2 * ia]!,
    q[2 * ia + 1]!,
    q[2 * ib]!,
    q[2 * ib + 1]!,
    q[2 * ic]!,
    q[2 * ic + 1]!,
  ];
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) return;
  const [s, size] = [Math.sign(area), Math.abs(area)];
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
  const ea = edgeOf(q, ib, ic, s);
  const eb = edgeOf(q, ic, ia, s);
  const ec = edgeOf(q, ia, ib, s);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const p = y * W + x;
      const px = x + 0.5;
      const py = y + 0.5;
      const wa = edgeHolds(ea, px, py);
      const wb = edgeHolds(eb, px, py);
      const wc = edgeHolds(ec, px, py);
      // NaN is outside: every comparison with it is false
      if (!(wa >= 0 && wb >= 0 && wc >= 0)) continue;
      const l0 = wa / size;
      const l1 = wb / size;
      const l2 = 1 - l0 - l1;
      const sx = l0 * src[2 * ia]! + l1 * src[2 * ib]! + l2 * src[2 * ic]!;
      const sy = l0 * src[2 * ia + 1]! + l1 * src[2 * ib + 1]! + l2 * src[2 * ic + 1]!;
      sampleAt(tex, sx, sy, SAMPLE);
      if (SAMPLE[3]! > 0) over(acc, p * 4, SAMPLE);
    }
};

/** `s` (premultiplied) laid over `acc` at `o`. */
const over = (acc: Float64Array, o: number, s: Float64Array) => {
  const keep = 1 - s[3]!;
  for (let c = 0; c < 4; c++) acc[o + c] = s[c]! + acc[o + c]! * keep;
};

/** `acc` (premultiplied) as RGBA bytes: a pixel whose alpha rounds to 0 is clear. */
const unpremultiplied = (acc: Float64Array, W: number, H: number): Raster => {
  const rgba = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const o = p * 4;
    const a = acc[o + 3]!;
    const a8 = Math.round(Math.min(1, a) * 255);
    if (a8 === 0) continue;
    for (let c = 0; c < 3; c++)
      rgba[o + c] = Math.round(Math.min(255, Math.max(0, acc[o + c]! / a)));
    rgba[o + 3] = a8;
  }
  return { width: W, height: H, rgba };
};
