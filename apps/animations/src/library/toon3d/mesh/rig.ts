import { Quaternion, Vector3 } from 'three';
import { armChain } from '../figure.ts';
import type { Arm, ArmPose, Pose, Vec3 } from '../spec.ts';

/**
 * A skinned mesh ready to pose, in head units (soles at y 0, centred on x
 * and z): its rest positions, four joints and weights per vertex, and each
 * joint's name and rest head.
 */
export interface Rig {
  readonly positions: Float32Array;
  readonly joints: Uint16Array;
  readonly weights: Float32Array;
  readonly names: ReadonlyArray<string>;
  readonly heads: ReadonlyArray<Vec3>;
}

/** The scale and the offset (applied first) that stand a mesh on the ground at `height` head units, centred on x and z. */
export interface Normaliser {
  readonly scale: number;
  readonly offset: Vec3;
}

/** The normaliser of `positions` (x, y, z triples): its box's height becomes `height`, its lowest point y 0, its box's centre x and z 0. */
export const normaliserOf = (positions: Float32Array, height: number): Normaliser => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const c = i % 3;
    const v = positions[i] ?? 0;
    lo[c] = Math.min(lo[c] ?? v, v);
    hi[c] = Math.max(hi[c] ?? v, v);
  }
  const at = (c: number) => [lo[c] ?? 0, hi[c] ?? 0] as const;
  const [x0, x1] = at(0);
  const [y0, y1] = at(1);
  const [z0, z1] = at(2);
  return { scale: height / (y1 - y0), offset: [-(x0 + x1) / 2, -y0, -(z0 + z1) / 2] };
};

/** `p` normalised: offset, then scaled. */
export const normalised = (n: Normaliser, p: Vec3): Vec3 => [
  (p[0] + n.offset[0]) * n.scale,
  (p[1] + n.offset[1]) * n.scale,
  (p[2] + n.offset[2]) * n.scale,
];

/** One arm's three bones in the mesh's skeleton, and its side as the code-built figure counts it (the right arm -1, at negative x). */
export interface ArmBones {
  readonly arm: string;
  readonly fore: string;
  readonly hand: string;
  readonly side: 1 | -1;
}

/** The humanoid skeleton's arm bones, by the pose's arm. */
export const ARM_BONES = {
  right: { arm: 'RightArm', fore: 'RightForeArm', hand: 'RightHand', side: -1 },
  left: { arm: 'LeftArm', fore: 'LeftForeArm', hand: 'LeftHand', side: 1 },
} satisfies Readonly<Record<'right' | 'left', ArmBones>>;

/** A posed arm's joints: the shoulder (fixed), the elbow and the wrist, in head units. */
export interface ArmJoints {
  readonly shoulder: Vec3;
  readonly elbow: Vec3;
  readonly wrist: Vec3;
}

/** One bone posed: its turn from rest, and its rest head carried to its posed head. */
interface BonePose {
  readonly turn: Quaternion;
  readonly from: Vector3;
  readonly to: Vector3;
}

const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

const v3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const about = (axis: Vector3, angle: number): Quaternion =>
  new Quaternion().setFromAxisAngle(axis, angle);

const headOf = (rig: Rig, name: string): Vector3 =>
  v3(rig.heads[rig.names.indexOf(name)] ?? [0, 0, 0]);

/**
 * The mesh's arm as the code-built figure's `Arm`: its shoulder, its bones'
 * lengths and its hang read from the mesh's rest joints, the hang solved so
 * `armChain`'s rest upper arm lies along the mesh's.
 */
export const meshArm = (rig: Rig, bones: ArmBones, like: Arm): Arm => {
  const shoulder = headOf(rig, bones.arm);
  const elbow = headOf(rig, bones.fore);
  const wrist = headOf(rig, bones.hand);
  const d = elbow.clone().sub(shoulder).normalize();
  return {
    ...like,
    shoulder: tuple(shoulder),
    upper: elbow.distanceTo(shoulder),
    fore: wrist.distanceTo(elbow),
    hang: [Math.asin(d.x), Math.atan2(-d.z, -d.y)],
  };
};

