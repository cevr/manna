import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { Face, Hex, MemberSpec, Paint, Plane, ShadeProxy, Vec3 } from './spec.ts';

/** What a part paints beyond its one paint: none, the mantle's region of the body, the hair's hairline, the face's marks, or the sandal's sole. */
export type Region =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'mantle';
      readonly edge: Plane;
      readonly hem: Plane;
      readonly paint: Paint;
      readonly id: number;
    }
  | { readonly kind: 'hairline'; readonly line: Vec3; readonly centreZ: number }
  | { readonly kind: 'face'; readonly face: Face; readonly ink: Hex }
  | {
      readonly kind: 'sandal';
      readonly sole: number;
      readonly strap: readonly [number, number];
      readonly paint: Paint;
    }
  | { readonly kind: 'ground' };

/** One part's paint, how its shade falls, its id in the id pass and what more it paints. */
export interface PartLook {
  readonly id: number;
  readonly paint: Paint;
  readonly proxy: ShadeProxy;
  readonly region: Region;
  /** A part the concept paints all in its shade (the neck under the jaw). */
  readonly shaded: boolean;
}

const REGION_CODE = { none: 0, mantle: 1, hairline: 2, face: 3, sandal: 4, ground: 5 } as const;
const PROXY_CODE = { surface: 0, sphere: 1, cylinder: 2 } as const;

const colour = (hex: Hex): Color => new Color().setStyle(hex, 'srgb-linear');
const vec3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);
const unit = (v: Vec3): Vector3 => vec3(v).normalize();

const VERTEX = `
varying vec3 vObj;
varying vec3 vNormalView;
varying vec3 vCamObj;
varying float vDepth;
void main() {
  vObj = position;
  vNormalView = normalize(normalMatrix * normal);
  vCamObj = normalize(vec3(0.0, 0.0, 1.0) * mat3(modelViewMatrix));
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = `
uniform mat3 normalMatrix;
uniform int uMode;
uniform float uId;
uniform vec3 uBase;
uniform vec3 uShade;
uniform vec3 uLight;
uniform float uThreshold;
uniform float uSoft;
uniform int uProxy;
uniform vec3 uProxyCentre;
uniform float uShaded;
uniform int uRegion;
uniform vec3 uEdgeP;
uniform vec3 uEdgeN;
uniform vec3 uHemP;
uniform vec3 uHemN;
uniform vec3 uBase2;
uniform vec3 uShade2;
uniform float uId2;
uniform vec3 uLine;
uniform float uCentreZ;
uniform vec4 uEyes[2];
uniform vec4 uBrows[2];
uniform vec2 uBrowSpan[2];
uniform vec4 uMouth;
uniform vec2 uMouthSpan;
uniform float uLean;
uniform vec3 uInk;
uniform vec2 uStrap;
uniform float uSole;
varying vec3 vObj;
varying vec3 vNormalView;
varying vec3 vCamObj;
varying float vDepth;

const float TAU = 6.28318530718;

vec3 proxyNormal() {
  if (uProxy == 1) return normalize(normalMatrix * normalize(vObj - uProxyCentre));
  if (uProxy == 2) {
    vec3 d = vObj - uProxyCentre;
    return normalize(normalMatrix * normalize(vec3(d.x, 0.0, d.z)));
  }
  return normalize(gl_FrontFacing ? vNormalView : -vNormalView);
}

float arcInk(vec2 q, vec4 arc, vec2 span) {
  vec2 d = q - arc.xy;
  float a = mod(atan(d.y, d.x), TAU);
  float from = mod(span.x, TAU);
  float to = from + mod(span.y - span.x, TAU);
  float inSpan = step(from, a) * step(a, to) + step(from, a + TAU) * step(a + TAU, to);
  float ring = step(abs(length(d) - arc.z), arc.w * 0.5) * min(inSpan, 1.0);
  vec2 e0 = arc.xy + arc.z * vec2(cos(span.x), sin(span.x));
  vec2 e1 = arc.xy + arc.z * vec2(cos(span.y), sin(span.y));
  float caps = step(length(q - e0), arc.w * 0.5) + step(length(q - e1), arc.w * 0.5);
  return min(ring + caps, 1.0);
}

float faceInk() {
  vec3 front = vec3(0.0, 0.0, 1.0);
  vec3 d = normalize(mix(front, vCamObj, uLean));
  if (d.z < 0.2) return 0.0;
  vec3 q = vObj - d * ((vObj.z - uCentreZ) / d.z);
  float ink = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 e = (q.xy - uEyes[i].xy) / uEyes[i].zw;
    ink += step(dot(e, e), 1.0);
    ink += arcInk(q.xy, uBrows[i], uBrowSpan[i]);
  }
  ink += arcInk(q.xy, uMouth, uMouthSpan);
  vec3 nObj = normalize(vObj - vec3(0.0, vObj.y, uCentreZ));
  return min(ink, 1.0) * step(0.15, dot(nObj, d));
}

float hairline() {
  float a = abs(atan(vObj.x, vObj.z - uCentreZ));
  float half_pi = 1.57079632679;
  float line = a < half_pi ? mix(uLine.x, uLine.y, a / half_pi) : mix(uLine.y, uLine.z, (a - half_pi) / half_pi);
  return line;
}

