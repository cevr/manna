interface Gl {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
}

const ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
};

const KEPT = 8;

const made = new Map<string, Gl>();

const live = new Map<HTMLCanvasElement, WebGL2RenderingContext>();

const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'createVertexArray');

const release = (gl: WebGL2RenderingContext) => {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
};

export const holdGl = (canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void => {
  live.delete(canvas);
  live.set(canvas, gl);
  for (const [old, kept] of live) {
    if (live.size <= KEPT) break;
    live.delete(old);
    release(kept);
  }
};

export const dropGl = (canvas: HTMLCanvasElement): void => {
  const gl = live.get(canvas);
  live.delete(canvas);
  if (gl !== undefined) release(gl);
};

export const glCanvas = (key: string, width: number, height: number): Gl | undefined => {
  const have = made.get(key);
  if (have !== undefined) {
    const fits = have.canvas.width === width && have.canvas.height === height;
    if (fits && !have.gl.isContextLost()) {
      holdGl(have.canvas, have.gl);
      return have;
    }
    made.delete(key);
    dropGl(have.canvas);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', ATTRIBUTES);
  if (!isGl2(gl)) return undefined;
  const one = { canvas, gl };
  made.set(key, one);
  holdGl(canvas, gl);
  return one;
};
