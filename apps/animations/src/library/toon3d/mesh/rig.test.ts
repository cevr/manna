import { describe, expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { armChain } from '../figure.ts';
import { leadFeast } from '../lead-feast.ts';
import { REST, REST_ARM, type Pose, type Vec3 } from '../spec.ts';
import { ARM_BONES, armJoints, meshArm, skin, type Rig } from './rig.ts';

const NAMES = [
  'Hips',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
];

const SHOULDER_R: Vec3 = [-0.6, 2.2, 0.02];
const ELBOW_R: Vec3 = [-0.72, 1.52, -0.04];

/** The joints' rest heads: the hips, then each arm's shoulder, elbow and wrist, the left mirroring the right. */
const headsWith = (wristR: Vec3): ReadonlyArray<Vec3> => {
  const right = [SHOULDER_R, ELBOW_R, wristR];
  const left = right.map((h): Vec3 => [-h[0], h[1], h[2]]);
  return [[0, 1.5, 0], ...right, ...left];
};

/**
 * A rig with one vertex at each joint's head, weighted wholly to that joint,
 * and one on the belly weighted to the hips.
 */
const rigOf = (heads: ReadonlyArray<Vec3>): Rig => {
  const points: ReadonlyArray<readonly [Vec3, number]> = [
    ...heads.map((h, j) => [h, j] as const),
    [[0.1, 1.2, 0.3], 0],
  ];
  const joints = new Uint16Array(points.length * 4);
  const weights = new Float32Array(points.length * 4);
  points.forEach(([, j], v) => {
    joints[v * 4] = j;
    weights[v * 4] = 1;
  });
  return {
    positions: Float32Array.from(points.flatMap(([p]) => [...p])),
    joints,
    weights,
    names: NAMES,
    heads,
  };
};

/** Meshy's arms hang with the elbow a little bent at rest (the lead's: 11° right, 9° left). */
const BENT = rigOf(headsWith([-0.78, 0.92, 0.03]));

/** The same arms with each wrist on the line of its upper arm. */
const STRAIGHT = rigOf(headsWith([-0.822, 0.942, -0.091]));

const ARMS = leadFeast.arms;

const v3 = (v: Vec3) => new Vector3(v[0], v[1], v[2]);

const vertex = (positions: Float32Array, v: number) =>
  new Vector3(positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0);

const rightPose = (right: Partial<typeof REST_ARM>): Pose => ({
  right: { ...REST_ARM, ...right },
  left: REST_ARM,
});

const DEG = Math.PI / 180;

const BELLY = NAMES.length;

describe('skin', () => {
  test('the rest pose leaves every vertex where it is and turns no normal', () => {
    const posed = skin(BENT, ARMS, REST);
    BENT.positions.forEach((p, i) => expect(posed.positions[i] ?? NaN).toBeCloseTo(p, 6));
    for (let v = 0; v < BENT.positions.length / 3; v++)
      expect(Math.abs(posed.turns[v * 4 + 3] ?? 0)).toBeCloseTo(1, 6);
  });

  test('a hips-only vertex stays put while both arms move', () => {
    const pose: Pose = {
      right: { raise: 1.1, abduct: 0.6, elbow: 1.9, wrist: 0.4, twist: 0.7 },
      left: { raise: 0.5, abduct: 0.9, elbow: 1.2, wrist: 0.2, twist: -0.3 },
    };
    const posed = skin(BENT, ARMS, pose);
    for (const v of [0, BELLY])
      expect(vertex(posed.positions, v).distanceTo(vertex(BENT.positions, v))).toBeLessThan(1e-6);
  });

  test("a bone's head vertex is carried to its posed joint", () => {
    const pose = rightPose({ raise: 0.4, abduct: 0.3, elbow: 110 * DEG, twist: 0.5 });
    const posed = skin(BENT, ARMS, pose);
    const joints = armJoints(BENT, ARMS, pose, 'right');
    expect(vertex(posed.positions, 2).distanceTo(v3(joints.elbow))).toBeLessThan(1e-5);
    expect(vertex(posed.positions, 3).distanceTo(v3(joints.wrist))).toBeLessThan(1e-5);
  });
});

describe('armJoints', () => {
  test("a 110° elbow turns the bent rest forearm 110° about the chain's hinge, keeping both bones' lengths", () => {
    const pose = rightPose({ elbow: 110 * DEG });
    const j = armJoints(BENT, ARMS, pose, 'right');
    const hinge = armChain(meshArm(BENT, ARM_BONES.right, ARMS.right), pose.right, -1).hinge;
    const restUpper = v3(ELBOW_R).sub(v3(SHOULDER_R));
    const restFore = v3(BENT.heads[3] ?? [0, 0, 0]).sub(v3(ELBOW_R));
    const upper = v3(j.elbow).sub(v3(j.shoulder));
    const fore = v3(j.wrist).sub(v3(j.elbow));
    expect(upper.length()).toBeCloseTo(restUpper.length(), 6);
    expect(fore.length()).toBeCloseTo(restFore.length(), 6);
    expect(fore.distanceTo(restFore.applyAxisAngle(hinge, 110 * DEG))).toBeLessThan(1e-6);
  });

  test('a 110° elbow on a straight rest arm opens the bones 110°', () => {
    const j = armJoints(STRAIGHT, ARMS, rightPose({ elbow: 110 * DEG }), 'right');
    const upper = v3(j.elbow).sub(v3(j.shoulder));
    const fore = v3(j.wrist).sub(v3(j.elbow));
    expect(upper.angleTo(fore) / DEG).toBeCloseTo(110, 2);
  });

  test("the posed joints are armChain's for the mesh's arm, on each side", () => {
    const arm = { raise: 0.4, abduct: 0.3, elbow: 1.2, wrist: 0.1, twist: 0.5 };
    const pose: Pose = { right: arm, left: arm };
    for (const which of ['right', 'left'] as const) {
      const bones = ARM_BONES[which];
      const bent = armChain(meshArm(BENT, bones, ARMS[which]), arm, bones.side);
      expect(v3(armJoints(BENT, ARMS, pose, which).elbow).distanceTo(bent.elbow)).toBeLessThan(
        1e-6,
      );
      const straight = armChain(meshArm(STRAIGHT, bones, ARMS[which]), arm, bones.side);
      const j = armJoints(STRAIGHT, ARMS, pose, which);
      expect(v3(j.elbow).distanceTo(straight.elbow)).toBeLessThan(1e-6);
      expect(v3(j.wrist).distanceTo(straight.wrist)).toBeLessThan(1e-6);
    }
  });
});
