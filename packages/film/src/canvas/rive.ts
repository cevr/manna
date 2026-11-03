import type {
  Artboard,
  File,
  LinearAnimation,
  Mat2D,
  RiveCanvas,
  ViewModel,
  ViewModelInstance,
  WrappedRenderer,
} from '@rive-app/webgl2-advanced';
import type { ConceptRef } from '../core/match.ts';
import { dropGl, holdGl } from './gl.ts';
import { probeFace, probeFigure, probesFaces, probesFigures } from './probe.ts';

export { type CastProp, type CastView, castTable } from './cast.ts';

export type RiveEngine = 'canvas' | 'webgl2';

interface RiveSource<Tl extends string = string, N extends string = string> {
  readonly riv: string;
  readonly artboard: string;
  readonly timelines: ReadonlyArray<Tl>;
  readonly numbers?: ReadonlyArray<N>;
}

export const INK_NUMBER = 'ink';

const shotScale = (ctx: CanvasRenderingContext2D) => {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / ctx.canvas.height;
};

export interface RivePropSpec<Tl extends string = string, N extends string = string> {
  readonly source: RiveSource<Tl, N>;
  readonly engine: RiveEngine;
  readonly key: string;
  readonly origin: readonly [number, number];
  readonly face?: { readonly node: string; readonly height: number };
  readonly concept?: ConceptRef;
  readonly ink?: (scale: number) => number;
}

interface RivePose<Tl extends string = string, N extends string = string> {
  readonly timelines: ReadonlyArray<readonly [name: Tl, seconds: number, mix?: number]>;
  readonly numbers?: Readonly<Partial<Record<N, number>>>;
  readonly size?: number;
}

export type PoseOf<S> = S extends RivePropSpec<infer Tl, infer N> ? RivePose<Tl, N> : never;

interface GlTarget {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly renderer: WrappedRenderer;
  primed: boolean;
}

interface Made {
  delete(): void;
}

interface InFlight {
  readonly hold: <A extends Made>(made: A) => A;
  readonly free: () => void;
}

export const inFlight = (): InFlight => {
  const held: Array<Made> = [];
  return {
    hold: (made) => {
      held.push(made);
      return made;
    },
    free: () => {
      for (let made = held.pop(); made !== undefined; made = held.pop()) made.delete();
    },
  };
};

interface RigSurfaces {
  readonly renderer: (canvas: HTMLCanvasElement) => WrappedRenderer;
  readonly target: (w: number, h: number) => GlTarget | undefined;
  readonly free: () => void;
}

export interface LoadedRig {
  readonly runtime: RiveCanvas;
  readonly paints: boolean;
  readonly file: File;
  readonly timelines: ReadonlyMap<string, LinearAnimation>;
  readonly model: ViewModel | undefined;
  readonly numbers: ReadonlySet<string>;
  readonly scratch: Mat2D;
  readonly surfaces: RigSurfaces;
  readonly frame: InFlight;
}

const TILE = 512;

const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'isContextLost');

export const rigSurfaces = (
  runtime: RiveCanvas,
  rest: () => Artboard,
  scratch: Mat2D,
  frame: InFlight,
): RigSurfaces => {
  const renderers = new Map<HTMLCanvasElement, WrappedRenderer>();
  const targets = new Map<number, GlTarget>();
  const renderer = (canvas: HTMLCanvasElement) => {
    const have = renderers.get(canvas);
    if (have !== undefined) return have;
    const made = runtime.makeRenderer(canvas);
    renderers.set(canvas, made);
    return made;
  };
  const target = (w: number, h: number) => {
    const at = w * 65536 + h;
    const have = targets.get(at);
    if (have !== undefined) {
      if (have.primed && !have.gl.isContextLost()) {
        holdGl(have.canvas, have.gl);
        return have;
      }
      targets.delete(at);
      have.renderer.delete();
      dropGl(have.canvas);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const renderer = runtime.makeRenderer(canvas, false);
    const gl: unknown = canvas.getContext('webgl2');
    if (!isGl2(gl)) return undefined;
    const made: GlTarget = { canvas, gl, renderer, primed: false };
    targets.set(at, made);
    holdGl(canvas, gl);
    const first = frame.hold(rest());
    first.advance(0);
    const b = first.bounds;
    const fill = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    made.renderer.clear();
    made.renderer.save();
    scratch.xx = fill;
    scratch.xy = 0;
    scratch.yx = 0;
    scratch.yy = fill;
    scratch.tx = -b.minX * fill;
    scratch.ty = -b.minY * fill;
    made.renderer.transform(scratch);
    first.draw(made.renderer);
    made.renderer.restore();
    made.renderer.flush();
    runtime.resolveAnimationFrame();
    made.primed = true;
    return made;
  };
  const free = () => {
    for (const made of renderers.values()) made.delete();
    for (const made of targets.values()) {
      made.renderer.delete();
      dropGl(made.canvas);
    }
    renderers.clear();
    targets.clear();
  };
  return { renderer, target, free };
};

const listed = (names: Iterable<string>) => [...names].join(', ');

const NO_NUMBERS: Readonly<Record<string, number>> = {};

const unposable = (spec: RivePropSpec, rig: LoadedRig, pose: RivePose): string | undefined => {
  for (const name in pose.numbers ?? NO_NUMBERS)
    if (!rig.numbers.has(name))
      return `rig ${spec.key} has no view-model number "${name}"; it has ${listed(rig.numbers)}`;
  for (let i = 0; i < pose.timelines.length; i++) {
    const name = pose.timelines[i]?.[0];
    if (name !== undefined && !rig.timelines.has(name))
      return `rig ${spec.key} has no timeline "${name}"; it has ${listed(rig.timelines.keys())}`;
  }
  return undefined;
};

const posed = (
  rig: LoadedRig,
  artboard: Artboard,
  vm: ViewModelInstance | undefined,
  pose: RivePose,
  ink: number | undefined,
) => {
  if (vm !== undefined) {
    artboard.bindViewModelInstance(vm);
    if (ink !== undefined) vm.number(INK_NUMBER).value = ink;
    const numbers = pose.numbers ?? NO_NUMBERS;
    for (const name in numbers) {
      const value = numbers[name];
      if (value !== undefined) vm.number(name).value = value;
    }
  }
  for (let i = 0; i < pose.timelines.length; i++) {
    const step = pose.timelines[i];
    const animation = step === undefined ? undefined : rig.timelines.get(step[0]);
    if (step === undefined || animation === undefined) continue;
    const mix = step[2] ?? 1;
    if (mix <= 0) continue;
    const t = rig.frame.hold(new rig.runtime.LinearAnimationInstance(animation, artboard));
    t.time = step[1];
    t.apply(mix);
  }
  artboard.advance(0);
};

const paintCanvas = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  artboard: Artboard,
) => {
  const [ox, oy] = spec.origin;
  const renderer = rig.surfaces.renderer(ctx.canvas);
  ctx.save();
  ctx.translate(-ox, -oy);
  renderer.beginFrame(false);
  renderer.save();
  artboard.draw(renderer);
  renderer.restore();
  rig.runtime.resolveAnimationFrame();
  ctx.restore();
};

