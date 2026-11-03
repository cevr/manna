import { Predicate } from 'effect';
import { lerp } from '../core/time.ts';
import type { Clear, Hex } from './colour.ts';
import { raised } from './cutout.ts';
import { sky } from './glow.ts';
import { PLANE_FIBRE, planeFibre } from './fibre.ts';

export interface Camera {
  x: number;
  y: number;
  zoom?: number;
  rot?: number;
}

export const UNMOVED: Readonly<Camera> = Object.freeze({ x: 960, y: 540, zoom: 1 });

const listeners = new WeakMap<
  CanvasRenderingContext2D,
  (inside: DOMMatrix, aimed: DOMMatrix) => void
>();
const depths = new WeakMap<CanvasRenderingContext2D, number>();

export interface SceneBreath {
  readonly through: number;
  readonly drift: Drift | 0;
  readonly outer: boolean;
  readonly width: number;
  readonly height: number;
}

interface Breathing {
  through: number;
  drift: Drift | 0;
  outer: boolean;
  shot: boolean;
}

const breaths = new WeakMap<CanvasRenderingContext2D, Breathing>();
const drawing = new WeakSet<CanvasRenderingContext2D>();

const breathAt = (drift: Drift | 0, through: number): number =>
  drift === 0 ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, through)));

const STILL_BREATH = 1e-9;

export const breathes = (breath: SceneBreath): boolean =>
  breathAt(breath.drift, breath.through) > STILL_BREATH;

export const hearingCameras = (
  ctx: CanvasRenderingContext2D,
  heard: ((inside: DOMMatrix, aimed: DOMMatrix) => void) | undefined,
  breath: SceneBreath,
  draw: () => void,
): boolean => {
  depths.delete(ctx);
  if (heard === undefined) listeners.delete(ctx);
  else listeners.set(ctx, heard);
  let now = breaths.get(ctx);
  if (now === undefined) {
    now = { through: 0, drift: 0, outer: false, shot: false };
    breaths.set(ctx, now);
  }
  now.through = breath.through;
  now.drift = breath.drift;
  now.outer = breath.outer;
  now.shot = false;
  drawing.add(ctx);
  const b = breathAt(breath.drift, breath.through);
  if (breath.outer && breath.drift !== 0 && b > STILL_BREATH) {
    const { width: w, height: h } = breath;
    const s = 1 + breath.drift.zoom * b;
    ctx.save();
    ctx.translate(w / 2 - breath.drift.x * b, h / 2);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    draw();
    ctx.restore();
  } else draw();
  drawing.delete(ctx);
  listeners.delete(ctx);
  return now.shot;
};

export const insideCamera = (ctx: CanvasRenderingContext2D): boolean => (depths.get(ctx) ?? 0) > 0;

export interface Drift {
  readonly zoom: number;
  readonly x: number;
}

export const DRIFT: Drift = { zoom: 0.03, x: 24 };

export const driftHeld = (hold: number): number => 1 - Math.min(1, Math.max(0, hold));

const drifted = (
  ctx: CanvasRenderingContext2D,
  out: Camera,
  cam: Camera,
  share: number,
): Camera => {
  out.x = cam.x;
  out.y = cam.y;
  out.zoom = cam.zoom ?? 1;
  out.rot = cam.rot ?? 0;
  const scene = breaths.get(ctx);
  if (scene === undefined || !drawing.has(ctx) || insideCamera(ctx)) return out;
  scene.shot = true;
  if (scene.outer || share <= 0) return out;
  const breath = breathAt(scene.drift, scene.through);
  if (breath === 0 || scene.drift === 0) return out;
  out.zoom *= 1 + scene.drift.zoom * share * breath;
  out.x += (scene.drift.x * share * breath) / out.zoom;
  return out;
};

const breathing: Camera = { x: 0, y: 0 };

const aim = (ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) => {
  ctx.translate(w / 2, h / 2);
  if (cam.rot !== undefined && cam.rot !== 0) ctx.rotate(cam.rot);
  const z = cam.zoom ?? 1;
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
};

const tell = (ctx: CanvasRenderingContext2D, cam: Camera, framed: Camera, w: number, h: number) => {
  if (insideCamera(ctx)) return;
  const heard = listeners.get(ctx);
  if (heard === undefined) return;
  ctx.save();
  aim(ctx, cam, w, h);
  const inside = ctx.getTransform();
  ctx.restore();
  ctx.save();
  aim(ctx, framed, w, h);
  const aimed = ctx.getTransform();
  ctx.restore();
  heard(inside, aimed);
};

const deeper = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  const depth = depths.get(ctx) ?? 0;
  depths.set(ctx, depth + 1);
  draw();
  depths.set(ctx, depth);
};

export const inset = (ctx: CanvasRenderingContext2D, draw: () => void) => deeper(ctx, draw);

const shoot = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
  framed: Camera | undefined,
) => {
  if (framed !== undefined) tell(ctx, cam, framed, w, h);
  ctx.save();
  aim(ctx, cam, w, h);
  deeper(ctx, draw);
  ctx.restore();
};

