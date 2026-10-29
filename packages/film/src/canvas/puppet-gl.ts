// A puppet's meshes drawn with WebGL 2 (`canvas/puppet.ts`): each part's
// triangles, placed where the frame's pose puts them, their pixels the
// part's texture inverse-mapped through them, sampled bilinear on
// premultiplied texels in the shader (`texelFetch`, as `core/puppet.ts`'s
// `rasterOf` samples them), laid back to front with premultiplied `over`.
// It draws on the page's one puppet canvas (`glCanvas`, held in the page's
// context budget, `canvas/gl.ts`), the frame's size.
//
// With a look, the figure is drawn into a target of its own, a drawn key in
// place of the part it stands for, and passes follow, each a function of
// that frame alone:
// - **L3.** A jump flood finds, for each pixel of the box, the nearest
//   pixel outside the figure, the nearest of what moved (each moving part's
//   coverage now and at rest), and the nearest pixel of the figure that did
//   not move. Within 16 px of what moved, the silhouette's line is drawn
//   again from the union's distance at the sheet's width, and the figure's
//   rim there takes the ink at its coverage; everywhere else every pixel is
//   the figure's own. Where a skinned part lies over another, its edge is
//   inked at 0.8 of the width, but not about its moving bone's pivot (the
//   shoulder's flap). A drawn key carries its own line, and the body's ink
//   within the line's width of it takes its nearest pixel's colour, so its
//   cut end hides the body's outline under it (`core/key-join.ts`, the same
//   rule on the CPU). Near a held hand the line is left as the drawings draw it.
// - **The held hand** is laid over the figure.
// - **The boil.** The figure is resampled bilinearly through the boil's
//   displacement field at the frame's tick (`core/boil.ts`), its lattice
//   standing at the puppet's origin.
//
// What a context holds for a puppet (its program, each part's and drawing's
// texture, its texture coordinates and its triangles) is made the first time
// the puppet is drawn on that context, and made anew on a context the budget
// let go; the passes' programs and targets are the context's, made at the
// canvas's size. The positions are the frame's own: each buffer is written
// whole every draw, every target is cleared or written whole in the box
// before it is read, and no pass reads outside the box, so no pixel of an
// earlier frame reaches this one. Synchronous: no Promise.

import { Result } from 'effect';
import { BOIL_CELL, boilField } from '../core/boil.ts';
import { KEY_JOIN_INK } from '../core/key-join.ts';
import { type Puppet, sealsShown } from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import { glCanvas } from './gl.ts';

type Pt = readonly [number, number];

/** The page's puppet canvas: one for every puppet, the frame's size. */
const KEY = 'film/puppet';

/** How far from what moved the line is drawn again, sheet px (L3). */
const REACH = 16;

/** The interior line's width, a share of the sheet's. */
const INTERIOR = 0.8;

/** How far about a moving bone's pivot no interior line is drawn, sheet px: the shoulder's flap (`core/puppet.ts`, 34) and 6 more. */
const FLAP_QUIET = 40;

const HEAD =
  '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp isampler2D;\n';

const VERTEX = `${HEAD}
in vec2 pos; in vec2 src; uniform vec2 size; out vec2 uv;
void main() {
  uv = src;
  gl_Position = vec4(pos.x / size.x * 2.0 - 1.0, 1.0 - pos.y / size.y * 2.0, 0.0, 1.0);
}`;

/** A texture's premultiplied bilinear sample at `uv` (texel px), as `rasterOf` takes it; `mask` writes its coverage in place of its colour, in the channels it names. */
const FRAGMENT = `${HEAD}
in vec2 uv; uniform sampler2D tex; uniform int mode; uniform vec3 mask; out vec4 o;
void main() {
  vec2 b = floor(uv - 0.5); vec2 f = uv - 0.5 - b; vec4 acc = vec4(0);
  ivec2 n = textureSize(tex, 0);
  for (int k = 0; k < 4; k++) {
    ivec2 d = ivec2(k & 1, k >> 1);
    float wt = (d.x == 1 ? f.x : 1.0 - f.x) * (d.y == 1 ? f.y : 1.0 - f.y);
    ivec2 p = ivec2(b) + d;
    if (p.x < 0 || p.y < 0 || p.x >= n.x || p.y >= n.y) continue;
    vec4 t = texelFetch(tex, p, 0);
    acc += vec4(t.rgb * t.a, t.a) * wt;
  }
  if (acc.a <= 0.0) discard;
  o = mode == 1 ? vec4(mask * acc.a, 0.0) : acc;
}`;