void main() {
  vec3 base = uBase;
  vec3 shade = uShade;
  float id = uId;
  if (uRegion == 1) {
    float inEdge = dot(vObj - uEdgeP, uEdgeN);
    float inHem = dot(vObj - uHemP, uHemN);
    if (inEdge > 0.0 && inHem > 0.0) {
      base = uBase2;
      shade = uShade2;
      id = uId2;
    }
  }
  if (uRegion == 2 && vObj.y < hairline()) discard;
  if (uRegion == 4) {
    if (vObj.y < 0.0) discard;
    if (vObj.y < uSole || (vObj.y > uStrap.x && vObj.y < uStrap.y)) {
      base = uBase2;
      shade = uShade2;
    }
  }
  if (uMode == 1) {
    gl_FragColor = vec4(id / 255.0, vDepth, 0.0, 1.0);
    return;
  }
  if (uRegion == 5) {
    gl_FragColor = vec4(uBase, 1.0);
    return;
  }
  vec3 n = proxyNormal();
  float lit = smoothstep(uThreshold - uSoft, uThreshold + uSoft, dot(n, normalize(uLight)));
  lit *= 1.0 - uShaded;
  vec3 c = mix(shade, base, lit);
  if (uRegion == 3) c = mix(c, uInk, faceInk());
  gl_FragColor = vec4(c, 1.0);
}
`;

const faceUniforms = (face: Face) => ({
  uEyes: {
    value: face.eyes.map((e) => new Vector4(e.centre[0], e.centre[1], e.radii[0], e.radii[1])),
  },
  uBrows: {
    value: face.brows.map((b) => new Vector4(b.centre[0], b.centre[1], b.radius, b.width)),
  },
  uBrowSpan: { value: face.brows.map((b) => new Vector2(b.from, b.to)) },
  uMouth: {
    value: new Vector4(
      face.mouth.centre[0],
      face.mouth.centre[1],
      face.mouth.radius,
      face.mouth.width,
    ),
  },
  uMouthSpan: { value: new Vector2(face.mouth.from, face.mouth.to) },
  uLean: { value: face.lean },
});

const EMPTY_FACE: Face = {
  eyes: [
    { centre: [0, 0], radii: [1, 1] },
    { centre: [0, 0], radii: [1, 1] },
  ],
  brows: [
    { centre: [0, 0], radius: 0, from: 0, to: 0, width: 0 },
    { centre: [0, 0], radius: 0, from: 0, to: 0, width: 0 },
  ],
  mouth: { centre: [0, 0], radius: 0, from: 0, to: 0, width: 0 },
  lean: 0,
};

const ORIGIN_PLANE: Plane = { point: [0, 0, 0], normal: [0, 1, 0] };
const NO_PAINT: Paint = { base: '#000000', shade: '#000000' };

/**
 * A toon material for one part: a hard two-tone ramp between its paint's
 * base and shade along the key light (fixed to the camera, so every view is
 * lit as the sheet is drawn), its shade from the part's proxy normal so the
 * shade is one painted shape; `uMode` 1 writes the part's id and view depth
 * for the ink pass instead.
 */
export const toonMaterial = (spec: MemberSpec, look: PartLook): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    uniforms: {
      uMode: { value: 0 },
      uId: { value: look.id },
      uBase: { value: colour(look.paint.base) },
      uShade: { value: colour(look.paint.shade) },
      uLight: { value: unit(spec.light.direction) },
      uThreshold: { value: spec.light.threshold },
      uSoft: { value: spec.light.soft },
      uProxy: { value: PROXY_CODE[look.proxy.kind] },
      uProxyCentre: { value: vec3(look.proxy.centre) },
      uShaded: { value: Number(look.shaded) },
      uRegion: { value: REGION_CODE[look.region.kind] },
      ...regionUniforms(spec, look),
    },
  });

/** The uniforms of a part's region; a region it lacks gets inert values the shader never reads. */
const regionUniforms = (spec: MemberSpec, look: PartLook) => {
  const region = look.region;
  const blank: RegionValues = {
    edge: ORIGIN_PLANE,
    hem: ORIGIN_PLANE,
    second: NO_PAINT,
    id2: look.id,
    line: [0, 0, 0],
    centreZ: 0,
    ink: spec.ink.colour,
    strap: [0, 0],
    sole: 0,
    face: EMPTY_FACE,
  };
  const r = regionValues(region, blank);
  return {
    uEdgeP: { value: vec3(r.edge.point) },
    uEdgeN: { value: vec3(r.edge.normal) },
    uHemP: { value: vec3(r.hem.point) },
    uHemN: { value: vec3(r.hem.normal) },
    uBase2: { value: colour(r.second.base) },
    uShade2: { value: colour(r.second.shade) },
    uId2: { value: r.id2 },
    uLine: { value: vec3(r.line) },
    uCentreZ: { value: r.centreZ },
    uInk: { value: colour(r.ink) },
    uStrap: { value: new Vector2(r.strap[0], r.strap[1]) },
    uSole: { value: r.sole },
    ...faceUniforms(r.face),
  };
};

type RegionValues = {
  readonly edge: Plane;
  readonly hem: Plane;
  readonly second: Paint;
  readonly id2: number;
  readonly line: Vec3;
  readonly centreZ: number;
  readonly ink: Hex;
  readonly strap: readonly [number, number];
  readonly sole: number;
  readonly face: Face;
};

const regionValues = (region: Region, blank: RegionValues): RegionValues => {
  switch (region.kind) {
    case 'mantle':
      return { ...blank, edge: region.edge, hem: region.hem, second: region.paint, id2: region.id };
    case 'hairline':
      return { ...blank, line: region.line, centreZ: region.centreZ };
    case 'face':
      return { ...blank, face: region.face, ink: region.ink };
    case 'sandal':
      return { ...blank, second: region.paint, strap: region.strap, sole: region.sole };
    case 'none':
    case 'ground':
      return blank;
  }
};