export const knobCamera = (
  [x, y]: readonly [number, number],
  zoom: number,
  rot?: number,
): Camera => (rot === undefined ? { x, y, zoom } : { x, y, zoom, rot });

export const pushOn = (cam: Camera, by: number, k: number): Camera => ({
  ...cam,
  zoom: (cam.zoom ?? 1) * lerp(1, by, k),
});

export const lerpCamera = (out: Camera, a: Camera, b: Camera, t: number): Camera => {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.zoom = lerp(a.zoom ?? 1, b.zoom ?? 1, t);
  out.rot = lerp(a.rot ?? 0, b.rot ?? 0, t);
  return out;
};

const PAN_ONLY = 1e-3;

export const pushInto = (out: Camera, a: Camera, b: Camera, t: number): Camera => {
  const za = a.zoom ?? 1;
  const zb = b.zoom ?? 1;
  const ratio = Math.log(zb / za);
  if (!(Math.abs(ratio) > PAN_ONLY)) return lerpCamera(out, a, b, t);
  const z = za * Math.exp(ratio * t);
  const px = (zb * b.x - za * a.x) / (zb - za);
  const py = (zb * b.y - za * a.y) / (zb - za);
  const k = za / z;
  const ax = a.x;
  const ay = a.y;
  out.rot = lerp(a.rot ?? 0, b.rot ?? 0, t);
  out.x = px - (px - ax) * k;
  out.y = py - (py - ay) * k;
  out.zoom = z;
  return out;
};

type CameraBlend = (out: Camera, a: Camera, b: Camera, t: number) => Camera;

type ShotStop =
  | readonly [progress: number, to: Camera]
  | readonly [progress: number, to: Camera, blend: CameraBlend];

export const shotPath = (
  base: Camera,
  stops: ReadonlyArray<ShotStop>,
  out: Camera = { x: 0, y: 0 },
): Camera => {
  out.x = base.x;
  out.y = base.y;
  out.zoom = base.zoom ?? 1;
  out.rot = base.rot ?? 0;
  for (const [progress, to, blend = lerpCamera] of stops) blend(out, out, to, progress);
  return out;
};

export const camera = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
  drift = 1,
) => shoot(ctx, drifted(ctx, breathing, cam, drift), w, h, draw, cam);

interface Plane {
  z: number;
  lift?: number;
  draw: () => void;
}

export const PLANE_LIFT_MIN = 0.4;
export const PLANE_LIFT_MAX = 2.5;

const planeLift = (z: number) =>
  Math.min(PLANE_LIFT_MAX, Math.max(PLANE_LIFT_MIN, 1 / Math.max(z, 1e-3)));

interface Depth {
  rest?: readonly [number, number];
  haze?: string | ReadonlyArray<readonly [number, Hex | Clear]>;
  thickness?: number;
  blur?: number;
  fibre?: number;
  drift?: number;
}

const planing: Camera = { x: 0, y: 0 };

export const planeView = (
  out: Camera,
  cam: Camera,
  z: number,
  rest: readonly [number, number],
): Camera => {
  const d = Math.max(z, 1e-3);
  const [rx, ry] = rest;
  out.x = rx + (cam.x - rx) / d;
  out.y = ry + (cam.y - ry) / d;
  out.zoom = (cam.zoom ?? 1) ** (1 / d);
  out.rot = cam.rot ?? 0;
  return out;
};

const clearance = (z: number, thickness: number) => Math.exp(-thickness * Math.max(0, z - 1));

export const multiplane = (
  ctx: CanvasRenderingContext2D,
  framed: Camera,
  w: number,
  h: number,
  planes: ReadonlyArray<Plane>,
  depth: Depth = {},
) => {
  const cam: Camera = { ...drifted(ctx, planing, framed, depth.drift ?? 1) };
  const rest = depth.rest ?? [w / 2, h / 2];
  const haze = depth.haze;
  const thickness = depth.thickness ?? 0;
  const ordered = [...planes].sort((a, b) => b.z - a.z);
  tell(ctx, cam, framed, w, h);
  ordered.forEach((plane, i) => {
    const z = Math.max(plane.z, 1e-3);
    const view = planeView({ x: 0, y: 0 }, cam, z, rest);
    const soft = (depth.blur ?? 0) * Math.abs(z - 1);
    ctx.save();
    if (soft > 0.05) ctx.filter = `blur(${soft.toFixed(2)}px)`;
    raised(ctx, plane.lift ?? planeLift(z), () => shoot(ctx, view, w, h, plane.draw, undefined));
    ctx.restore();
    if (i === 0) planeFibre(ctx, view, w, h, depth.fibre ?? PLANE_FIBRE);
    const nearer = ordered[i + 1]?.z ?? 1;
    const veil = 1 - clearance(z, thickness) / clearance(nearer, thickness);
    if (haze !== undefined && veil > 1e-3) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha *= veil;
      if (Predicate.isString(haze)) {
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      } else sky(ctx, ctx.canvas.width, ctx.canvas.height, haze);
      ctx.restore();
    }
  });
};
