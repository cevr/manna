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
// - **Weights.** A vertex lies on at most two bones, only those its part's
//   skin names. Its nearest bone (by distance to the bone's segment) holds
//   it, unless it lies within the blend of a joint that bone shares with
//   another its skin names: there the two share it by a smoothstep along the
//   child bone's axis, across `blend` px either side of the joint. A part
//   whose skin names no bone moves with the root alone.
// - **Shoulder flap.** A flap gives an arm the body's pixels round its cap
//   (`PuppetFlap.region`): they join the arm's texture, and the vertices
//   there lie on the arm's own bones and on the body's bone, the body's
//   weight 0 at the cap and 1 at `reach` px (34) from the shoulder's pivot,
//   above the pivot along the arm. At rest those pixels are the body's own,
//   where no part in front shows paint, so the rest pose shows the sheet.
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

import { Result, Schema } from 'effect';
import type { Rgb } from './cast-sheet-pixels.ts';
import type { Raster } from './raster.ts';
import { unmatte } from './unmatte.ts';

type Pt = readonly [number, number];

/** The grid a part's mesh is laid on, px. */
const MESH_STEP = 3;

/** How far either side of a joint two bones share a vertex, px (at most half the shorter bone). */
const BLEND = 18;

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

/** A skeleton: its bones (each parent before its children), each part's skin (the bones it lies on), its flaps, and the root (rest: the first bone's pivot). */
export interface Skeleton {
  readonly bones: ReadonlyArray<PuppetBone>;
  readonly skin: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly flaps?: ReadonlyArray<PuppetFlap>;
  readonly root?: Pt;
}

/** A pose: each bone's number in degrees (one left out is 0), where the root stands, and the one scale about it. */
export interface PuppetPose {
  readonly numbers: Readonly<Record<string, number>>;
  readonly root: Pt;
  readonly scale: number;
}

/** A part's mesh: its vertices (flat x, y, sheet px), its triangles (flat, three vertex indices each), and each vertex's weights as bone indices and amounts (two a vertex, -1 none). */
interface PuppetMesh {
  readonly vertices: Float64Array;
  readonly triangles: Uint32Array;
  readonly bones: Int16Array;
  readonly amounts: Float64Array;
}

/** A part of a puppet: its name, its pixels (its texture), what each part in front of it hides, and its mesh. */
interface PuppetPart {
  readonly name: string;
  readonly pixels: Raster;
  /** By each part in front of it: the paint the un-matte cleared behind that part's rim (hidden at rest), shown once that part moves away; none where nothing was cleared. */
  readonly revealed: ReadonlyArray<Raster | undefined>;
  readonly mesh: PuppetMesh;
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
interface PuppetSheet {
  readonly width: number;
  readonly height: number;
  readonly parts: ReadonlyArray<{ readonly name: string; readonly pixels: Raster }>;
  readonly paper?: Rgb;
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

/** `p` along bone `b`'s axis from its pivot, px. */
const along = (p: Pt, b: PuppetBone) => {
  const [dx, dy] = [b.tip[0] - b.pivot[0], b.tip[1] - b.pivot[1]];
  const len = Math.hypot(dx, dy) || 1;
  return ((p[0] - b.pivot[0]) * dx + (p[1] - b.pivot[1]) * dy) / len;
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

/** The weights of a vertex at `p` on `skin` (bone indices into `bones`), at most two, totalling 1. */
const weightsAt = (
  p: Pt,
  skin: ReadonlyArray<number>,
  bones: ReadonlyArray<PuppetBone>,
): Array<[number, number]> => {
  if (skin.length === 0) return [];
  if (skin.length === 1) return [[skin[0]!, 1]];
  const near = nearestBone(p, skin, bones);
  const joints = jointsOf(near, skin, bones);
  // The joint whose blend holds `p` nearest its middle, if any.
  let joint: [number, number] | undefined;
  let at = Infinity;
  for (const [pa, ch] of joints) {
    const s = along(p, bones[ch]!);
    if (Math.abs(s) < blendOf(bones[pa]!, bones[ch]!) && Math.abs(s) < Math.abs(at))
      [joint, at] = [[pa, ch], s];
  }
  if (joint === undefined) return [[sideOf(p, near, joints, bones), 1]];
  const [pa, ch] = joint;
  const r = blendOf(bones[pa]!, bones[ch]!);
  const h = smooth(-r, r, at);
  if (h <= 0) return [[pa, 1]];
  if (h >= 1) return [[ch, 1]];
  return [
    [pa, 1 - h],
    [ch, h],
  ];
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

/** The joints `near` shares with another bone of `skin`: its parent's (at its own pivot) and each child's (at theirs), as (parent, child). */
const jointsOf = (near: number, skin: ReadonlyArray<number>, bones: ReadonlyArray<PuppetBone>) => {
  const joints: Array<[parent: number, child: number]> = [];
  const parent = skin.find((k) => bones[k]!.name === bones[near]!.parent);
  if (parent !== undefined) joints.push([parent, near]);
  for (const k of skin) if (bones[k]!.parent === bones[near]!.name) joints.push([near, k]);
  return joints;
};

/** How far either side of the joint of `parent` and `child` they share a vertex: `BLEND`, at most half the shorter bone. */
const blendOf = (parent: PuppetBone, child: PuppetBone) =>
  Math.min(BLEND, 0.5 * Math.min(boneLength(parent), boneLength(child)));

/** Outside every blend: the side of the nearest joint `p` lies on (the child's past it), else `near` itself. */
const sideOf = (
  p: Pt,
  near: number,
  joints: ReadonlyArray<[number, number]>,
  bones: ReadonlyArray<PuppetBone>,
) => {
  let side = near;
  let far = Infinity;
  for (const [pa, ch] of joints) {
    const s = along(p, bones[ch]!);
    if (Math.abs(s) < far) [far, side] = [Math.abs(s), s > 0 ? ch : pa];
  }
  return side;
};

/** The weights of a flap's vertex at `p`: its arm weights shared with the body by how far it lies from the shoulder. */
const flapped = (
  p: Pt,
  arm: Array<[number, number]>,
  flap: PuppetFlap,
  bone: PuppetBone,
  body: number,
): Array<[number, number]> => {
  const d = Math.hypot(p[0] - bone.pivot[0], p[1] - bone.pivot[1]);
  const w = smooth(2, -6, along(p, bone)) * smooth(flap.cap - 1, flap.reach ?? FLAP_REACH, d);
  if (w <= 0) return arm;
  if (w >= 1) return [[body, 1]];
  // The arm's bone that holds the most here keeps its share; the body takes the rest.
  const [first] = [...arm].sort((a, b) => b[1] - a[1]);
  if (first === undefined || first[0] === body) return [[body, 1]];
  return [
    [first[0], 1 - w],
    [body, w],
  ];
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
  const boneOf = new Int16Array(n * 2).fill(-1);
  const amounts = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const w = weigh([xs[2 * i]!, xs[2 * i + 1]!]);
    w.forEach(([k, amount], j) => {
      boneOf[2 * i + j] = k;
      amounts[2 * i + j] = amount;
    });
  }
  return {
    vertices: Float64Array.from(xs),
    triangles: Uint32Array.from(tris),
    bones: boneOf,
    amounts,
  };
};

/** Why a skeleton cannot skin a sheet: a bone named twice or before its parent, a skin or flap naming what is not there. */
class PuppetRefused extends Schema.TaggedError<PuppetRefused>()('PuppetRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the skeleton cannot skin the sheet: ${this.reason}`;
  }
}

/** Why `skeleton` cannot skin `sheet`, if it cannot: a bone named twice or before its parent, a skin or flap naming a part or bone that is not there, two flaps on one part, a flap resting on a bone its arm's skin does not name. */
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
  return flapRefusal(skeleton, names, seen);
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
    if (!(skeleton.skin[f.part] ?? []).includes(f.body))
      return `${f.part}'s flap rests on ${f.body}, which its skin does not name`;
  }
  return undefined;
};

