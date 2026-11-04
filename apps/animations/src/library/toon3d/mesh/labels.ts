import { Vector2, Vector3 } from 'three';
import type { Plane, Vec3 } from '../spec.ts';

/**
 * A curve around an upright axis through `axis` (x, z): its height at each
 * knot's azimuth, in degrees from the front (+z) to the back (180), the same
 * on both sides. Between two knots the height eases (smoothstep), so the
 * curve has no corner.
 */
export interface AzimuthCurve {
  readonly axis: readonly [number, number];
  readonly knots: ReadonlyArray<readonly [degrees: number, height: number]>;
}

/**
 * A member's mesh labels as authored rules over its rest positions (head
 * units, soles at y 0), so every edge is the curve of a plane or an azimuth
 * curve and the labels move with the skinning:
 * - `hairline`: hair above it;
 * - `neckline`: skin (head and neck) above it, below the hairline;
 * - `hand`: an arm's skin where its hand bone's weight leads every other
 *   bone's by more than this;
 * - `mantle`: the mantle on the positive side of every `edges` plane and of
 *   the `hem` plane;
 * - `ankle`: sandal on its positive side;
 * - `bulge`: the mesh's own sash bulge, tunic on the positive side of both
 *   its planes even where the mantle's rule holds, since the sash is
 *   authored geometry laid over it.
 * Everything else is tunic.
 */
export interface MeshLabels {
  readonly hairline: AzimuthCurve;
  readonly neckline: AzimuthCurve;
  readonly hand: number;
  readonly mantle: { readonly edges: ReadonlyArray<Plane>; readonly hem: Plane };
  readonly ankle: Plane;
  readonly bulge: { readonly top: Plane; readonly bottom: Plane };
}

/** A mesh label, as the shader's slots count them. */
export const MESH_LABEL = { skin: 0, hair: 1, tunic: 2, mantle: 3, sandal: 4 } as const;

export type MeshLabel = keyof typeof MESH_LABEL;

/** The most knots an azimuth curve has, and the most mantle edges: the shader's array sizes. */
export const MAX_KNOTS = 8;
export const MAX_EDGES = 2;

/** `p`'s azimuth about `axis`, in degrees from +z, 0 to 180 on either side. */
export const azimuthOf = (axis: readonly [number, number], p: Vec3): number =>
  Math.abs((Math.atan2(p[0] - axis[0], p[2] - axis[1]) * 180) / Math.PI);

/** The curve's height at `degrees`: the knots' heights eased between them, held past the first and the last. */
export const heightAt = (curve: AzimuthCurve, degrees: number): number => {
  const knots = curve.knots;
  const first = knots[0] ?? [0, 0];
  if (degrees <= first[0]) return first[1];
  for (let i = 1; i < knots.length; i++) {
    const [a0, h0] = knots[i - 1] ?? first;
    const [a1, h1] = knots[i] ?? first;
    if (degrees <= a1) {
      const t = (degrees - a0) / (a1 - a0);
      return h0 + (h1 - h0) * t * t * (3 - 2 * t);
    }
  }
  return (knots[knots.length - 1] ?? first)[1];
};

/** How far `p` lies on the plane's normal side of it. */
export const sideOf = (plane: Plane, p: Vec3): number =>
  (p[0] - plane.point[0]) * plane.normal[0] +
  (p[1] - plane.point[1]) * plane.normal[1] +
  (p[2] - plane.point[2]) * plane.normal[2];

/** The body label (not an arm's) at rest position `p`, by the rules in their order: hair, skin, sandal, the sash bulge's tunic, mantle, tunic. */
export const bodyLabelAt = (rules: MeshLabels, p: Vec3): MeshLabel => {
  if (p[1] > heightAt(rules.hairline, azimuthOf(rules.hairline.axis, p))) return 'hair';
  if (p[1] > heightAt(rules.neckline, azimuthOf(rules.neckline.axis, p))) return 'skin';
  if (sideOf(rules.ankle, p) > 0) return 'sandal';
  if (sideOf(rules.bulge.top, p) > 0 && sideOf(rules.bulge.bottom, p) > 0) return 'tunic';
  const { edges, hem } = rules.mantle;
  if (sideOf(hem, p) > 0 && edges.every((e) => sideOf(e, p) > 0)) return 'mantle';
  return 'tunic';
};

/** An arm's label from its hand bone's lead over the vertex's other bones: skin (the hand) past the rule's lead, else the sleeve's cloth. */
export const isHand = (rules: MeshLabels, handLead: number): boolean => handLead > rules.hand;

/**
 * The GLSL of the rules: `bodyLabel(p)` returns a `MESH_LABEL` for rest
 * position `p`, the same as `bodyLabelAt`. Its uniforms come from
 * `labelUniforms`.
 */
