import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Group,
  Mesh,
  Quaternion,
  Vector3,
  type ShaderMaterial,
} from 'three';
import { ellipsoid, loft, merge, resample, sectionAt, sweep, type SweepPoint } from './geometry.ts';
import { toonMaterial, type PartLook } from './shader.ts';
import type { Arm, ArmPose, MemberSpec, Pose, Section, Vec3 } from './spec.ts';

/** Each part's id in the id pass: the ink pass draws a line where two ids meet as `INK_PAIRS` says. */
export const PART = {
  paper: 0,
  hair: 1,
  head: 2,
  ear: 3,
  neck: 4,
  body: 5,
  mantle: 6,
  sash: 7,
  sleeveR: 8,
  sleeveL: 9,
  handR: 10,
  handL: 11,
  foot: 12,
  shadow: 13,
  knot: 14,
  endR: 15,
  endL: 16,
} as const;

export type PartName = keyof typeof PART;

/** How the ink pass treats two ids that meet: no line, the silhouette's width, an inner line, or an inner line only where the depths part (an arm in front of the body, never where it joins). */
export type InkClass = 'none' | 'outline' | 'inner' | 'gap';

/** The pairs the concept draws no line between, or draws only across a depth gap; every other pair of figure parts is an inner line. */
const PAIR_RULES: ReadonlyArray<readonly [PartName, PartName, InkClass]> = [
  ['hair', 'head', 'none'],
  ['neck', 'body', 'none'],
  ['neck', 'mantle', 'none'],
  ['body', 'mantle', 'none'],
  ['sleeveR', 'body', 'gap'],
  ['sleeveR', 'mantle', 'gap'],
  ['sleeveR', 'sash', 'gap'],
  ['sleeveL', 'body', 'gap'],
  ['sleeveL', 'mantle', 'gap'],
  ['sleeveL', 'sash', 'gap'],
];

const GROUND = new Set<number>([PART.paper, PART.shadow]);

/** The ink class where ids `a` and `b` meet. */
export const inkClass = (a: number, b: number): InkClass => {
  if (a === b) return 'none';
  if (GROUND.has(a) && GROUND.has(b)) return 'none';
  if (GROUND.has(a) || GROUND.has(b)) return 'outline';
  const rule = PAIR_RULES.find(
    ([x, y]) => (PART[x] === a && PART[y] === b) || (PART[x] === b && PART[y] === a),
  );
  return (rule && rule[2]) || 'inner';
};

/** A code-built figure: its root (turned by `yaw`), its parts and the call that poses its arms. */
export interface Figure {
  readonly root: Group;
  readonly materials: ReadonlyArray<ShaderMaterial>;
  readonly pose: (pose: Pose) => void;
  readonly turn: (yaw: number) => void;
  /** 0 the toon colour, 1 the part ids and depths. */
  readonly mode: (mode: 0 | 1) => void;
}

const v3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);
const DOWN = new Vector3(0, -1, 0);
const FORWARD = new Vector3(0, 0, 1);

/** The curls' places on the hair shell: a golden-angle spiral over the cap above the hairline, each pushed out by `lift`. */
const curlCentres = (spec: MemberSpec): ReadonlyArray<Vec3> => {
  const hair = spec.hair;
  const rings = resample(hair.sections, 4);
  const top = (rings[rings.length - 1] ?? [3.4, 0, 0, 0, 2])[0];
  const lineAt = (a: number): number => {
    const t = Math.abs(a) / (Math.PI / 2);
    if (t <= 1) return hair.line[0] + (hair.line[1] - hair.line[0]) * t;
    return hair.line[1] + (hair.line[2] - hair.line[1]) * (t - 1);
  };
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Array<Vec3> = [];
  for (let i = 0; i < hair.curls.count; i++) {
    const a = ((i * golden) % (Math.PI * 2)) - Math.PI;
    const u = (i + 0.5) / hair.curls.count;
    const line = lineAt(a) + hair.curls.radius * 0.2;
    const y = top - (top - line) * Math.sqrt(u);
    const [, w, d, cz, n] = sectionAt(rings, y);
    const s = Math.sin(a);
    const c = Math.cos(a);
    const px = w * Math.sign(s) * Math.abs(s) ** (2 / n);
    const pz = d * Math.sign(c) * Math.abs(c) ** (2 / n);
    const out2 = new Vector3(px, 0, pz).normalize().multiplyScalar(hair.curls.lift);
    out.push([px + out2.x, y + hair.curls.lift * 0.5, cz + pz + out2.z]);
  }
  return out;
};

/** A flat strip from `top` to `bottom`, `width` across and a little thick, facing +z. */
const strip = (top: Vec3, bottom: Vec3, width: number): BufferGeometry => {
  const a = v3(top);
  const b = v3(bottom);
  const along = b.clone().sub(a);
  const g = new BoxGeometry(width, along.length(), 0.03);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(DOWN, along.clone().normalize()));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
};

