import {
  Color,
  DataTexture,
  FloatType,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { buildFigure, inkClass, type InkClass } from './figure.ts';
import { LOOK_PAINTS, leadFeast } from './lead-feast.ts';
import type { MemberSpec, Pose } from './spec.ts';

/** One render: the image's size, where the soles' centre sits in it (px), px per head unit, the turn and the pose. */
export interface RenderRequest {
  readonly width: number;
  readonly height: number;
  readonly ox: number;
  readonly oy: number;
  readonly scale: number;
  readonly yaw: number;
  readonly pose: Pose;
  /** `colour` the finished frame; `ids` the part ids as grey levels (id × 12), for the measures. */
  readonly output: 'colour' | 'ids';
  /** `kept` the kept views' measured paints (the member's own), `look` look.md's hex pairs. */
  readonly palette: 'kept' | 'look';
}

const SUPERSAMPLE = 3;
const IDS = 32;
const INK_CODE: Record<InkClass, number> = { none: 0, outline: 1, inner: 2, gap: 3 };

/** The ink class of every id pair as a 32 × 32 table the ink pass reads. */
const pairTable = (): DataTexture => {
  const data = new Uint8Array(IDS * IDS);
  for (let a = 0; a < IDS; a++)
    for (let b = 0; b < IDS; b++) data[a * IDS + b] = INK_CODE[inkClass(a, b)] * 60;
  const t = new DataTexture(data, IDS, IDS, RedFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
};

const QUAD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The ink: a pixel is ink when a pixel of another id lies within the line's
 * half-width of it and the pair draws a line, so every line is centred on
 * the boundary between two parts, a constant width in screen pixels, and
 * drawn once whichever side it is seen from. A part folded over itself (a
 * bent forearm across its own upper arm) draws an inner line where its depth
 * jumps by more than the gap, as the concept draws a limb over itself.
 */
const INK_FRAGMENT = `
uniform sampler2D uColour;
uniform sampler2D uIds;
uniform sampler2D uPairs;
uniform vec2 uSize;
uniform float uOutline;
uniform float uInner;
uniform float uGap;
uniform vec3 uInk;
varying vec2 vUv;
float pairOf(float a, float b) {
  return floor(texture2D(uPairs, (vec2(b, a) + 0.5) / 32.0).r * 255.0 / 60.0 + 0.5);
}
void main() {
  vec4 own = texture2D(uIds, vUv);
  float a = floor(own.r * 255.0 + 0.5);
  float ink = 0.0;
  int reach = int(ceil(uOutline));
  for (int dy = -24; dy <= 24; dy++) {
    if (abs(dy) > reach) continue;
    for (int dx = -24; dx <= 24; dx++) {
      if (abs(dx) > reach) continue;
      float d = length(vec2(dx, dy));
      if (d > uOutline) continue;
      vec4 other = texture2D(uIds, vUv + vec2(dx, dy) / uSize);
      float b = floor(other.r * 255.0 + 0.5);
      if (b == a) {
        if (a > 0.0 && d <= uInner && abs(other.g - own.g) > uGap) ink = 1.0;
        continue;
      }
      float k = pairOf(a, b);
      if (k == 1.0) ink = 1.0;
      if (k == 2.0 && d <= uInner) ink = 1.0;
      if (k == 3.0 && d <= uInner && abs(other.g - own.g) > uGap) ink = 1.0;
    }
  }
  vec3 c = texture2D(uColour, vUv).rgb;
  gl_FragColor = vec4(mix(c, uInk, ink), 1.0);
}
`;

/** The paper: a box downsample of the supersampled frame, with a fixed fine grain so the figure sits on the film's paper. */
const PAPER_FRAGMENT = `
uniform sampler2D uFrame;
uniform vec2 uSize;
uniform float uFactor;
uniform float uGrain;
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 px = floor(vUv * uSize);
  vec3 sum = vec3(0.0);
  for (int y = 0; y < 3; y++)
    for (int x = 0; x < 3; x++)
      sum += texture2D(uFrame, ((px * uFactor) + vec2(float(x), float(y)) + 0.5) / (uSize * uFactor)).rgb;
  vec3 c = sum / 9.0;
  float g = (hash(px) - 0.5) * uGrain / 255.0;
  gl_FragColor = vec4(c + g, 1.0);
}
`;

/** The ids pass for measures: each pixel's id × 12 as grey, no ink, no paper. */
const IDS_FRAGMENT = `
uniform sampler2D uIds;
uniform vec2 uSize;
uniform float uFactor;
varying vec2 vUv;
void main() {
  vec2 px = floor(vUv * uSize);
  vec2 at = (px * uFactor + floor(uFactor / 2.0) + 0.5) / (uSize * uFactor);
  float id = floor(texture2D(uIds, at).r * 255.0 + 0.5);
  gl_FragColor = vec4(vec3(id * 12.0 / 255.0), 1.0);
}
`;

const hexColour = (hex: string): Color => new Color().setStyle(hex, 'srgb-linear');

/** A page that renders `spec` on request, every pass deterministic. */
const renderer = (spec: MemberSpec) => {
  const gl = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: false });
  gl.outputColorSpace = LinearSRGBColorSpace;
  gl.setPixelRatio(1);
  document.body.appendChild(gl.domElement);
  const figures = {
    kept: buildFigure(spec),
    look: buildFigure({ ...spec, paints: LOOK_PAINTS }),
  };
  const scenes = { kept: new Scene(), look: new Scene() };
  scenes.kept.add(figures.kept.root);
  scenes.look.add(figures.look.root);
  const camera = new OrthographicCamera(-1, 1, 1, -1, -20, 20);
  camera.position.set(0, 0, 10);
  camera.lookAt(new Vector3(0, 0, 0));
  const pairs = pairTable();
  const quadScene = (material: ShaderMaterial): Scene => {
    const s = new Scene();
    const m = new Mesh(new PlaneGeometry(2, 2), material);
    m.frustumCulled = false;
    s.add(m);
    return s;
  };
  const ink = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: INK_FRAGMENT,
    uniforms: {
      uColour: { value: pairs },
      uIds: { value: pairs },
      uPairs: { value: pairs },
      uSize: { value: new Vector2(1, 1) },
      uOutline: { value: (spec.ink.outline * SUPERSAMPLE) / 2 },
      uInner: { value: (spec.ink.inner * SUPERSAMPLE) / 2 },
      uGap: { value: 0.05 },
      uInk: { value: hexColour(spec.ink.colour) },
    },
  });
  const paper = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: PAPER_FRAGMENT,
    uniforms: {
      uFrame: { value: pairs },
      uSize: { value: new Vector2(1, 1) },
      uFactor: { value: SUPERSAMPLE },
      uGrain: { value: 3 },
    },
  });
  const idsOut = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: IDS_FRAGMENT,
    uniforms: {
      uIds: { value: pairs },
      uSize: { value: new Vector2(1, 1) },
      uFactor: { value: SUPERSAMPLE },
    },
  });
  const inkScene = quadScene(ink);
  const paperScene = quadScene(paper);
  const idsScene = quadScene(idsOut);
  const target = (w: number, h: number, float: boolean) =>
    new WebGLRenderTarget(w, h, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: (float && FloatType) || UnsignedByteType,
      depthBuffer: true,
    });
  const paperColour = hexColour(spec.paper);
  const toCanvas = (): void => {
    // oxlint-disable-next-line effect/noNullish -- three's renderer names the canvas as its render target by null
    gl.setRenderTarget(null);
  };

  return (req: RenderRequest): string => {
    const big = new Vector2(req.width * SUPERSAMPLE, req.height * SUPERSAMPLE);
    const colourTarget = target(big.x, big.y, false);
    const idTarget = target(big.x, big.y, true);
    const inkTarget = target(big.x, big.y, false);
    gl.setSize(req.width, req.height, false);
    camera.left = -req.ox / req.scale;
    camera.right = (req.width - req.ox) / req.scale;
    camera.top = req.oy / req.scale;
    camera.bottom = -(req.height - req.oy) / req.scale;
    camera.updateProjectionMatrix();
    const figure = figures[req.palette];
    const scene = scenes[req.palette];
    figure.pose(req.pose);
    figure.turn(req.yaw);

    figure.mode(0);
    gl.setClearColor(paperColour, 1);
    gl.setRenderTarget(colourTarget);
    gl.clear();
    gl.render(scene, camera);

    figure.mode(1);
    gl.setClearColor(new Color(0, 1000, 0), 1);
    gl.setRenderTarget(idTarget);
    gl.clear();
    gl.render(scene, camera);

    if (req.output === 'ids') {
      idsOut.uniforms['uIds'] = { value: idTarget.texture };
      idsOut.uniforms['uSize'] = { value: new Vector2(req.width, req.height) };
      toCanvas();
      gl.render(idsScene, camera);
    } else {
      ink.uniforms['uColour'] = { value: colourTarget.texture };
      ink.uniforms['uIds'] = { value: idTarget.texture };
      ink.uniforms['uSize'] = { value: big };
      gl.setRenderTarget(inkTarget);
      gl.render(inkScene, camera);
      paper.uniforms['uFrame'] = { value: inkTarget.texture };
      paper.uniforms['uSize'] = { value: new Vector2(req.width, req.height) };
      toCanvas();
      gl.render(paperScene, camera);
    }
    const url = gl.domElement.toDataURL('image/png');
    colourTarget.dispose();
    idTarget.dispose();
    inkTarget.dispose();
    return url;
  };
};

const render = renderer(leadFeast);
Reflect.set(window, 'toon3d', { render });
Reflect.set(window, 'ready', true);
