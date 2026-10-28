// A puppet's meshes drawn with WebGL 2 (`canvas/puppet.ts`): each part's
// triangles, placed where the frame's pose puts them, their pixels the
// part's texture inverse-mapped through them, sampled bilinear on
// premultiplied texels in the shader (`texelFetch`, as `core/puppet.ts`'s
// `rasterOf` samples them), laid back to front with premultiplied `over`.
// It draws on the page's one puppet canvas (`glCanvas`, held in the page's
// context budget, `canvas/gl.ts`), the frame's size.
//
// What a context holds for a puppet (its program, each part's texture, its
// texture coordinates and its triangles) is made the first time the puppet
// is drawn on that context, and made anew on a context the budget let go.
// The positions are the frame's own: the whole buffer is written every
// draw, and the box the puppet is drawn in is cleared before it is, so no
// pixel of an earlier frame reaches this one. Synchronous: no Promise.

import { Result } from 'effect';
import type { Puppet } from '../core/puppet.ts';
import { glCanvas } from './gl.ts';

/** The page's puppet canvas: one for every puppet, the frame's size. */
const KEY = 'film/puppet';

const HEAD =
  '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

const VERTEX = `${HEAD}
in vec2 pos; in vec2 src; uniform vec2 size; out vec2 uv;
void main() {
  uv = src;
  gl_Position = vec4(pos.x / size.x * 2.0 - 1.0, 1.0 - pos.y / size.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `${HEAD}
in vec2 uv; uniform sampler2D tex; out vec4 o;
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
  o = acc;
}`;

/** One part on one context: its texture, its vertex array, its buffers and its index count. */
interface PartGl {
  readonly texture: WebGLTexture;
  readonly vao: WebGLVertexArrayObject;
  readonly pos: WebGLBuffer;
  readonly buffers: ReadonlyArray<WebGLBuffer>;
  readonly count: number;
}

/** A puppet on one context: its program, its size uniform and its parts. */
interface PuppetOnGl {
  readonly program: WebGLProgram;
  readonly size: WebGLUniformLocation | null;
  readonly parts: ReadonlyArray<PartGl>;
}

/** What a loaded puppet holds on each context it has been drawn on, freed with its load (`free`). */
export interface PuppetGl {
  readonly on: Map<WebGL2RenderingContext, PuppetOnGl>;
  /** The positions a draw writes, screen px, one array a part: written whole each draw. */
  readonly positions: ReadonlyArray<Float32Array>;
}

/** A loaded puppet's GL state, with nothing made yet. */
export const puppetGl = (puppet: Puppet): PuppetGl => ({
  on: new Map(),
  positions: puppet.parts.map((p) => new Float32Array(p.mesh.vertices.length)),
});

/** The puppet's program linked on `gl`, or why it would not (a lost context makes no program). */
const compile = (gl: WebGL2RenderingContext): Result.Result<WebGLProgram, string> => {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const s = gl.createShader(type);
    if (s === null) return Result.fail('no shader could be made');
    gl.shaderSource(s, source);
    gl.compileShader(s);
    gl.attachShader(program, s);
  }
  gl.bindAttribLocation(program, 0, 'pos');
  gl.bindAttribLocation(program, 1, 'src');
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true)
    return Result.fail(gl.getProgramInfoLog(program) ?? 'the program does not link');
  return Result.succeed(program);
};

/** `puppet`'s program, textures and static buffers made on `gl`, or why not. */
const madeOn = (
  gl: WebGL2RenderingContext,
  puppet: Puppet,
  state: PuppetGl,
): Result.Result<PuppetOnGl, string> => {
  const linked = compile(gl);
  if (Result.isFailure(linked)) return Result.fail(linked.failure);
  const program = linked.success;
  const parts = puppet.parts.map((part, k): PartGl => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const { width, height, rgba } = part.pixels;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, state.positions[k]!.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const src = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, src);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(part.mesh.vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    const index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.mesh.triangles, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { texture, vao, pos, buffers: [pos, src, index], count: part.mesh.triangles.length };
  });
  return Result.succeed({ program, size: gl.getUniformLocation(program, 'size'), parts });
};

/** Free what `state` holds on every context still live. */
export const freePuppetGl = (state: PuppetGl) => {
  for (const [gl, on] of state.on) {
    if (gl.isContextLost()) continue;
    for (const p of on.parts) {
      gl.deleteTexture(p.texture);
      gl.deleteVertexArray(p.vao);
      for (const b of p.buffers) gl.deleteBuffer(b);
    }
    gl.deleteProgram(on.program);
  }
  state.on.clear();
};

/**
 * Draw `puppet`, its parts' vertices placed at `state.positions` (canvas
 * px of `ctx`), within the box `[x0, y0, x1, y1)`, onto `ctx` there: the
 * box cleared on the puppet canvas, the parts drawn back to front, then
 * copied over the frame (whole pixels, under `ctx`'s clip and alpha). Why
 * not, where no WebGL 2 context can be made.
 */
export const paintPuppetGl = (
  ctx: CanvasRenderingContext2D,
  puppet: Puppet,
  state: PuppetGl,
  box: readonly [number, number, number, number],
): string | undefined => {
  const { width, height } = ctx.canvas;
  const target = glCanvas(KEY, width, height);
  if (target === undefined) return 'no WebGL 2 context could be made to draw the puppet on';
  const { gl, canvas } = target;
  const [x0, y0, x1, y1] = box;
  let on = state.on.get(gl);
  if (on === undefined) {
    for (const old of state.on.keys()) if (old.isContextLost()) state.on.delete(old);
    const made = madeOn(gl, puppet, state);
    if (Result.isFailure(made)) return made.failure;
    on = made.success;
    state.on.set(gl, on);
  }
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
  gl.activeTexture(gl.TEXTURE0);
  for (let k = on.parts.length - 1; k >= 0; k--) {
    const p = on.parts[k]!;
    if (p.count === 0) continue;
    gl.bindVertexArray(p.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, p.pos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.positions[k]!);
    gl.bindTexture(gl.TEXTURE_2D, p.texture);
    gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0);
  }
  gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
  return undefined;
};
