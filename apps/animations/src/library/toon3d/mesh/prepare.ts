import type { SkinnedRest } from './glb.ts';
import { ARM_BONES, normalised, normaliserOf, type ArmBones, type Rig } from './rig.ts';

/** The face labels' legend: a label is an index into it. */
export const LABELS = ['none', 'skin', 'hair', 'tunic', 'mantle', 'sash', 'sandal'] as const;

export type LabelName = (typeof LABELS)[number];

/** How a mesh is made ready: its height in head units, and the rounds of smoothing its label edges get. */
export interface Preparation {
  readonly height: number;
  readonly labelRounds: number;
}

/**
 * A mesh figure's data, everything the page needs to pose and paint it: the
 * welded, normalised rig and its triangles (in the GLB's face order), each
 * vertex's label shares (skin, hair, tunic, mantle, sash, sandal) smoothed
 * over the mesh so a label's edge is a curve through the triangles, each
 * vertex's share of each arm's bones, and the face's and the body's depth
 * centres the face marks and the shade proxies sit on.
 */
export interface MeshFigure {
  readonly rig: Rig;
  readonly indices: Uint32Array;
  readonly labels: Float32Array;
  readonly arms: Float32Array;
  readonly faceZ: number;
  readonly bodyZ: number;
}

/** Vertices that sit at one place (to 1e-5 head) become one, so the normals and labels run smooth across the mesh's seams. */
const weld = (positions: Float32Array) => {
  const at = new Map<string, number>();
  const first: Array<number> = [];
  const map = new Uint32Array(positions.length / 3);
  for (let i = 0; i < map.length; i++) {
    const key = [0, 1, 2].map((c) => Math.round((positions[i * 3 + c] ?? 0) * 1e5)).join(',');
    if (!at.has(key)) {
      at.set(key, first.length);
      first.push(i);
    }
    map[i] = at.get(key) ?? 0;
  }
  return { first, map };
};

/**
 * Each vertex's label shares: its faces' labels counted, then `rounds`
 * rounds of averaging over the mesh's edges; the page takes the largest
 * share per fragment.
 */
const labelShares = (
  count: number,
  indices: Uint32Array,
  faceLabels: ReadonlyArray<number>,
  rounds: number,
): Float32Array => {
  const L = LABELS.length;
  const { counts, degree } = labelCounts(count, indices, faceLabels);
  let cur = counts;
  let next = new Float32Array(count * L);
  for (let r = 0; r < rounds; r++) {
    next.set(cur);
    for (let f = 0; f < indices.length; f += 3) {
      const tri = [indices[f] ?? 0, indices[f + 1] ?? 0, indices[f + 2] ?? 0] as const;
      addShares(next, cur, tri[0], tri[1]);
      addShares(next, cur, tri[1], tri[2]);
      addShares(next, cur, tri[2], tri[0]);
    }
    for (let v = 0; v < count; v++)
      for (let l = 0; l < L; l++) next[v * L + l] = (next[v * L + l] ?? 0) / (1 + (degree[v] ?? 0));
    [cur, next] = [next, cur];
  }
  const out = new Float32Array(count * (L - 1));
  for (let v = 0; v < count; v++)
    for (let l = 1; l < L; l++) out[v * (L - 1) + l - 1] = cur[v * L + l] ?? 0;
  return out;
};

/** Each vertex's share of its faces' labels, and its edge count (twice its faces), which a smoothing round divides by. */
const labelCounts = (count: number, indices: Uint32Array, faceLabels: ReadonlyArray<number>) => {
  const L = LABELS.length;
  const counts = new Float32Array(count * L);
  const degree = new Float32Array(count);
  for (let f = 0; f < faceLabels.length; f++)
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k] ?? 0;
      const at = v * L + (faceLabels[f] ?? 0);
      counts[at] = (counts[at] ?? 0) + 1;
      degree[v] = (degree[v] ?? 0) + 2;
    }
  for (let v = 0; v < count; v++) {
    let s = 0;
    for (let l = 0; l < L; l++) s += counts[v * L + l] ?? 0;
    for (let l = 0; l < L; l++) counts[v * L + l] = (counts[v * L + l] ?? 0) / (s || 1);
  }
  return { counts, degree };
};