/** A full-screen triangle: each pass reads and writes pixel for pixel. */
const QUAD = `${HEAD}const vec2 P[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
void main() { gl_Position = vec4(P[gl_VertexID], 0, 1); }`;

const NONE = -32768;

/** The flood's seeds: the outside (coverage under a half), what moved (now or at rest), the figure that did not move, and the drawn key (coverage a half or more). */
const SEED = `${HEAD}
uniform sampler2D fig; uniform sampler2D moved; uniform ivec4 box; layout(location = 0) out ivec4 j0; layout(location = 1) out ivec4 j1;
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(fig, o, 0); vec4 m = texelFetch(moved, o, 0);
  ivec2 none = ivec2(${NONE});
  bool inside = c.a >= 0.5;
  j0 = ivec4(inside ? none : o, (m.r > 0.0 || m.g > 0.0) ? o : none);
  j1 = ivec4((inside && m.r < 0.5) ? o : none, m.b >= 0.5 ? o : none);
}`;

/** One jump of the flood: each seed the nearest of its own and its neighbours' `step` away, read only inside the box. */
const FLOOD = `${HEAD}
uniform isampler2D j0; uniform isampler2D j1; uniform int step; uniform ivec4 box;
layout(location = 0) out ivec4 o0; layout(location = 1) out ivec4 o1;
ivec2 best(ivec2 me, ivec2 cur, ivec2 cand) {
  if (cand.x == ${NONE}) return cur;
  if (cur.x == ${NONE}) return cand;
  ivec2 a = cur - me; ivec2 b = cand - me;
  int da = a.x * a.x + a.y * a.y; int db = b.x * b.x + b.y * b.y;
  return (db < da || (db == da && (cand.y < cur.y || (cand.y == cur.y && cand.x < cur.x)))) ? cand : cur;
}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  ivec4 a = texelFetch(j0, o, 0); ivec4 b = texelFetch(j1, o, 0);
  ivec2 s0 = a.xy, s1 = a.zw, s2 = b.xy, s3 = b.zw;
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    if (dx == 0 && dy == 0) continue;
    ivec2 q = o + ivec2(dx, dy) * step;
    if (q.x < box.x || q.y < box.y || q.x >= box.z || q.y >= box.w) continue;
    ivec4 qa = texelFetch(j0, q, 0); ivec4 qb = texelFetch(j1, q, 0);
    s0 = best(o, s0, qa.xy); s1 = best(o, s1, qa.zw); s2 = best(o, s2, qb.xy); s3 = best(o, s3, qb.zw);
  }
  o0 = ivec4(s0, s1); o1 = ivec4(s2, s3);
}`;

/** L3: the body's ink under a drawn key's reach given the key's colour (`core/key-join.ts`); the union's line near what moved, the rim there inked at its coverage, a skinned part's edge over another; else the figure's own pixel. */
const INK = `${HEAD}
uniform sampler2D fig; uniform sampler2D moved; uniform isampler2D j0; uniform isampler2D j1;
uniform float L; uniform float IL; uniform float reach; uniform vec3 ink; uniform int interior;
uniform vec3 quiet; uniform vec3 joints[4]; uniform int njoints;
out vec4 o;
float dist(ivec2 p, ivec2 s) { if (s.x == ${NONE}) return 1e9; vec2 d = vec2(s - p); return sqrt(dot(d, d)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(fig, p, 0); vec4 m = texelFetch(moved, p, 0);
  ivec4 a = texelFetch(j0, p, 0); ivec4 b = texelFetch(j1, p, 0);
  float dOut = dist(p, a.xy); float dMove = dist(p, a.zw); float dEdge = dist(p, b.xy); float dKey = dist(p, b.zw);
  vec2 xy = vec2(p) + 0.5;
  bool hushed = quiet.z > 0.0 && distance(xy, quiet.xy) < quiet.z;
  vec3 ink3 = ink / 255.0;
  if (m.b < 0.5 && c.a >= 0.5 && dKey <= L && distance(c.rgb / c.a, ink3) * 255.0 <= ${KEY_JOIN_INK}.0)
    c = vec4(texelFetch(fig, b.zw, 0).rgb / max(texelFetch(fig, b.zw, 0).a, 1e-4) * c.a, c.a);
  float k = 0.0;
  if (!hushed && dMove <= reach) {
    if (c.a >= 0.5) k = clamp(L + 0.5 - dOut, 0.0, 1.0);
    else if (c.a > 0.0) { o = vec4(ink3 * c.a, c.a); return; }
  }
  bool atJoint = false;
  for (int i = 0; i < 4; i++) if (i < njoints && distance(xy, joints[i].xy) < joints[i].z) atJoint = true;
  if (interior == 1 && !hushed && !atJoint && m.r >= 0.5 && dEdge <= IL + 0.5 && dOut > dEdge + 1.0)
    k = max(k, clamp(IL + 0.5 - dEdge, 0.0, 1.0));
  o = vec4(mix(c.rgb, ink3 * c.a, k), c.a);
}`;