/**
 * The puppet of `sheet` on `skeleton`: each part's mesh, weighted on its
 * skin, its texture its pixels (with its flap's body pixels, where it has
 * one); refused for a skeleton that does not fit the sheet.
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
  const withFlaps = sheet.parts.map((part) => {
    const flap = flapOf.get(part.name);
    const from = sheet.parts.find((p) => p.name === flap?.from);
    return flap === undefined || from === undefined
      ? part.pixels.rgba
      : withFlap(part.pixels, from.pixels, flap.region);
  });
  const { paper } = sheet;
  const textures = paper === undefined ? withFlaps : unmatte(withFlaps, W, H, paper);
  // the parts un-matted with part j gone: what each part behind j shows once j moves away
  const without = new Map<number, ReadonlyArray<Uint8Array>>();
  const unmattedWithout = (j: number) => {
    const known = without.get(j);
    if (known !== undefined) return known;
    const gone = withFlaps.map((p, n) => (n === j ? new Uint8Array(p.length) : p));
    const made = paper === undefined ? gone : unmatte(gone, W, H, paper);
    without.set(j, made);
    return made;
  };
  const parts = sheet.parts.map((part, k): PuppetPart => {
    const skin = (skeleton.skin[part.name] ?? []).map((b) => at.get(b)!);
    const flap = flapOf.get(part.name);
    const rgba = textures[k]!;
    const revealed = revealedOf(withFlaps, textures, k, unmattedWithout);
    // its mesh holds what it shows at rest and all it can reveal
    const covers = (i: number) =>
      rgba[i * 4 + 3]! > 0 || revealed.some((r) => r !== undefined && r[i * 4 + 3]! > 0);
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
              bones[at.get(flap.bone)!]!,
              at.get(flap.body)!,
            );
    return {
      name: part.name,
      pixels: { width: W, height: H, rgba },
      revealed: revealed.map((r) => r && { width: W, height: H, rgba: r }),
      mesh: meshOf(W, H, (x, y) => covers(y * W + x), weigh),
    };
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
    const b0 = mesh.bones[2 * i]!;
    if (b0 >= 0) {
      px = 0;
      py = 0;
      for (let j = 0; j < 2; j++) {
        const b = mesh.bones[2 * i + j]!;
        if (b < 0) continue;
        const w = mesh.amounts[2 * i + j]!;
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
 * `puppet` drawn at `pose` in its sheet's frame (or a frame `size` px from the same origin) over transparent ground: the
 * parts back to front, each pixel whose centre a posed triangle holds
 * inverse-mapped to the part's texture, sampled bilinear on premultiplied
 * texels, laid over what lies under it. Each triangle is laid in turn, in its
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
  for (let k = puppet.parts.length - 1; k >= 0; k--) {
    const part = puppet.parts[k]!;
    const t = part.mesh.triangles;
    for (let i = 0; i < t.length; i += 3)
      layTriangle(acc, part, posed[k]!, [t[i]!, t[i + 1]!, t[i + 2]!], [W, H]);
  }
  return unpremultiplied(acc, W, H);
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

/** A part's posed triangle `tri` laid over `acc`: each pixel whose centre it holds inverse-mapped to the part's texture. */
const layTriangle = (
  acc: Float64Array,
  part: PuppetPart,
  q: Float64Array,
  [ia, ib, ic]: readonly [number, number, number],
  [W, H]: readonly [number, number],
) => {
  const src = part.mesh.vertices;
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
      sampleAt(part.pixels, sx, sy, SAMPLE);
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
