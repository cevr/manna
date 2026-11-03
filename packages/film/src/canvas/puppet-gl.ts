import { Result } from 'effect';
import { BOIL_CELL, boilField } from '../core/boil.ts';
import { KEY_JOIN_INK } from '../core/key-join.ts';
import { type Puppet, revealedShown, sealsShown } from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import { DYE_GLSL, type Dye, dyeUniforms } from './dye.ts';
import { glCanvas } from './gl.ts';

type Pt = readonly [number, number];

const KEY = 'film/puppet';

const REACH = 16;

const INTERIOR = 0.8;

const FLAP_QUIET = 40;

const HEAD =
  '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp isampler2D;\n';

const VERTEX = `${HEAD}
in vec2 pos; in vec2 src; uniform vec2 size; out vec2 uv;
void main() {
  uv = src;
  gl_Position = vec4(pos.x / size.x * 2.0 - 1.0, 1.0 - pos.y / size.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `${HEAD}
in vec2 uv; uniform sampler2D tex; uniform int mode; uniform vec3 mask; uniform int dye; out vec4 o;
${DYE_GLSL}
void main() {
  vec2 b = floor(uv - 0.5); vec2 f = uv - 0.5 - b; vec4 acc = vec4(0);
  ivec2 n = textureSize(tex, 0);
  for (int k = 0; k < 4; k++) {
    ivec2 d = ivec2(k & 1, k >> 1);
    float wt = (d.x == 1 ? f.x : 1.0 - f.x) * (d.y == 1 ? f.y : 1.0 - f.y);
    ivec2 p = ivec2(b) + d;
    if (p.x < 0 || p.y < 0 || p.x >= n.x || p.y >= n.y) continue;
    vec4 t = texelFetch(tex, p, 0);
    if (dye == 1) t.rgb = dyed(t.rgb);
    acc += vec4(t.rgb * t.a, t.a) * wt;
  }
  if (acc.a <= 0.0) discard;
  o = mode == 1 ? vec4(mask * acc.a, 0.0) : acc;
}`;

const QUAD = `${HEAD}const vec2 P[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
void main() { gl_Position = vec4(P[gl_VertexID], 0, 1); }`;

const NONE = -32768;

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

const INK = `${HEAD}
uniform sampler2D fig; uniform sampler2D moved; uniform isampler2D j0; uniform isampler2D j1;
uniform float L; uniform float IL; uniform float reach; uniform vec3 ink; uniform int interior;
uniform vec3 quiet; uniform vec3 joints[4]; uniform int njoints;
out vec4 o;
float dist(ivec2 p, ivec2 s) { if (s.x == ${NONE}) return 1e9; vec2 d = vec2(s - p); return sqrt(dot(d, d)); }
// one of p's eight neighbours an opaque body pixel the key does not cover that reads as ink; p is opaque, so its neighbours lie in the box
bool besideInk(ivec2 p, vec3 ink3) {
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    if (dx == 0 && dy == 0) continue;
    ivec2 q = p + ivec2(dx, dy);
    vec4 f = texelFetch(fig, q, 0);
    if (texelFetch(moved, q, 0).b < 0.5 && f.a >= 0.5 && distance(f.rgb / f.a, ink3) * 255.0 <= ${KEY_JOIN_INK}.0) return true;
  }
  return false;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(fig, p, 0); vec4 m = texelFetch(moved, p, 0);
  ivec4 a = texelFetch(j0, p, 0); ivec4 b = texelFetch(j1, p, 0);
  float dOut = dist(p, a.xy); float dMove = dist(p, a.zw); float dEdge = dist(p, b.xy); float dKey = dist(p, b.zw);
  vec2 xy = vec2(p) + 0.5;
  bool hushed = quiet.z > 0.0 && distance(xy, quiet.xy) < quiet.z;
  vec3 ink3 = ink / 255.0;
  if (m.b < 0.5 && c.a >= 0.5 && dKey <= L) {
    vec3 own = c.rgb / c.a; vec4 kc = texelFetch(fig, b.zw, 0); vec3 to = kc.rgb / max(kc.a, 1e-4);
    float dInk = distance(own, ink3) * 255.0;
    if (dInk <= ${KEY_JOIN_INK}.0 || (dInk < distance(own, to) * 255.0 && besideInk(p, ink3))) c = vec4(to * c.a, c.a);
  }
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

interface PartGl {
  readonly texture: WebGLTexture;
  readonly revealed: ReadonlyArray<WebGLTexture | undefined>;
  readonly seals: ReadonlyArray<WebGLTexture | undefined>;
  readonly vao: WebGLVertexArrayObject;
  readonly pos: WebGLBuffer;
  readonly buffers: ReadonlyArray<WebGLBuffer>;
  readonly count: number;
}

interface RestGl {
  readonly vao: WebGLVertexArrayObject;
  readonly pos: WebGLBuffer;
}

interface PuppetOnGl {
  readonly program: WebGLProgram;
  readonly size: WebGLUniformLocation | null;
  readonly mode: WebGLUniformLocation | null;
  readonly mask: WebGLUniformLocation | null;
  readonly dye: WebGLUniformLocation | null;
  readonly dyeFrom: WebGLUniformLocation | null;
  readonly dyeTo: WebGLUniformLocation | null;
  readonly parts: ReadonlyArray<PartGl>;
  readonly rests: ReadonlyArray<RestGl>;
  readonly drawings: ReadonlyMap<string, PartGl>;
}

export interface PuppetGl {
  readonly on: Map<WebGL2RenderingContext, PuppetOnGl>;
  readonly positions: ReadonlyArray<Float32Array>;
  readonly restPositions: ReadonlyArray<Float32Array>;
  readonly swapPositions: ReadonlyArray<Float32Array>;
  readonly heldPositions: Float32Array;
}

export interface PuppetPass {
  readonly moving: ReadonlyArray<number>;
  readonly swaps: ReadonlyArray<{ readonly part: number; readonly drawing: string }>;
  readonly held: { readonly drawing: string; readonly at: Pt; readonly quiet: number } | undefined;
  readonly boil: number;
  readonly amp: number;
  readonly origin: Pt;
  readonly line:
    | { readonly width: number; readonly ink: readonly [number, number, number] }
    | undefined;
  readonly scale: number;
  readonly joints: ReadonlyArray<Pt>;
}

export interface PuppetDressGl {
  readonly hidden: ReadonlyArray<number>;
  readonly dyes: ReadonlyMap<number, Dye>;
}

export const UNDRESSED: PuppetDressGl = { hidden: [], dyes: new Map() };

const movesOf =
  (moving: ReadonlyArray<number>, dress: PuppetDressGl) =>
  (n: number): boolean =>
    moving.includes(n) || dress.hidden.includes(n);

const dyeOn = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  dress: PuppetDressGl,
  dye: Dye | undefined,
) => {
  if (dress.dyes.size === 0) return;
  gl.uniform1i(on.dye, Number(dye !== undefined));
  if (dye === undefined) return;
  const { from, to } = dyeUniforms(dye);
  gl.uniform4fv(on.dyeFrom, from);
  gl.uniform3fv(on.dyeTo, to);
};