/** The sash's band: the body's sections at the band's top and bottom, swollen out by `swell`. */
const band = (spec: MemberSpec): BufferGeometry => {
  const { y, height, swell } = spec.sash;
  const at = (yy: number): Section => {
    const [, w, d, cz, n] = sectionAt(spec.body.sections, yy);
    return [yy, w + swell, d + swell, cz, n];
  };
  return loft([at(y - height / 2), at(y), at(y + height / 2)], 64, 2);
};

/** Rotates `v` about the unit `axis` by `angle`. */
const turned = (v: Vector3, axis: Vector3, angle: number): Vector3 =>
  v.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle));

const UPPER_RINGS = 10;
const ELBOW_RINGS = 14;
const FORE_RINGS = 12;
const AROUND = 28;

/** One arm posed: the sleeve's centreline (straight, a round elbow arc, straight), its hinge and the hand's centre. */
export interface ArmChain {
  readonly points: ReadonlyArray<SweepPoint>;
  readonly hinge: Vector3;
  readonly hand: Vector3;
}

/**
 * An arm's centreline for a pose: the upper arm hangs from the shoulder, the
 * forearm turns about the elbow's hinge, and the corner between them is a
 * circular arc a little wider than the sleeve, so the rings carried along it
 * never cross and the sleeve keeps its width through the bend.
 */
export const armChain = (arm: Arm, pose: ArmPose, side: 1 | -1): ArmChain => {
  const shoulder = v3(arm.shoulder);
  const upper = turned(
    turned(DOWN, Z, arm.hang[0] + side * pose.abduct),
    X,
    arm.hang[1] - pose.raise,
  );
  const hinge = turned(new Vector3().crossVectors(upper, FORWARD).normalize(), upper, pose.twist);
  const fore = turned(upper, hinge, pose.elbow);
  const elbow = shoulder.clone().addScaledVector(upper, arm.upper);
  const wrist = elbow.clone().addScaledVector(fore, arm.fore);
  const bend = upper.angleTo(fore);
  const wanted = arm.radii[1] * 1.08;
  const reach = Math.min(arm.upper, arm.fore) * 0.6;
  const t = Math.min(wanted * Math.tan(bend / 2), reach);
  const radius = t / Math.max(1e-6, Math.tan(bend / 2));
  const start = elbow.clone().addScaledVector(upper, -t);
  const end = elbow.clone().addScaledVector(fore, t);
  const inward = fore.clone().addScaledVector(upper, -fore.dot(upper));
  const centre = start.clone().addScaledVector(inward.normalize(), radius);
  const axis = new Vector3().crossVectors(upper, fore).normalize();
  const total = arm.upper - t + radius * bend + (arm.fore - t);
  const points: Array<SweepPoint> = [];
  const radiusAt = (s: number): number => {
    const e = (arm.upper - t + (radius * bend) / 2) / total;
    const u = s / total;
    if (u <= e) return arm.radii[0] + (arm.radii[1] - arm.radii[0]) * (u / e);
    return arm.radii[1] + (arm.radii[2] - arm.radii[1]) * ((u - e) / (1 - e)) ** 2;
  };
  for (let i = 0; i < UPPER_RINGS; i++) {
    const s = ((arm.upper - t) * i) / UPPER_RINGS;
    points.push({
      centre: shoulder.clone().addScaledVector(upper, s),
      tangent: upper.clone(),
      radius: radiusAt(s),
    });
  }
  const onArc = (k: number): Vector3 => {
    if (bend < 1e-4) return start.clone();
    return centre.clone().add(turned(start.clone().sub(centre), axis, bend * k));
  };
  const tangentAt = (k: number): Vector3 => {
    if (bend < 1e-4) return upper.clone();
    return turned(upper, axis, bend * k);
  };
  for (let i = 0; i < ELBOW_RINGS; i++) {
    const k = i / (ELBOW_RINGS - 1);
    points.push({
      centre: onArc(k),
      tangent: tangentAt(k),
      radius: radiusAt(arm.upper - t + radius * bend * k),
    });
  }
  for (let i = 1; i <= FORE_RINGS; i++) {
    const s = arm.upper - t + radius * bend + ((arm.fore - t) * i) / FORE_RINGS;
    points.push({
      centre: end.clone().addScaledVector(fore, ((arm.fore - t) * i) / FORE_RINGS),
      tangent: fore.clone(),
      radius: radiusAt(s),
    });
  }
  const handDir = turned(fore, hinge, pose.wrist);
  return {
    points,
    hinge,
    hand: wrist.clone().addScaledVector(handDir, arm.hand * 0.75),
  };
};

/**
 * Builds a member as a code-built toon figure: every volume from the spec's
 * numbers (lofts for head, hair, neck and body, swept tubes for the sleeves,
 * spheres for hands, ellipsoids for ears and feet), each part with its own
 * toon material and id.
 */
