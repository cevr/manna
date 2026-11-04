import type { Vec3 } from '../spec.ts';
import type { SkinnedRest } from './glb.ts';
import { bodyLabelAt, type MeshLabels } from './labels.ts';
import { ARM_BONES, normalised, normaliserOf, type ArmBones, type Rig } from './rig.ts';

/**
 * A mesh figure's data, everything the page needs to pose and paint it: the
 * welded, normalised rig and its triangles (in the GLB's face order), the
 * member's label rules the shader reads at each fragment's rest position,
 * each vertex's share of each arm's bones and its hand bone's lead over its
 * other bones (right, left), and the face's and the body's depth centres the
 * face marks and the shade proxies sit on.
 */
export interface MeshFigure {
  readonly rig: Rig;
  readonly indices: Uint32Array;
  readonly labels: MeshLabels;
  readonly arms: Float32Array;
  readonly hands: Float32Array;
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

/** Each vertex's weight on its hand bone less its largest weight on any other bone: positive where the hand bone leads. */
const handLead = (rig: Rig, hand: string): Float32Array => {
  const bone = rig.names.indexOf(hand);
  const out = new Float32Array(rig.positions.length / 3);
  for (let v = 0; v < out.length; v++) {
    let own = 0;
    let other = 0;
    for (let k = 0; k < 4; k++) {
      const w = rig.weights[v * 4 + k] ?? 0;
      if ((rig.joints[v * 4 + k] ?? -1) === bone) own += w;
      else other = Math.max(other, w);
    }
    out[v] = own - other;
  }
  return out;
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
const depthCentres = (positions: Float32Array, arms: Float32Array, rules: MeshLabels) => {
  let front = -Infinity;
  let back = Infinity;
  let fore = -Infinity;
  for (let v = 0; v < positions.length / 3; v++) {
    if ((arms[v * 2] ?? 0) > 0.5 || (arms[v * 2 + 1] ?? 0) > 0.5) continue;
    const p: Vec3 = [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
    const [x, y, z] = p;
    const label = bodyLabelAt(rules, p);
    if (label === 'skin' && y > 2.6 && y < 3 && Math.abs(x) < 0.1) front = Math.max(front, z);
    if ((label === 'tunic' || label === 'mantle') && y > 1 && y < 2 && Math.abs(x) < 0.3) {
      back = Math.min(back, z);
      fore = Math.max(fore, z);
    }
  }
  return { faceZ: front - 0.385, bodyZ: (back + fore) / 2 };
};

/** A mesh figure from a GLB's rest state and its member's label rules: stood at `height` head units and welded. */
export const prepareMesh = (rest: SkinnedRest, rules: MeshLabels, height: number): MeshFigure => {
  const n = normaliserOf(rest.positions, height);
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
  const handR = handLead(rig, ARM_BONES.right.hand);
  const handL = handLead(rig, ARM_BONES.left.hand);
  const arms = new Float32Array(first.length * 2);
  const hands = new Float32Array(first.length * 2);
  for (let v = 0; v < first.length; v++) {
    arms.set([right[v] ?? 0, left[v] ?? 0], v * 2);
    hands.set([handR[v] ?? 0, handL[v] ?? 0], v * 2);
  }
  return {
    rig,
    indices,
    labels: rules,
    arms,
    hands,
    ...depthCentres(positions, arms, rules),
  };
};