/** The boil: the figure resampled bilinearly (premultiplied) through the field's displacement, the lattice's nodes blended by a smoothstep each way; nothing read outside the box. */
const BOIL = `${HEAD}
uniform sampler2D fig; uniform sampler2D field; uniform ivec4 box; uniform vec2 origin; uniform float cell; uniform ivec2 node0; uniform float height;
out vec4 o;
vec2 nodeAt(ivec2 q) { ivec2 n = textureSize(field, 0); return texelFetch(field, clamp(q - node0, ivec2(0), n - 1), 0).rg; }
vec4 texel(ivec2 q) { if (q.x < box.x || q.y < box.y || q.x >= box.z || q.y >= box.w) return vec4(0); return texelFetch(fig, q, 0); }
void main() {
  vec2 gp = gl_FragCoord.xy;
  // the canvas point (y down) of this pixel's centre, from the lattice's origin
  vec2 cp = vec2(gp.x, height - gp.y) - origin;
  vec2 g = cp / cell; ivec2 c0 = ivec2(floor(g)); vec2 f = g - floor(g); vec2 s = f * f * (3.0 - 2.0 * f);
  vec2 d = mix(mix(nodeAt(c0), nodeAt(c0 + ivec2(1, 0)), s.x), mix(nodeAt(c0 + ivec2(0, 1)), nodeAt(c0 + ivec2(1, 1)), s.x), s.y);
  // the figure is read where the field moves this pixel from: down the canvas is down the field
  vec2 at = gp - vec2(d.x, -d.y) - 0.5;
  ivec2 b0 = ivec2(floor(at)); vec2 t = at - floor(at);
  o = mix(mix(texel(b0), texel(b0 + ivec2(1, 0)), t.x), mix(texel(b0 + ivec2(0, 1)), texel(b0 + ivec2(1, 1)), t.x), t.y);
}`;

/** One part (or drawing) on one context: its texture, its vertex array, its buffers and its index count. */
interface PartGl {
  readonly texture: WebGLTexture;
  /** By each part in front of it, what this part shows once that part moves away (`PuppetPart.revealed`); a drawing has none. */
  readonly revealed: ReadonlyArray<WebGLTexture | undefined>;
  /** By each part in front of it of another skin, the seal laid over this part while neither moves (`PuppetPart.seals`, `sealsShown`); a drawing has none. */
  readonly seals: ReadonlyArray<WebGLTexture | undefined>;
  readonly vao: WebGLVertexArrayObject;
  readonly pos: WebGLBuffer;
  readonly buffers: ReadonlyArray<WebGLBuffer>;
  readonly count: number;
}

/** A part's rest place on one context: a vertex array on its texture coordinates and triangles, its own positions. */
interface RestGl {
  readonly vao: WebGLVertexArrayObject;
  readonly pos: WebGLBuffer;
}

/** A puppet on one context: its program, its uniforms, its parts, their rest places, and its drawings. */
interface PuppetOnGl {
  readonly program: WebGLProgram;
  readonly size: WebGLUniformLocation | null;
  readonly mode: WebGLUniformLocation | null;
  readonly mask: WebGLUniformLocation | null;
  readonly parts: ReadonlyArray<PartGl>;
  readonly rests: ReadonlyArray<RestGl>;
  readonly drawings: ReadonlyMap<string, PartGl>;
}

/** What a loaded puppet holds on each context it has been drawn on, freed with its load (`free`). */
export interface PuppetGl {
  readonly on: Map<WebGL2RenderingContext, PuppetOnGl>;
  /** The positions a draw writes, canvas px, one array a part: written whole each draw. */
  readonly positions: ReadonlyArray<Float32Array>;
  /** Each part's rest place, canvas px, where a look's line pass reads what moved: written whole each draw that moves the part. */
  readonly restPositions: ReadonlyArray<Float32Array>;
  /** The drawn key's and the held hand's quads, canvas px: written whole each draw that lays them. */
  readonly swapPositions: Float32Array;
  readonly heldPositions: Float32Array;
}

