import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { PART, type Figure } from '../figure.ts';
import { toonMaterial } from '../shader.ts';
import { REST, type MemberSpec, type PaintName, type Pose } from '../spec.ts';
import { LABEL_GLSL, labelUniforms, MESH_LABEL } from './labels.ts';
import type { MeshFigure } from './prepare.ts';
import { skin, smoothNormals } from './rig.ts';

/** Where the face ends: skin above it is the head (its sphere proxy and its marks), below it the neck. */
const CHIN = 2.4;

/** The rounds of neighbour averaging the posed normals get, so a part's shade is one shape. */
const NORMAL_ROUNDS = 3;

/**
 * The mesh's toon shader. Each fragment's label comes from the member's
 * label rules (`LABEL_GLSL`) read at its rest position, so a label's edge is
 * the clean curve of a plane or an azimuth curve and moves with the
 * skinning. A fragment more than half an arm's is that arm's hand where the
 * hand bone leads its weights by the rules' lead, else its sleeve (in the
 * arm's paint). The shade is the hard two-tone ramp of the code-built
 * figure, read from a proxy normal (a sphere for the head, an upright
 * cylinder for the clothes) turned with the vertex, or the smoothed posed
 * normal for skin and sandals.
 */
const VERTEX = `
attribute vec3 rest;
attribute vec4 turn;
attribute vec2 arm;
attribute vec2 hand;
varying vec3 vObj;
varying vec2 vArm;
varying vec2 vHand;
varying vec3 vNormal;
varying vec4 vTurn;
varying vec3 vCamObj;
varying float vDepth;
void main() {
  vObj = rest;
  vArm = arm;
  vHand = hand;
  vNormal = normal;
  vTurn = turn;
  vCamObj = normalize(vec3(0.0, 0.0, 1.0) * mat3(modelViewMatrix));
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = `
uniform mat3 normalMatrix;
uniform int uMode;
uniform vec3 uBase[7];
uniform vec3 uShade[7];
uniform float uIdOf[7];
uniform float uHandId[2];
uniform float uHandLead;
uniform vec3 uLight;
uniform float uThreshold;
uniform float uSoft;
uniform float uChin;
uniform vec3 uHead;
uniform vec3 uBody;
uniform vec4 uEyes[2];
uniform vec4 uBrows[2];
uniform vec2 uBrowSpan[2];
uniform vec4 uMouth;
uniform vec2 uMouthSpan;
uniform float uLean;
uniform float uCentreZ;
uniform vec3 uInk;
varying vec3 vObj;
varying vec2 vArm;
varying vec2 vHand;
varying vec3 vNormal;
varying vec4 vTurn;
varying vec3 vCamObj;
varying float vDepth;
const float TAU = 6.28318530718;
${LABEL_GLSL}

float arcInk(vec2 q, vec4 arc, vec2 span) {
  vec2 d = q - arc.xy;
  float a = mod(atan(d.y, d.x), TAU);
  float from = mod(span.x, TAU);
  float to = from + mod(span.y - span.x, TAU);
  float inSpan = step(from, a) * step(a, to) + step(from, a + TAU) * step(a + TAU, to);
  float ring = step(abs(length(d) - arc.z), arc.w * 0.5) * min(inSpan, 1.0);
  vec2 e0 = arc.xy + arc.z * vec2(cos(span.x), sin(span.x));
  vec2 e1 = arc.xy + arc.z * vec2(cos(span.y), sin(span.y));
  return min(ring + step(length(q - e0), arc.w * 0.5) + step(length(q - e1), arc.w * 0.5), 1.0);
}