export const puppetGl = (puppet: Puppet): PuppetGl => ({
  on: new Map(),
  positions: puppet.parts.map((p) => new Float32Array(p.mesh.vertices.length)),
  restPositions: puppet.parts.map((p) => new Float32Array(p.mesh.vertices.length)),
  swapPositions: puppet.parts.map(() => new Float32Array(8)),
  heldPositions: new Float32Array(8),
});

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

const QUAD_TRIANGLES = Uint32Array.from([0, 1, 2, 0, 2, 3]);

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
    dye: gl.getUniformLocation(program, 'dye'),
    dyeFrom: gl.getUniformLocation(program, 'dyeFrom'),
    dyeTo: gl.getUniformLocation(program, 'dyeTo'),
    parts,
    rests,
    drawings,
  });
};

const freePartGl = (gl: WebGL2RenderingContext, p: PartGl) => {
  gl.deleteTexture(p.texture);
  for (const t of [...p.revealed, ...p.seals]) if (t !== undefined) gl.deleteTexture(t);
  gl.deleteVertexArray(p.vao);
  for (const b of p.buffers) gl.deleteBuffer(b);
};

export const freePuppetGl = (state: PuppetGl) => {
  for (const [gl, on] of state.on) {
    if (gl.isContextLost()) continue;
    for (const p of [...on.parts, ...on.drawings.values()]) freePartGl(gl, p);
    for (const r of on.rests) gl.deleteVertexArray(r.vao);
    gl.deleteProgram(on.program);
  }
  state.on.clear();
};

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

const PASSES = new WeakMap<WebGL2RenderingContext, Passes>();

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

const framebufferOf = (gl: WebGL2RenderingContext, ...textures: ReadonlyArray<WebGLTexture>) => {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  for (const [k, t] of textures.entries())
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0);
  gl.drawBuffers(textures.map((_, k) => gl.COLOR_ATTACHMENT0 + k));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
};

const freePasses = (gl: WebGL2RenderingContext, p: Passes) => {
  for (const t of [p.fig, p.moved, p.inked, p.field, ...p.jumps.flat()]) gl.deleteTexture(t);
  for (const fb of [p.fbFig, p.fbMoved, p.fbInked, ...p.fbJumps]) gl.deleteFramebuffer(fb);
  for (const program of [p.seed, p.flood, p.ink, p.boil]) gl.deleteProgram(program);
  gl.deleteVertexArray(p.vao);
};

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

const JUMPS = [32, 16, 8, 4, 2, 1, 1];

type GlBox = readonly [number, number, number, number];

const drawLayers = (
  gl: WebGL2RenderingContext,
  p: PartGl,
  positions: Float32Array,
  textures: ReadonlyArray<WebGLTexture>,
) => {
  for (const tex of textures) drawMesh(gl, p.vao, p.pos, positions, tex, p.count);
};