/** What a look asks of the passes, canvas px: the parts that moved, the part a drawing stands in for, the held hand, the boil's tick and lattice origin, and the line. */
export interface PuppetPass {
  readonly moving: ReadonlyArray<number>;
  readonly swap: { readonly part: number; readonly drawing: string } | undefined;
  readonly held: { readonly drawing: string; readonly at: Pt; readonly quiet: number } | undefined;
  readonly boil: number;
  /** How far the boil moves a node, px: 0 draws the figure unmoved. */
  readonly amp: number;
  readonly origin: Pt;
  readonly line:
    | { readonly width: number; readonly ink: readonly [number, number, number] }
    | undefined;
  /** Canvas px a sheet px: the frame's scale, which the line's reach and the flap's quiet take. */
  readonly scale: number;
  /** The pivots of the bones that turned, canvas px: no interior line is drawn about them. */
  readonly joints: ReadonlyArray<Pt>;
}

/** A loaded puppet's GL state, with nothing made yet. */
export const puppetGl = (puppet: Puppet): PuppetGl => ({
  on: new Map(),
  positions: puppet.parts.map((p) => new Float32Array(p.mesh.vertices.length)),
  restPositions: puppet.parts.map((p) => new Float32Array(p.mesh.vertices.length)),
  swapPositions: new Float32Array(8),
  heldPositions: new Float32Array(8),
});

/** A program linked on `gl` from its two shaders, or why not (a lost context makes no program). The shaders are freed once linked, and the program too when it fails. */
const link = (
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  attributes: ReadonlyArray<string>,
): Result.Result<WebGLProgram, string> => {
  const program = gl.createProgram();
  const shaders: Array<WebGLShader> = [];
  const freed = <A>(result: Result.Result<A, string>) => {
    for (const s of shaders) gl.deleteShader(s);
    if (Result.isFailure(result)) gl.deleteProgram(program);
    return result;
  };
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const s = gl.createShader(type);
    if (s === null) return freed(Result.fail('no shader could be made'));
    shaders.push(s);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS) !== true)
      return freed(Result.fail(gl.getShaderInfoLog(s) ?? 'a shader does not compile'));
    gl.attachShader(program, s);
  }
  for (const [k, name] of attributes.entries()) gl.bindAttribLocation(program, k, name);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true)
    return freed(Result.fail(gl.getProgramInfoLog(program) ?? 'the program does not link'));
  return freed(Result.succeed(program));
};

/** A texture of `pixels` (RGBA bytes, rows top down), sampled by `texelFetch`. */
const textureOf = (gl: WebGL2RenderingContext, pixels: Raster) => {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    pixels.width,
    pixels.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels.rgba,
  );
  return texture;
};

/** A vertex array of `count` positions written per draw (attribute 0) over static texture coordinates (1) and triangles. */
const meshOn = (
  gl: WebGL2RenderingContext,
  bytes: number,
  src: Float32Array,
  triangles: Uint32Array,
) => {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const pos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const uv = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uv);
  gl.bufferData(gl.ARRAY_BUFFER, src, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  const index = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, pos, buffers: [pos, uv, index] };
};

/** A drawing's quad: its four corners' texture coordinates and its two triangles. */
const QUAD_TRIANGLES = Uint32Array.from([0, 1, 2, 0, 2, 3]);

/** `loaded`'s program, textures and static buffers made on `gl`, or why not. */
const madeOn = (
  gl: WebGL2RenderingContext,
  loaded: { readonly puppet: Puppet; readonly drawings: ReadonlyMap<string, Raster> },
  state: PuppetGl,
): Result.Result<PuppetOnGl, string> => {
  const linked = link(gl, VERTEX, FRAGMENT, ['pos', 'src']);
  if (Result.isFailure(linked)) return Result.fail(linked.failure);
  const program = linked.success;
  const { puppet } = loaded;
  const parts = puppet.parts.map((part, k): PartGl => {
    const texture = textureOf(gl, part.pixels);
    const src = Float32Array.from(part.mesh.vertices);
    const mesh = meshOn(gl, state.positions[k]!.byteLength, src, part.mesh.triangles);
    const revealed = part.revealed.map((r) => r && textureOf(gl, r));
    const seals = part.seals.map((s) => s && textureOf(gl, s));
    return { texture, revealed, seals, ...mesh, count: part.mesh.triangles.length };
  });
  const rests = puppet.parts.map((part, k): RestGl => {
    const mesh = meshOn(
      gl,
      state.restPositions[k]!.byteLength,
      Float32Array.from(part.mesh.vertices),
      part.mesh.triangles,
    );
    return { vao: mesh.vao, pos: mesh.pos };
  });
  const drawings = new Map<string, PartGl>();
  for (const [name, pixels] of loaded.drawings) {
    const texture = textureOf(gl, pixels);
    const [w, h] = [pixels.width, pixels.height];
    const mesh = meshOn(gl, 32, Float32Array.from([0, 0, w, 0, w, h, 0, h]), QUAD_TRIANGLES);
    drawings.set(name, { texture, revealed: [], seals: [], ...mesh, count: 6 });
  }
  return Result.succeed({
    program,
    size: gl.getUniformLocation(program, 'size'),
    mode: gl.getUniformLocation(program, 'mode'),
    mask: gl.getUniformLocation(program, 'mask'),
    parts,
    rests,
    drawings,
  });
};