/** Each vertex of an edge takes its neighbour's shares from `cur` into `next`. */
const addShares = (next: Float32Array, cur: Float32Array, x: number, y: number): void => {
  const L = LABELS.length;
  for (let l = 0; l < L; l++) {
    next[x * L + l] = (next[x * L + l] ?? 0) + (cur[y * L + l] ?? 0);
    next[y * L + l] = (next[y * L + l] ?? 0) + (cur[x * L + l] ?? 0);
  }
};

/** Each vertex's skin weight on one arm's three bones. */
const armShare = (rig: Rig, bones: ArmBones): Float32Array => {
  const own = new Set([bones.arm, bones.fore, bones.hand].map((n) => rig.names.indexOf(n)));
  const out = new Float32Array(rig.positions.length / 3);
  for (let v = 0; v < out.length; v++)
    for (let k = 0; k < 4; k++)
      if (own.has(rig.joints[v * 4 + k] ?? -1))
        out[v] = (out[v] ?? 0) + (rig.weights[v * 4 + k] ?? 0);
  return out;
};

/**
 * Where the face's and the body's proxies sit in depth: the face's centre
 * plane the code-built head's half-depth (0.385) behind the front of the
 * skin at the face's middle (y 2.6 to 3, |x| < 0.1), so the marks carry onto
 * a turned face as the code-built figure's do; the body's the middle of the
 * clothes' depth at y 1 to 2, |x| < 0.3.
 */
const depthCentres = (
  positions: Float32Array,
  indices: Uint32Array,
  faceLabels: ReadonlyArray<number>,
) => {
  let front = -Infinity;
  let back = Infinity;
  let fore = -Infinity;
  for (let f = 0; f < faceLabels.length; f++) {
    const a = indices[f * 3] ?? 0;
    const x = positions[a * 3] ?? 0;
    const y = positions[a * 3 + 1] ?? 0;
    const z = positions[a * 3 + 2] ?? 0;
    const label = LABELS[faceLabels[f] ?? 0];
    if (label === 'skin' && y > 2.6 && y < 3 && Math.abs(x) < 0.1) front = Math.max(front, z);
    if ((label === 'tunic' || label === 'mantle') && y > 1 && y < 2 && Math.abs(x) < 0.3) {
      back = Math.min(back, z);
      fore = Math.max(fore, z);
    }
  }
  return { faceZ: front - 0.385, bodyZ: (back + fore) / 2 };
};

/**
 * A mesh figure from a GLB's rest state and its face labels: stood at
 * `height` heads, welded, its labels smoothed `labelRounds` rounds.
 */
export const prepareMesh = (
  rest: SkinnedRest,
  faceLabels: ReadonlyArray<number>,
  how: Preparation,
): MeshFigure => {
  const n = normaliserOf(rest.positions, how.height);
  const stood = new Float32Array(rest.positions.length);
  for (let i = 0; i < stood.length; i += 3) {
    const p = normalised(n, [
      rest.positions[i] ?? 0,
      rest.positions[i + 1] ?? 0,
      rest.positions[i + 2] ?? 0,
    ]);
    stood.set(p, i);
  }
  const { first, map } = weld(stood);
  const positions = new Float32Array(first.length * 3);
  const joints = new Uint16Array(first.length * 4);
  const weights = new Float32Array(first.length * 4);
  first.forEach((raw, v) => {
    positions.set(stood.subarray(raw * 3, raw * 3 + 3), v * 3);
    joints.set(rest.joints.subarray(raw * 4, raw * 4 + 4), v * 4);
    weights.set(rest.weights.subarray(raw * 4, raw * 4 + 4), v * 4);
  });
  const indices = rest.indices.map((i) => map[i] ?? 0);
  const rig: Rig = {
    positions,
    joints,
    weights,
    names: rest.skeleton.map((j) => j.name),
    heads: rest.skeleton.map((j) => normalised(n, j.head)),
  };
  const right = armShare(rig, ARM_BONES.right);
  const left = armShare(rig, ARM_BONES.left);
  const arms = new Float32Array(first.length * 2);
  for (let v = 0; v < first.length; v++) arms.set([right[v] ?? 0, left[v] ?? 0], v * 2);
  return {
    rig,
    indices,
    labels: labelShares(first.length, indices, faceLabels, how.labelRounds),
    arms,
    ...depthCentres(positions, indices, faceLabels),
  };
};
