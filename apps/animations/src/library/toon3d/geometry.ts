import { BufferGeometry, Float32BufferAttribute, SphereGeometry, Vector3 } from 'three';
import type { Section, Vec3 } from './spec.ts';

/** `sign(v) * |v|^p`: the superellipse's bend of a cosine or a sine. */
const signedPow = (v: number, p: number): number => Math.sign(v) * Math.abs(v) ** p;

/** The Catmull-Rom point between `b` and `c` at `t`, with `a` and `d` the neighbours. */
const catmull = (a: number, b: number, c: number, d: number, t: number): number =>
  0.5 *
  (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

/** Sections smoothed by a Catmull-Rom spline through each column, `per` rings to a span. */
export const resample = (sections: ReadonlyArray<Section>, per: number): ReadonlyArray<Section> => {
  const at = (i: number): Section =>
    sections[Math.min(sections.length - 1, Math.max(0, i))] ?? [0, 0, 0, 0, 2];
  const out: Array<Section> = [];
  for (let i = 0; i < sections.length - 1; i++)
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      const col = (j: 0 | 1 | 2 | 3 | 4) => catmull(a[j], b[j], c[j], d[j], t);
      out.push([
        col(0),
        Math.max(0.001, col(1)),
        Math.max(0.001, col(2)),
        col(3),
        Math.max(1.2, col(4)),
      ]);
    }
  out.push(at(sections.length - 1));
  return out;
};

/** The section at height `y`, read linearly between the two around it. */
export const sectionAt = (sections: ReadonlyArray<Section>, y: number): Section => {
  const first = sections[0] ?? [0, 0, 0, 0, 2];
  let found: Section = first;
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i] ?? first;
    const b = sections[i + 1] ?? first;
    if (y >= a[0] && y <= b[0]) {
      const t = (y - a[0]) / Math.max(1e-6, b[0] - a[0]);
      found = [
        y,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
        a[4] + (b[4] - a[4]) * t,
      ];
    }
  }
  return found;
};

/** A geometry from flat position and index arrays, with smooth normals. */
const meshOf = (
  positions: ReadonlyArray<number>,
  indices: ReadonlyArray<number>,
): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex([...indices]);
  g.computeVertexNormals();
  return g;
};

/**
 * A closed loft: one superellipse ring per smoothed section, `around` points to
 * a ring, capped at both ends with a fan to the ring's centre.
 */
export const loft = (
  sections: ReadonlyArray<Section>,
  around: number,
  per: number,
): BufferGeometry => {
  const rings = resample(sections, per);
  const positions: Array<number> = [];
  const indices: Array<number> = [];
  for (const [y, w, d, cz, n] of rings)
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      positions.push(w * signedPow(Math.cos(a), 2 / n), y, cz + d * signedPow(Math.sin(a), 2 / n));
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      indices.push(a, a + around, b, b, a + around, b + around);
    }
  const capAt = (ring: number, flip: boolean) => {
    const [y, , , cz] = rings[ring] ?? [0, 0, 0, 0, 2];
    const centre = positions.length / 3;
    positions.push(0, y, cz);
    for (let j = 0; j < around; j++) {
      const a = ring * around + j;
      const b = ring * around + ((j + 1) % around);
      if (flip) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  };
  capAt(0, false);
  capAt(rings.length - 1, true);
  return meshOf(positions, indices);
};

/** An ellipsoid of the given radii round `centre`. */
export const ellipsoid = (centre: Vec3, radii: Vec3, segments: number): BufferGeometry => {
  const g = new SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.6)));
  g.scale(radii[0], radii[1], radii[2]);
  g.translate(centre[0], centre[1], centre[2]);
  return g;
};

/** Many geometries as one: positions, normals and indices concatenated. */
export const merge = (parts: ReadonlyArray<BufferGeometry>): BufferGeometry => {
  const positions: Array<number> = [];
  const normals: Array<number> = [];
  const indices: Array<number> = [];
  for (const g of parts) {
    const base = positions.length / 3;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) indices.push(base + i);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  out.setIndex(indices);
  return out;
};

/** A centreline sample of a sleeve: where it is, which way it runs and how wide it is there. */
export interface SweepPoint {
  readonly centre: Vector3;
  readonly tangent: Vector3;
  readonly radius: number;
}

/**
 * Fills `geometry` with a round tube along `points`, each ring square to its
 * tangent in the frame `axis` (the bend's hinge) fixes, capped at both ends.
 * The ring count and size never change, so a posed sleeve reuses one buffer.
 */
export const sweep = (
  geometry: BufferGeometry,
  points: ReadonlyArray<SweepPoint>,
  axis: Vector3,
  around: number,
): void => {
  const positions: Array<number> = [];
  const indices: Array<number> = [];
  const side = new Vector3();
  const up = new Vector3();
  for (const p of points) {
    side.copy(axis).addScaledVector(p.tangent, -axis.dot(p.tangent)).normalize();
    up.crossVectors(p.tangent, side).normalize();
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      positions.push(
        p.centre.x + p.radius * (Math.cos(a) * side.x + Math.sin(a) * up.x),
        p.centre.y + p.radius * (Math.cos(a) * side.y + Math.sin(a) * up.y),
        p.centre.z + p.radius * (Math.cos(a) * side.z + Math.sin(a) * up.z),
      );
    }
  }
  for (let i = 0; i < points.length - 1; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      indices.push(a, b, a + around, b, b + around, a + around);
    }
  const cap = (ring: number, flip: boolean) => {
    const c = points[ring]?.centre ?? new Vector3();
    const centre = positions.length / 3;
    positions.push(c.x, c.y, c.z);
    for (let j = 0; j < around; j++) {
      const a = ring * around + j;
      const b = ring * around + ((j + 1) % around);
      if (flip) indices.push(centre, a, b);
      else indices.push(centre, b, a);
    }
  };
  cap(0, false);
  cap(points.length - 1, true);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
};