/** Free one part's or drawing's textures, vertex array and buffers on `gl`. */
const freePartGl = (gl: WebGL2RenderingContext, p: PartGl) => {
  gl.deleteTexture(p.texture);
  for (const t of [...p.revealed, ...p.seals]) if (t !== undefined) gl.deleteTexture(t);
  gl.deleteVertexArray(p.vao);
  for (const b of p.buffers) gl.deleteBuffer(b);
};

/** Free what `state` holds on every context still live. */
export const freePuppetGl = (state: PuppetGl) => {
  for (const [gl, on] of state.on) {
    if (gl.isContextLost()) continue;
    for (const p of [...on.parts, ...on.drawings.values()]) freePartGl(gl, p);
    for (const r of on.rests) gl.deleteVertexArray(r.vao);
    gl.deleteProgram(on.program);
  }
  state.on.clear();
};

/** A pass's targets and programs on one context, at one canvas size. */
interface Passes {
  readonly width: number;
  readonly height: number;
  readonly fig: WebGLTexture;
  readonly moved: WebGLTexture;
  readonly inked: WebGLTexture;
  readonly field: WebGLTexture;
  readonly jumps: ReadonlyArray<readonly [WebGLTexture, WebGLTexture]>;
  readonly fbFig: WebGLFramebuffer;
  readonly fbMoved: WebGLFramebuffer;
  readonly fbInked: WebGLFramebuffer;
  readonly fbJumps: ReadonlyArray<WebGLFramebuffer>;
  readonly seed: WebGLProgram;
  readonly flood: WebGLProgram;
  readonly ink: WebGLProgram;
  readonly boil: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
}

/** Each context's passes, made at its canvas's size and made again at another. */
const PASSES = new WeakMap<WebGL2RenderingContext, Passes>();

/** A target texture of `internal` format the canvas's size. */
const targetOf = (
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internal: number,
  format: number,
  type: number,
) => {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return t;
};

/** A framebuffer drawing into `textures`, in order. */
const framebufferOf = (gl: WebGL2RenderingContext, ...textures: ReadonlyArray<WebGLTexture>) => {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  for (const [k, t] of textures.entries())
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0);
  gl.drawBuffers(textures.map((_, k) => gl.COLOR_ATTACHMENT0 + k));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
};

/** Free the passes `p` holds on `gl`: made again at another size, the old ones go. */
const freePasses = (gl: WebGL2RenderingContext, p: Passes) => {
  for (const t of [p.fig, p.moved, p.inked, p.field, ...p.jumps.flat()]) gl.deleteTexture(t);
  for (const fb of [p.fbFig, p.fbMoved, p.fbInked, ...p.fbJumps]) gl.deleteFramebuffer(fb);
  for (const program of [p.seed, p.flood, p.ink, p.boil]) gl.deleteProgram(program);
  gl.deleteVertexArray(p.vao);
};