/**
 * One arm's three bones posed by `armChain`'s semantics, as turns from the
 * mesh's rest: the upper arm turns as the chain's upper arm does (about z by
 * the abduction, then about x by the raise); the forearm then bends by the
 * elbow about the chain's hinge (the twist turns the hinge, never the arm);
 * the hand bends by the wrist about the same hinge.
 */
const armPoses = (
  rig: Rig,
  bones: ArmBones,
  like: Arm,
  pose: ArmPose,
): ReadonlyArray<readonly [string, BonePose]> => {
  const arm = meshArm(rig, bones, like);
  const restUpper = about(X, arm.hang[1]).multiply(about(Z, arm.hang[0]));
  const upper = about(X, arm.hang[1] - pose.raise).multiply(
    about(Z, arm.hang[0] + bones.side * pose.abduct),
  );
  const upperTurn = upper.multiply(restUpper.invert());
  const hinge = armChain(arm, pose, bones.side).hinge;
  const foreTurn = about(hinge, pose.elbow).multiply(upperTurn);
  const handTurn = about(hinge, pose.wrist).multiply(foreTurn);
  const shoulder = headOf(rig, bones.arm);
  const elbowRest = headOf(rig, bones.fore);
  const wristRest = headOf(rig, bones.hand);
  const elbow = shoulder.clone().add(elbowRest.clone().sub(shoulder).applyQuaternion(upperTurn));
  const wrist = elbow.clone().add(wristRest.clone().sub(elbowRest).applyQuaternion(foreTurn));
  return [
    [bones.arm, { turn: upperTurn, from: shoulder, to: shoulder }],
    [bones.fore, { turn: foreTurn, from: elbowRest, to: elbow }],
    [bones.hand, { turn: handTurn, from: wristRest, to: wrist }],
  ];
};

/** The arms the code-built figure would pose, its right and left `Arm`, which lend the mesh's arms their hand size. */
export interface ArmsLike {
  readonly right: Arm;
  readonly left: Arm;
}

/** Every joint's pose for `pose`: the arms' bones as `armPoses` says, every other joint at rest. */
const bonePoses = (rig: Rig, arms: ArmsLike, pose: Pose): ReadonlyArray<BonePose> => {
  const posed = new Map([
    ...armPoses(rig, ARM_BONES.right, arms.right, pose.right),
    ...armPoses(rig, ARM_BONES.left, arms.left, pose.left),
  ]);
  return rig.names.map(
    (name, j) =>
      posed.get(name) ?? {
        turn: new Quaternion(),
        from: v3(rig.heads[j] ?? [0, 0, 0]),
        to: v3(rig.heads[j] ?? [0, 0, 0]),
      },
  );
};

/** One arm's posed joints. */
export const armJoints = (
  rig: Rig,
  arms: ArmsLike,
  pose: Pose,
  which: 'right' | 'left',
): ArmJoints => {
  const bones = ARM_BONES[which];
  const posed = new Map(armPoses(rig, bones, arms[which], pose[which]));
  const at = (name: string) => tuple(posed.get(name)?.to ?? headOf(rig, name));
  return { shoulder: at(bones.arm), elbow: at(bones.fore), wrist: at(bones.hand) };
};

/** A posed mesh: each vertex's position, and its blended turn as a quaternion (x, y, z, w) that carries a rest normal to the pose. */
export interface Skinned {
  readonly positions: Float32Array;
  readonly turns: Float32Array;
}

/**
 * The rig posed by linear blend skinning: each vertex is the weighted sum of
 * its joints' rigid moves (turn about the rest head, then carry the head to
 * its posed place); its turn is the weighted sum of the joints' quaternions,
 * each flipped onto the first's hemisphere, normalised.
 */
export const skin = (rig: Rig, arms: ArmsLike, pose: Pose): Skinned => {
  const bones = bonePoses(rig, arms, pose);
  const count = rig.positions.length / 3;
  const positions = new Float32Array(rig.positions.length);
  const turns = new Float32Array(count * 4);
  const scratch = { p: new Vector3(), moved: new Vector3(), sum: new Vector3() };
  for (let i = 0; i < count; i++) skinVertex(rig, bones, i, scratch, positions, turns);
  return { positions, turns };
};