float faceInk() {
  vec3 d = normalize(mix(vec3(0.0, 0.0, 1.0), vCamObj, uLean));
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

vec3 turned(vec3 n, vec4 q) {
  return n + 2.0 * cross(q.xyz, cross(q.xyz, n) + q.w * n);
}

void main() {
  int side = 0;
  if (vArm.x > 0.5) side = 1;
  if (vArm.y > 0.5 && vArm.y >= vArm.x) side = 2;
  int l = bodyLabel(vObj);
  int slot = l;
  float id = uIdOf[l];
  if (side > 0) {
    float lead = side == 1 ? vHand.x : vHand.y;
    if (lead > uHandLead) {
      l = ${MESH_LABEL.skin};
      slot = l;
      id = uHandId[side - 1];
    } else {
      l = ${MESH_LABEL.tunic};
      slot = 4 + side;
      id = uIdOf[slot];
    }
  }
  bool skinLike = l == ${MESH_LABEL.skin} || l == ${MESH_LABEL.sandal};
  bool head = side == 0 && vObj.y > uChin && (l == ${MESH_LABEL.skin} || l == ${MESH_LABEL.hair});
  if (uMode == 1) {
    gl_FragColor = vec4(id / 255.0, vDepth, 0.0, 1.0);
    return;
  }
  vec3 n = normalize(vNormal);
  if (head) n = turned(normalize(vObj - uHead), normalize(vTurn));
  if (!head && !skinLike) {
    vec3 d = vObj - uBody;
    n = turned(normalize(vec3(d.x, 0.0, d.z)), normalize(vTurn));
  }
  n = normalize(normalMatrix * n);
  float lit = smoothstep(uThreshold - uSoft, uThreshold + uSoft, dot(n, normalize(uLight)));
  vec3 c = mix(uShade[slot], uBase[slot], lit);
  if (head && l == ${MESH_LABEL.skin}) c = mix(c, uInk, faceInk());
  gl_FragColor = vec4(c, 1.0);
}
`;

const colour = (hex: string): Color => new Color().setStyle(hex, 'srgb-linear');

/** The paint of each shader slot: the five labels in `MESH_LABEL`'s order, then the right and the left sleeve. */
const slotPaints = (spec: MemberSpec): ReadonlyArray<PaintName> => [
  'skin',
  'hair',
  'tunic',
  'mantle',
  'sandal',
  spec.arms.right.paint,
  spec.arms.left.paint,
];

/** The part id of each shader slot. */
const SLOT_IDS = [
  PART.head,
  PART.hair,
  PART.body,
  PART.mantle,
  PART.foot,
  PART.sleeveR,
  PART.sleeveL,
];

/** The mesh's toon material for `spec`'s light, face and paints. */
const meshMaterial = (spec: MemberSpec, mesh: MeshFigure): ShaderMaterial => {
  const f = spec.head.face;
  const paints = slotPaints(spec).map((name) => spec.paints[name]);
  const hc = spec.head.proxy.centre;
  const bc = spec.body.proxy.centre;
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    uniforms: {
      uMode: { value: 0 },
      uBase: { value: paints.map((p) => colour(p.base)) },
      uShade: { value: paints.map((p) => colour(p.shade)) },
      uIdOf: { value: SLOT_IDS },
      uHandId: { value: [PART.handR, PART.handL] },
      uHandLead: { value: mesh.labels.hand },
      uLight: { value: new Vector3(...spec.light.direction).normalize() },
      uThreshold: { value: spec.light.threshold },
      uSoft: { value: spec.light.soft },
      uChin: { value: CHIN },
      ...labelUniforms(mesh.labels),
      uHead: { value: new Vector3(hc[0], hc[1], hc[2] + mesh.faceZ) },
      uBody: { value: new Vector3(bc[0], bc[1], bc[2] + mesh.bodyZ) },
      uEyes: {
        value: f.eyes.map((e) => new Vector4(e.centre[0], e.centre[1], e.radii[0], e.radii[1])),
      },
      uBrows: {
        value: f.brows.map((b) => new Vector4(b.centre[0], b.centre[1], b.radius, b.width)),
      },
      uBrowSpan: { value: f.brows.map((b) => new Vector2(b.from, b.to)) },
      uMouth: {
        value: new Vector4(f.mouth.centre[0], f.mouth.centre[1], f.mouth.radius, f.mouth.width),
      },
      uMouthSpan: { value: new Vector2(f.mouth.from, f.mouth.to) },
      uLean: { value: f.lean },
      uCentreZ: { value: mesh.faceZ },
      uInk: { value: colour(spec.ink.colour) },
    },
  });
};

/**
 * A member's figure from a generated mesh: one skinned mesh with the mesh
 * toon shader and the code-built figure's ground shadow, posed by the rig's
 * skinning, with the same handle as the code-built `Figure`.
 */
export const buildMeshFigure = (spec: MemberSpec, mesh: MeshFigure): Figure => {
  const root = new Group();
  const turnGroup = new Group();
  root.add(turnGroup);
  const geometry = new BufferGeometry();
  const count = mesh.rig.positions.length / 3;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(mesh.rig.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('rest', new BufferAttribute(mesh.rig.positions, 3));
  geometry.setAttribute('turn', new BufferAttribute(new Float32Array(count * 4), 4));
  geometry.setAttribute('arm', new BufferAttribute(mesh.arms, 2));
  geometry.setAttribute('hand', new BufferAttribute(mesh.hands, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  const material = meshMaterial(spec, mesh);
  const body = new Mesh(geometry, material);
  body.frustumCulled = false;
  turnGroup.add(body);

  const shadowGeometry = new CircleGeometry(1, 48);
  shadowGeometry.scale(spec.shadow.radii[0], spec.shadow.radii[1], 1);
  shadowGeometry.translate(0, 0, -2);
  const shadowMaterial = toonMaterial(spec, {
    id: PART.shadow,
    paint: { base: spec.shadow.colour, shade: spec.shadow.colour },
    proxy: { kind: 'surface', centre: [0, 0, 0] },
    region: { kind: 'ground' },
    shaded: false,
  });
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.frustumCulled = false;
  root.add(shadow);
  const materials = [material, shadowMaterial];

  const pose = (next: Pose): void => {
    const posed = skin(mesh.rig, spec.arms, next);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const turn = geometry.getAttribute('turn');
    if (position instanceof BufferAttribute) {
      position.copyArray(posed.positions);
      position.needsUpdate = true;
    }
    if (normal instanceof BufferAttribute) {
      normal.copyArray(smoothNormals(posed.positions, mesh.indices, NORMAL_ROUNDS));
      normal.needsUpdate = true;
    }
    if (turn instanceof BufferAttribute) {
      turn.copyArray(posed.turns);
      turn.needsUpdate = true;
    }
  };
  pose(REST);

  return {
    root,
    materials,
    pose,
    turn: (yaw) => {
      turnGroup.rotation.y = yaw;
    },
    mode: (mode) => {
      for (const m of materials) {
        const u = m.uniforms['uMode'];
        if (u) u.value = mode;
      }
    },
  };
};