/** The passes on `gl` at `w` × `h`, made or made again, or why not. */
const passesOn = (
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): Result.Result<Passes, string> => {
  const had = PASSES.get(gl);
  if (had !== undefined && had.width === w && had.height === h) return Result.succeed(had);
  if (had !== undefined) freePasses(gl, had);
  const programs = Result.all({
    seed: link(gl, QUAD, SEED, []),
    flood: link(gl, QUAD, FLOOD, []),
    ink: link(gl, QUAD, INK, []),
    boil: link(gl, QUAD, BOIL, []),
  });
  if (Result.isFailure(programs)) return Result.fail(programs.failure);
  const { seed, flood, ink, boil } = programs.success;
  const rgba = () => targetOf(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  const ints = () => targetOf(gl, w, h, gl.RGBA16I, gl.RGBA_INTEGER, gl.SHORT);
  const [fig, moved, inked] = [rgba(), rgba(), rgba()];
  const jumps = [
    [ints(), ints()],
    [ints(), ints()],
  ] as const;
  const field = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, field);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const made: Passes = {
    width: w,
    height: h,
    fig,
    moved,
    inked,
    field,
    jumps,
    fbFig: framebufferOf(gl, fig),
    fbMoved: framebufferOf(gl, moved),
    fbInked: framebufferOf(gl, inked),
    fbJumps: jumps.map(([a, b]) => framebufferOf(gl, a, b)),
    seed,
    flood,
    ink,
    boil,
    vao: gl.createVertexArray(),
  };
  PASSES.set(gl, made);
  return Result.succeed(made);
};

/** Draw `p` (a part's or a drawing's vertex array, its positions `positions`) with its texture. */
const drawMesh = (
  gl: WebGL2RenderingContext,
  vao: WebGLVertexArrayObject,
  pos: WebGLBuffer,
  positions: Float32Array,
  texture: WebGLTexture,
  count: number,
) => {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
};

/** Bind texture `t` to unit `unit` as `program`'s sampler `name`. */
const bindTex = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  unit: number,
  t: WebGLTexture,
) => {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.uniform1i(gl.getUniformLocation(program, name), unit);
};

/** The flood's jumps: from 32 px down to 1, and 1 again. */
const JUMPS = [32, 16, 8, 4, 2, 1, 1];

/** A box in GL px: `[x0, y0, x1, y1)`, rows bottom up. */
type GlBox = readonly [number, number, number, number];

/** Over part `k` (its `PartGl` `p`, its positions `positions`), each seal it shows while the parts `moving` move (`sealsShown`), on its own mesh. */
const drawSeals = (
  gl: WebGL2RenderingContext,
  p: PartGl,
  positions: Float32Array,
  k: number,
  moving: ReadonlyArray<number>,
) => {
  for (const seal of sealsShown(p.seals, k, (n) => moving.includes(n)))
    drawMesh(gl, p.vao, p.pos, positions, seal, p.count);
};

/** Draw part `k` of the figure: the drawn key where it stands in for the part, else the part's mesh and its seals. */
const drawPart = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  k: number,
) => {
  const p = on.parts[k]!;
  if (k !== pass.swap?.part) {
    if (p.count === 0) return;
    drawMesh(gl, p.vao, p.pos, state.positions[k]!, p.texture, p.count);
    drawSeals(gl, p, state.positions[k]!, k, pass.moving);
    // and, behind each moving part in front of it, the paint that part's rim hid at rest
    for (const j of pass.moving) {
      const shown = j < k ? p.revealed[j] : undefined;
      if (shown !== undefined) drawMesh(gl, p.vao, p.pos, state.positions[k]!, shown, p.count);
    }
    return;
  }
  const key = on.drawings.get(pass.swap.drawing);
  if (key !== undefined)
    drawMesh(gl, key.vao, key.pos, state.swapPositions, key.texture, key.count);
};

/** The figure into its target, back to front, and what moved into its own: each moving part's coverage now (red) and at rest (green). */
const passFigure = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  passes: Passes,
) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, passes.fbFig);
  gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(on.program);
  gl.uniform2f(on.size, passes.width, passes.height);
  gl.uniform1i(on.mode, 0);
  gl.activeTexture(gl.TEXTURE0);
  for (let k = on.parts.length - 1; k >= 0; k--) drawPart(gl, on, state, pass, k);
  gl.bindFramebuffer(gl.FRAMEBUFFER, passes.fbMoved);
  gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
  gl.blendEquation(gl.MAX);
  gl.uniform1i(on.mode, 1);
  for (const k of pass.moving) {
    const p = on.parts[k]!;
    const r = on.rests[k]!;
    gl.uniform3f(on.mask, 0, 1, 0);
    drawMesh(gl, r.vao, r.pos, state.restPositions[k]!, p.texture, p.count);
    // a drawn key's coverage now in blue too, the seed of the body's ink it hides
    gl.uniform3f(on.mask, 1, 0, Number(k === pass.swap?.part));
    drawPart(gl, on, state, pass, k);
  }
  gl.blendEquation(gl.FUNC_ADD);
  gl.disable(gl.BLEND);
};