const paintGl = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  artboard: Artboard,
): string | undefined => {
  const [ox, oy] = spec.origin;
  const m = ctx.getTransform();
  const e = m.e - (m.a * ox + m.c * oy);
  const f = m.f - (m.b * ox + m.d * oy);
  const b = artboard.bounds;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < 4; k++) {
    const x = k === 1 || k === 2 ? b.maxX : b.minX;
    const y = k >= 2 ? b.maxY : b.minY;
    const px = m.a * x + m.c * y + e;
    const py = m.b * x + m.d * y + f;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(maxX));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(maxY));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return undefined;
  const tiled = w <= TILE && h <= TILE;
  const sx = tiled ? x0 : 0;
  const sy = tiled ? y0 : 0;
  const target = tiled
    ? rig.surfaces.target(TILE, TILE)
    : rig.surfaces.target(ctx.canvas.width, ctx.canvas.height);
  if (target === undefined)
    return `rig ${spec.key}: no WebGL 2 context could be made to draw it on`;
  const { renderer } = target;
  renderer.clear();
  renderer.save();
  rig.scratch.xx = m.a;
  rig.scratch.xy = m.b;
  rig.scratch.yx = m.c;
  rig.scratch.yy = m.d;
  rig.scratch.tx = e - sx;
  rig.scratch.ty = f - sy;
  renderer.transform(rig.scratch);
  artboard.draw(renderer);
  renderer.restore();
  renderer.flush();
  rig.runtime.resolveAnimationFrame();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(target.canvas, x0 - sx, y0 - sy, w, h, x0, y0, w, h);
  ctx.restore();
  return undefined;
};

const declareFace = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  artboard: Artboard,
) => {
  if (spec.face === undefined || !probesFaces(ctx)) return;
  const [ox, oy] = spec.origin;
  const face = artboard.node(spec.face.node);
  face.parentWorldTransform(rig.scratch);
  const p = rig.scratch;
  const { x, y } = face;
  probeFace(
    ctx,
    p.xx * x + p.yx * y + p.tx - ox,
    p.xy * x + p.yy * y + p.ty - oy,
    spec.face.height,
  );
};

const declareFigure = (ctx: CanvasRenderingContext2D, spec: RivePropSpec, artboard: Artboard) => {
  if (!probesFigures(ctx)) return;
  const [ox, oy] = spec.origin;
  const b = artboard.bounds;
  probeFigure(ctx, {
    key: spec.key,
    left: b.minX - ox,
    top: b.minY - oy,
    right: b.maxX - ox,
    bottom: b.maxY - oy,
    face: spec.face !== undefined,
    concept: spec.concept,
  });
};

export const drawRig = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  pose: RivePose,
): string | undefined => {
  const why = unposable(spec, rig, pose);
  if (why !== undefined) return why;
  rig.frame.free();
  const artboard = rig.frame.hold(rig.file.artboardByName(spec.source.artboard));
  const vm = rig.model === undefined ? undefined : rig.frame.hold(rig.model.defaultInstance());
  posed(rig, artboard, vm, pose, spec.ink?.(shotScale(ctx)));
  const painted = sized(ctx, pose.size, () => {
    if (rig.paints && spec.engine === 'canvas') paintCanvas(ctx, spec, rig, artboard);
    const gl =
      rig.paints && spec.engine === 'webgl2' ? paintGl(ctx, spec, rig, artboard) : undefined;
    declareFace(ctx, spec, rig, artboard);
    declareFigure(ctx, spec, artboard);
    return gl;
  });
  rig.frame.free();
  return painted;
};

const sized = <A>(ctx: CanvasRenderingContext2D, size: number | undefined, draw: () => A): A => {
  if (size === undefined) return draw();
  ctx.save();
  ctx.scale(size, size);
  const drawn = draw();
  ctx.restore();
  return drawn;
};