const swappedIn = (pass: PuppetPass, k: number) => pass.swaps.some((s) => s.part === k);

const drawPart = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  dress: PuppetDressGl,
  k: number,
) => {
  if (dress.hidden.includes(k)) return;
  const p = on.parts[k]!;
  const swap = pass.swaps.find((s) => s.part === k);
  dyeOn(gl, on, dress, dress.dyes.get(k));
  if (swap === undefined) {
    if (p.count === 0) return;
    const moves = movesOf(pass.moving, dress);
    drawLayers(gl, p, state.positions[k]!, [
      p.texture,
      ...sealsShown(p.seals, k, moves),
      ...revealedShown(p.revealed, k, moves),
    ]);
    return;
  }
  const key = on.drawings.get(swap.drawing);
  if (key !== undefined)
    drawMesh(gl, key.vao, key.pos, state.swapPositions[k]!, key.texture, key.count);
};

const passFigure = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  dress: PuppetDressGl,
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
  for (let k = on.parts.length - 1; k >= 0; k--) drawPart(gl, on, state, pass, dress, k);
  gl.bindFramebuffer(gl.FRAMEBUFFER, passes.fbMoved);
  gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
  gl.blendEquation(gl.MAX);
  gl.uniform1i(on.mode, 1);
  for (const k of pass.moving) {
    const p = on.parts[k]!;
    const r = on.rests[k]!;
    gl.uniform3f(on.mask, 0, 1, 0);
    drawMesh(gl, r.vao, r.pos, state.restPositions[k]!, p.texture, p.count);
    gl.uniform3f(on.mask, 1, 0, Number(swappedIn(pass, k)));
    drawPart(gl, on, state, pass, dress, k);
  }
  gl.blendEquation(gl.FUNC_ADD);
  gl.disable(gl.BLEND);
  dyeOn(gl, on, dress, undefined);
};

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

const jointDiscs = (pass: PuppetPass, height: number) =>
  Float32Array.from(
    Array.from({ length: 4 }, (_, i) => pass.joints[i]).flatMap((j) =>
      j === undefined ? [0, 0, 0] : [j[0], height - j[1], FLAP_QUIET * pass.scale],
    ),
  );

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
  const meshMoved = pass.moving.some((k) => !swappedIn(pass, k));
  gl.uniform1i(u('interior'), Number(meshMoved && lined));
  const held = pass.held ?? { at: [0, height] as const, quiet: 0 };
  gl.uniform3f(u('quiet'), held.at[0], height - held.at[1], held.quiet);
  gl.uniform3fv(u('joints'), jointDiscs(pass, height));
  gl.uniform1i(u('njoints'), Math.min(4, pass.joints.length));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
};

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

const passLook = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  pass: PuppetPass,
  dress: PuppetDressGl,
  passes: Passes,
  box: readonly [number, number, number, number],
) => {
  const [bx0, by0, bx1, by1] = box;
  const glBox: GlBox = [bx0, passes.height - by1, bx1, passes.height - by0];
  gl.viewport(0, 0, passes.width, passes.height);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(glBox[0], glBox[1], glBox[2] - glBox[0], glBox[3] - glBox[1]);
  gl.disable(gl.DEPTH_TEST);
  passFigure(gl, on, state, pass, dress, passes);
  passInk(gl, pass, passes, passFlood(gl, passes, glBox));
  passHeld(gl, on, state, pass, passes);
  passBoil(gl, pass, passes, box, glBox);
  gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);
};

const passPlain = (
  gl: WebGL2RenderingContext,
  on: PuppetOnGl,
  state: PuppetGl,
  moving: ReadonlyArray<number>,
  dress: PuppetDressGl,
  [width, height]: readonly [number, number],
  box: readonly [number, number, number, number],
) => {
  const [x0, y0, x1, y1] = box;
  const moves = movesOf(moving, dress);
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
    if (p.count === 0 || dress.hidden.includes(k)) continue;
    dyeOn(gl, on, dress, dress.dyes.get(k));
    drawLayers(gl, p, state.positions[k]!, [
      p.texture,
      ...sealsShown(p.seals, k, moves),
      ...revealedShown(p.revealed, k, moves),
    ]);
  }
  dyeOn(gl, on, dress, undefined);
  gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
};

export const paintPuppetGl = (
  ctx: CanvasRenderingContext2D,
  loaded: {
    readonly puppet: Puppet;
    readonly drawings: ReadonlyMap<string, Raster>;
    readonly gl: PuppetGl;
  },
  box: readonly [number, number, number, number],
  moving: ReadonlyArray<number>,
  dress: PuppetDressGl,
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
  if (pass === undefined) passPlain(gl, on, state, moving, dress, [width, height], box);
  else {
    const passes = passesOn(gl, width, height);
    if (Result.isFailure(passes)) return passes.failure;
    passLook(gl, on, state, pass, dress, passes.success, box);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
  return undefined;
};