/** The flood: seeded from the figure and what moved, then jumped; the pair of targets that holds its answer. */
const passFlood = (gl: WebGL2RenderingContext, passes: Passes, glBox: GlBox) => {
  gl.bindVertexArray(passes.vao);
  gl.useProgram(passes.seed);
  gl.bindFramebuffer(gl.FRAMEBUFFER, passes.fbJumps[0]!);
  bindTex(gl, passes.seed, 'fig', 0, passes.fig);
  bindTex(gl, passes.seed, 'moved', 1, passes.moved);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(passes.flood);
  gl.uniform4i(gl.getUniformLocation(passes.flood, 'box'), ...glBox);
  let from = 0;
  for (const step of JUMPS) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, passes.fbJumps[1 - from]!);
    bindTex(gl, passes.flood, 'j0', 0, passes.jumps[from]![0]);
    bindTex(gl, passes.flood, 'j1', 1, passes.jumps[from]![1]);
    gl.uniform1i(gl.getUniformLocation(passes.flood, 'step'), step);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    from = 1 - from;
  }
  return passes.jumps[from]!;
};

/** The pivots' quiet discs as the ink pass reads them (x, y in GL px, radius), four at most, the rest naught. */
const jointDiscs = (pass: PuppetPass, height: number) =>
  Float32Array.from(
    Array.from({ length: 4 }, (_, i) => pass.joints[i]).flatMap((j) =>
      j === undefined ? [0, 0, 0] : [j[0], height - j[1], FLAP_QUIET * pass.scale],
    ),
  );

/** L3 into the inked target: the line near what moved, from the flood's answer `jumps`. With no line, nothing is near enough to be drawn again. */
const passInk = (
  gl: WebGL2RenderingContext,
  pass: PuppetPass,
  passes: Passes,
  jumps: readonly [WebGLTexture, WebGLTexture],
) => {
  const { height } = passes;
  const line = pass.line ?? { width: 0, ink: [0, 0, 0] as const };
  const lined = pass.line !== undefined;
  gl.useProgram(passes.ink);
  gl.bindFramebuffer(gl.FRAMEBUFFER, passes.fbInked);
  bindTex(gl, passes.ink, 'fig', 0, passes.fig);
  bindTex(gl, passes.ink, 'moved', 1, passes.moved);
  bindTex(gl, passes.ink, 'j0', 2, jumps[0]);
  bindTex(gl, passes.ink, 'j1', 3, jumps[1]);
  const u = (name: string) => gl.getUniformLocation(passes.ink, name);
  gl.uniform1f(u('L'), line.width);
  gl.uniform1f(u('IL'), line.width * INTERIOR);
  gl.uniform1f(u('reach'), lined ? REACH * pass.scale : -1);
  gl.uniform3f(u('ink'), ...line.ink);
  const meshMoved = pass.moving.some((k) => k !== pass.swap?.part);
  gl.uniform1i(u('interior'), Number(meshMoved && lined));
  const held = pass.held ?? { at: [0, height] as const, quiet: 0 };
  gl.uniform3f(u('quiet'), held.at[0], height - held.at[1], held.quiet);
  gl.uniform3fv(u('joints'), jointDiscs(pass, height));
  gl.uniform1i(u('njoints'), Math.min(4, pass.joints.length));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
};

/** The held hand over the inked figure. */
const passHeld = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  passes: Passes,
) => {
  const held = pass.held === undefined ? undefined : on.drawings.get(pass.held.drawing);
  if (held === undefined) return;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(on.program);
  gl.uniform2f(on.size, passes.width, passes.height);
  gl.uniform1i(on.mode, 0);
  gl.activeTexture(gl.TEXTURE0);
  drawMesh(gl, held.vao, held.pos, state.heldPositions, held.texture, held.count);
  gl.disable(gl.BLEND);
};