export const buildFigure = (spec: MemberSpec): Figure => {
  const root = new Group();
  const turn = new Group();
  root.add(turn);
  const materials: Array<ShaderMaterial> = [];
  const headProxy = spec.head.proxy;
  const add = (geometry: BufferGeometry, look: PartLook, parent: Group): Mesh => {
    const material = toonMaterial(spec, look);
    materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  };
  const plain = (id: number, paint: PartLook['paint'], proxy: PartLook['proxy']): PartLook => ({
    id,
    paint,
    proxy,
    region: { kind: 'none' },
    shaded: false,
  });
  const p = spec.paints;
  const surface = { kind: 'surface', centre: [0, 0, 0] } as const;

  add(
    loft(spec.head.sections, 64, 6),
    {
      ...plain(PART.head, p.skin, headProxy),
      region: { kind: 'face', face: spec.head.face, ink: spec.ink.colour },
    },
    turn,
  );
  const ears = spec.head.ears;
  add(
    merge([
      ellipsoid([-ears.x, ears.y, ears.z], ears.radii, 16),
      ellipsoid([ears.x, ears.y, ears.z], ears.radii, 16),
    ]),
    plain(PART.ear, p.skin, headProxy),
    turn,
  );
  const hairCentreZ = (spec.hair.sections[0] ?? [0, 0, 0, 0, 2])[3];
  add(
    loft(spec.hair.sections, 64, 6),
    {
      ...plain(PART.hair, p.hair, headProxy),
      region: { kind: 'hairline', line: spec.hair.line, centreZ: hairCentreZ },
    },
    turn,
  );
  add(
    merge(
      curlCentres(spec).map((c) =>
        ellipsoid(c, [spec.hair.curls.radius, spec.hair.curls.radius, spec.hair.curls.radius], 10),
      ),
    ),
    plain(PART.hair, p.hair, headProxy),
    turn,
  );
  add(loft(spec.neck, 32, 2), { ...plain(PART.neck, p.skin, surface), shaded: true }, turn);
  add(
    loft(spec.body.sections, 72, 6),
    {
      ...plain(PART.body, p.tunic, spec.body.proxy),
      region: {
        kind: 'mantle',
        edge: spec.mantle.edge,
        hem: spec.mantle.hem,
        paint: p.mantle,
        id: PART.mantle,
      },
    },
    turn,
  );
  add(band(spec), plain(PART.sash, p.sash, spec.body.proxy), turn);
  add(
    ellipsoid(
      spec.sash.knot.offset,
      [spec.sash.knot.radius * 1.15, spec.sash.knot.radius, spec.sash.knot.radius * 0.7],
      20,
    ),
    plain(PART.knot, p.sash, surface),
    turn,
  );
  spec.sash.ends.forEach((end, i) =>
    add(
      strip(end.top, end.bottom, end.width),
      plain([PART.endR, PART.endL][i] ?? PART.endL, p.sash, surface),
      turn,
    ),
  );

  const sleeves = [
    {
      arm: spec.arms.right,
      side: -1 as const,
      id: PART.sleeveR,
      hand: PART.handR,
      key: 'right' as const,
    },
    {
      arm: spec.arms.left,
      side: 1 as const,
      id: PART.sleeveL,
      hand: PART.handL,
      key: 'left' as const,
    },
  ].map((s) => {
    const geometry = new BufferGeometry();
    const tube = add(geometry, plain(s.id, p[s.arm.paint], surface), turn);
    add(
      ellipsoid(s.arm.shoulder, [s.arm.radii[0], s.arm.radii[0], s.arm.radii[0]], 20),
      plain(s.id, p[s.arm.paint], surface),
      turn,
    );
    const hand = add(
      ellipsoid([0, 0, 0], [s.arm.hand, s.arm.hand, s.arm.hand], 24),
      plain(s.hand, p.skin, { kind: 'sphere', centre: [0, 0, 0] }),
      turn,
    );
    return { ...s, geometry, tube, hand };
  });

  const feet = spec.feet;
  for (const x of [-feet.x, feet.x])
    add(
      ellipsoid([x, feet.radii[1], feet.z], feet.radii, 24),
      {
        ...plain(PART.foot, p.skin, surface),
        region: { kind: 'sandal', sole: feet.sole, strap: feet.strap, paint: p.sandal },
      },
      turn,
    );

  const shadow = new CircleGeometry(1, 48);
  shadow.scale(spec.shadow.radii[0], spec.shadow.radii[1], 1);
  shadow.translate(0, 0, -2);
  add(
    shadow,
    {
      ...plain(PART.shadow, { base: spec.shadow.colour, shade: spec.shadow.colour }, surface),
      region: { kind: 'ground' },
    },
    root,
  );

  const pose = (next: Pose): void => {
    for (const s of sleeves) {
      const chain = armChain(s.arm, next[s.key], s.side);
      sweep(s.geometry, chain.points, chain.hinge, AROUND);
      s.hand.position.copy(chain.hand);
    }
  };
  pose({
    right: { raise: 0, abduct: 0, elbow: 0, wrist: 0, twist: 0 },
    left: { raise: 0, abduct: 0, elbow: 0, wrist: 0, twist: 0 },
  });

  return {
    root,
    materials,
    pose,
    turn: (yaw) => {
      turn.rotation.y = yaw;
    },
    mode: (mode) => {
      for (const m of materials) {
        const u = m.uniforms['uMode'];
        if (u) u.value = mode;
      }
    },
  };
};