export const LABEL_GLSL = `
uniform vec2 uHairAxis;
uniform vec2 uHairKnots[${MAX_KNOTS}];
uniform int uHairCount;
uniform vec2 uNeckAxis;
uniform vec2 uNeckKnots[${MAX_KNOTS}];
uniform int uNeckCount;
uniform vec3 uEdgeP[${MAX_EDGES}];
uniform vec3 uEdgeN[${MAX_EDGES}];
uniform int uEdgeCount;
uniform vec3 uHemP;
uniform vec3 uHemN;
uniform vec3 uAnkleP;
uniform vec3 uAnkleN;
uniform vec3 uBulgeTopP;
uniform vec3 uBulgeTopN;
uniform vec3 uBulgeBottomP;
uniform vec3 uBulgeBottomN;

float azimuthOf(vec2 axis, vec3 p) {
  return abs(degrees(atan(p.x - axis.x, p.z - axis.y)));
}

float heightAt(vec2 knots[${MAX_KNOTS}], int count, float a) {
  if (a <= knots[0].x) return knots[0].y;
  for (int i = 1; i < ${MAX_KNOTS}; i++) {
    if (i >= count) break;
    if (a <= knots[i].x) {
      float t = (a - knots[i - 1].x) / (knots[i].x - knots[i - 1].x);
      return mix(knots[i - 1].y, knots[i].y, t * t * (3.0 - 2.0 * t));
    }
  }
  return knots[count - 1].y;
}

int bodyLabel(vec3 p) {
  if (p.y > heightAt(uHairKnots, uHairCount, azimuthOf(uHairAxis, p))) return ${MESH_LABEL.hair};
  if (p.y > heightAt(uNeckKnots, uNeckCount, azimuthOf(uNeckAxis, p))) return ${MESH_LABEL.skin};
  if (dot(p - uAnkleP, uAnkleN) > 0.0) return ${MESH_LABEL.sandal};
  if (dot(p - uBulgeTopP, uBulgeTopN) > 0.0 && dot(p - uBulgeBottomP, uBulgeBottomN) > 0.0) return ${MESH_LABEL.tunic};
  bool mantle = dot(p - uHemP, uHemN) > 0.0;
  for (int i = 0; i < ${MAX_EDGES}; i++) {
    if (i < uEdgeCount && dot(p - uEdgeP[i], uEdgeN[i]) <= 0.0) mantle = false;
  }
  if (mantle) return ${MESH_LABEL.mantle};
  return ${MESH_LABEL.tunic};
}
`;

const vec3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

/** A fixed-length array of `size`, `items` then copies of the last item. */
const padded = <A>(items: ReadonlyArray<A>, size: number, fill: A): Array<A> =>
  Array.from({ length: size }, (_, i) => items[Math.min(i, items.length - 1)] ?? fill);

const knotUniforms = (curve: AzimuthCurve) =>
  padded(
    curve.knots.map(([a, h]) => new Vector2(a, h)),
    MAX_KNOTS,
    new Vector2(0, 0),
  );

/** The uniforms `LABEL_GLSL` reads, for `rules`. */
export const labelUniforms = (rules: MeshLabels) => ({
  uHairAxis: { value: new Vector2(...rules.hairline.axis) },
  uHairKnots: { value: knotUniforms(rules.hairline) },
  uHairCount: { value: rules.hairline.knots.length },
  uNeckAxis: { value: new Vector2(...rules.neckline.axis) },
  uNeckKnots: { value: knotUniforms(rules.neckline) },
  uNeckCount: { value: rules.neckline.knots.length },
  uEdgeP: {
    value: padded(
      rules.mantle.edges.map((e) => vec3(e.point)),
      MAX_EDGES,
      new Vector3(),
    ),
  },
  uEdgeN: {
    value: padded(
      rules.mantle.edges.map((e) => vec3(e.normal)),
      MAX_EDGES,
      new Vector3(),
    ),
  },
  uEdgeCount: { value: rules.mantle.edges.length },
  uHemP: { value: vec3(rules.mantle.hem.point) },
  uHemN: { value: vec3(rules.mantle.hem.normal) },
  uAnkleP: { value: vec3(rules.ankle.point) },
  uAnkleN: { value: vec3(rules.ankle.normal) },
  uBulgeTopP: { value: vec3(rules.bulge.top.point) },
  uBulgeTopN: { value: vec3(rules.bulge.top.normal) },
  uBulgeBottomP: { value: vec3(rules.bulge.bottom.point) },
  uBulgeBottomN: { value: vec3(rules.bulge.bottom.normal) },
});