/** The boil onto the canvas: the field's lattice over `box` (canvas px), from the puppet's origin, the inked figure resampled through it. */
const passBoil = (
  gl: WebGL2RenderingContext,
  pass: PuppetPass,
  passes: Passes,
  box: readonly [number, number, number, number],
  glBox: GlBox,
) => {
  const [bx0, by0, bx1, by1] = box;
  const [ox, oy] = pass.origin;
  const i0 = Math.floor((bx0 - ox) / BOIL_CELL) - 1;
  const j0 = Math.floor((by0 - oy) / BOIL_CELL) - 1;
  const cols = Math.ceil((bx1 - ox) / BOIL_CELL) + 2 - i0;
  const rows = Math.ceil((by1 - oy) / BOIL_CELL) + 2 - j0;
  gl.bindVertexArray(passes.vao);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, passes.field);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RG32F,
    cols,
    rows,
    0,
    gl.RG,
    gl.FLOAT,
    boilField(pass.boil, i0, j0, cols, rows, pass.amp),
  );
  gl.useProgram(passes.boil);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  bindTex(gl, passes.boil, 'fig', 0, passes.inked);
  bindTex(gl, passes.boil, 'field', 1, passes.field);
  const b = (name: string) => gl.getUniformLocation(passes.boil, name);
  gl.uniform4i(b('box'), ...glBox);
  gl.uniform2f(b('origin'), ox, oy);
  gl.uniform1f(b('cell'), BOIL_CELL);
  gl.uniform2i(b('node0'), i0, j0);
  gl.uniform1f(b('height'), passes.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
};

/**
 * The look's passes: the figure (and its drawn key) into its target and
 * what moved into another, the flood, the line, the held hand, and the boil
 * onto the canvas, every target cleared or written whole in `box` (canvas
 * px), nothing read outside it.
 */
const passLook = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  passes: Passes,
  box: readonly [number, number, number, number],
) => {
  const [bx0, by0, bx1, by1] = box;
  const glBox: GlBox = [bx0, passes.height - by1, bx1, passes.height - by0];
  gl.viewport(0, 0, passes.width, passes.height);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(glBox[0], glBox[1], glBox[2] - glBox[0], glBox[3] - glBox[1]);
  gl.disable(gl.DEPTH_TEST);
  passFigure(gl, on, state, pass, passes);
  passInk(gl, pass, passes, passFlood(gl, passes, glBox));
  passHeld(gl, on, state, pass, passes);
  passBoil(gl, pass, passes, box, glBox);
  gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);
};

/** With no look: the box cleared on the puppet canvas and the parts drawn onto it back to front, each with the seals it shows while the parts `moving` move. */
const passPlain = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  moving: ReadonlyArray<number>,
  [width, height]: readonly [number, number],
  box: readonly [number, number, number, number],
) => {
  const [x0, y0, x1, y1] = box;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(x0, height - y1, x1 - x0, y1 - y0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(on.program);
  gl.uniform2f(on.size, width, height);
  gl.uniform1i(on.mode, 0);
  gl.activeTexture(gl.TEXTURE0);
  for (let k = on.parts.length - 1; k >= 0; k--) {
    const p = on.parts[k]!;
    if (p.count === 0) continue;
    drawMesh(gl, p.vao, p.pos, state.positions[k]!, p.texture, p.count);
    drawSeals(gl, p, state.positions[k]!, k, moving);
  }
  gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
};

/**
 * Draw `loaded`'s puppet, its parts' vertices placed at its positions
 * (canvas px of `ctx`), within the box `[x0, y0, x1, y1)`, onto `ctx` there:
 * the box cleared on the puppet canvas, the parts drawn back to front, each
 * with the seals it shows while the parts `moving` move (and, with a look's
 * `pass`, its key, line, held hand and boil), then copied over the frame
 * (whole pixels, under `ctx`'s clip and alpha). Why not, where no WebGL 2
 * context can be made.
 */
export const paintPuppetGl = (
  ctx: CanvasRenderingContext2D,
  loaded: {
    readonly puppet: Puppet;
    readonly drawings: ReadonlyMap<string, Raster>;
    readonly gl: PuppetGl;
  },
  box: readonly [number, number, number, number],
  moving: ReadonlyArray<number>,
  pass?: PuppetPass,
): string | undefined => {
  const { width, height } = ctx.canvas;
  const state = loaded.gl;
  const target = glCanvas(KEY, width, height);
  if (target === undefined) return 'no WebGL 2 context could be made to draw the puppet on';
  const { gl, canvas } = target;
  const [x0, y0, x1, y1] = box;
  let on = state.on.get(gl);
  if (on === undefined) {
    for (const old of state.on.keys()) if (old.isContextLost()) state.on.delete(old);
    const made = madeOn(gl, loaded, state);
    if (Result.isFailure(made)) return made.failure;
    on = made.success;
    state.on.set(gl, on);
  }
  if (pass === undefined) passPlain(gl, on, state, moving, [width, height], box);
  else {
    const passes = passesOn(gl, width, height);
    if (Result.isFailure(passes)) return passes.failure;
    passLook(gl, on, state, pass, passes.success, box);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
  return undefined;
};