/** One vertex skinned into `positions` and `turns`: its joints' weighted moves, and their quaternions blended on the first's hemisphere. */
const skinVertex = (
  rig: Rig,
  bones: ReadonlyArray<BonePose>,
  i: number,
  { p, moved, sum }: { readonly p: Vector3; readonly moved: Vector3; readonly sum: Vector3 },
  positions: Float32Array,
  turns: Float32Array,
): void => {
  p.fromArray(rig.positions, i * 3);
  sum.set(0, 0, 0);
  const q = new Quaternion(0, 0, 0, 0);
  let first = new Quaternion();
  let seen = false;
  for (let k = 0; k < 4; k++) {
    const w = rig.weights[i * 4 + k] ?? 0;
    const bone = bones[rig.joints[i * 4 + k] ?? 0];
    if (w <= 0 || !bone) continue;
    moved.copy(p).sub(bone.from).applyQuaternion(bone.turn).add(bone.to);
    sum.addScaledVector(moved, w);
    if (!seen) first = bone.turn;
    seen = true;
    const ws = w * (Math.sign(first.dot(bone.turn)) || 1);
    q.set(
      q.x + bone.turn.x * ws,
      q.y + bone.turn.y * ws,
      q.z + bone.turn.z * ws,
      q.w + bone.turn.w * ws,
    );
  }
  positions.set([sum.x, sum.y, sum.z], i * 3);
  if (!seen) q.identity();
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  turns.set([q.x / n, q.y / n, q.z / n, q.w / n], i * 4);
};

/**
 * Smooth vertex normals of a posed mesh: each vertex's area-weighted face
 * normals, then `rounds` rounds of averaging with its neighbours, so the
 * shade falls as one painted shape over the mesh's small relief.
 */
export const smoothNormals = (
  positions: Float32Array,
  indices: Uint32Array,
  rounds: number,
): Float32Array => {
  let cur = faceNormalSums(positions, indices);
  unit(cur);
  let next = new Float32Array(cur.length);
  for (let r = 0; r < rounds; r++) {
    next.set(cur);
    for (let f = 0; f < indices.length; f += 3) {
      const tri = [indices[f] ?? 0, indices[f + 1] ?? 0, indices[f + 2] ?? 0] as const;
      addEdge(next, cur, tri[0], tri[1]);
      addEdge(next, cur, tri[1], tri[2]);
      addEdge(next, cur, tri[2], tri[0]);
    }
    unit(next);
    [cur, next] = [next, cur];
  }
  return cur;
};

/** Each vertex's sum of its faces' normals, each as long as twice its face's area. */
const faceNormalSums = (positions: Float32Array, indices: Uint32Array) => {
  const sums = new Float32Array(positions.length);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let f = 0; f < indices.length; f += 3) {
    const tri = [indices[f] ?? 0, indices[f + 1] ?? 0, indices[f + 2] ?? 0];
    a.fromArray(positions, (tri[0] ?? 0) * 3);
    b.fromArray(positions, (tri[1] ?? 0) * 3);
    c.fromArray(positions, (tri[2] ?? 0) * 3);
    const n = c.sub(b).cross(a.sub(b));
    for (const v of tri)
      for (let j = 0; j < 3; j++) sums[v * 3 + j] = (sums[v * 3 + j] ?? 0) + n.getComponent(j);
  }
  return sums;
};

/** Each vertex of an edge takes its neighbour's normal from `cur` into `next`. */
const addEdge = (next: Float32Array, cur: Float32Array, x: number, y: number): void => {
  for (let j = 0; j < 3; j++) {
    next[x * 3 + j] = (next[x * 3 + j] ?? 0) + (cur[y * 3 + j] ?? 0);
    next[y * 3 + j] = (next[y * 3 + j] ?? 0) + (cur[x * 3 + j] ?? 0);
  }
};

/** Every triple of `arr` scaled to unit length, in place (a zero triple stays zero). */
const unit = (arr: Float32Array): void => {
  for (let i = 0; i < arr.length; i += 3) {
    const l = Math.hypot(arr[i] ?? 0, arr[i + 1] ?? 0, arr[i + 2] ?? 0) || 1;
    arr[i] = (arr[i] ?? 0) / l;
    arr[i + 1] = (arr[i + 1] ?? 0) / l;
    arr[i + 2] = (arr[i + 2] ?? 0) / l;
  }
};
