import type { Pt } from '../ink.ts';
import { blendedFace, layeredFace, stretchOf } from '../cutout.ts';
import { offscreen } from '../paper.ts';

export interface FaceCase {
  readonly name: string;
  readonly m: readonly [number, number, number, number, number, number];
  readonly color: string;
}

export interface FaceDelta {
  readonly name: string;
  readonly color: string;
  readonly blended: boolean;
  readonly max: number;
  readonly mean: number;
}

const W = 800;
const H = 600;
const hand = { seed: 12345, boil: 3 };

const circle = (r: number): Pt[] =>
  Array.from({ length: 96 }, (_, i): Pt => {
    const a = (i / 96) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

const draw = (face: FaceCase, blended: boolean) => {
  const { ctx } = offscreen(W, H);
  ctx.fillStyle = '#e9dfc7';
  ctx.fillRect(0, 0, W, H);
  const [a, b, c, d, e, f] = face.m;
  ctx.setTransform(a, b, c, d, e, f);
  const pts = circle(270 / stretchOf({ a, b, c, d }));
  const style = { color: face.color };
  const took = blended && blendedFace(ctx, pts, style, 0.6, hand);
  if (!took) layeredFace(ctx, pts, style, 0.6, hand);
  return { took, data: ctx.getImageData(0, 0, W, H).data };
};

const compare = (face: FaceCase): FaceDelta => {
  const fast = draw(face, true);
  const look = draw(face, false);
  let max = 0;
  let sum = 0;
  for (let i = 0; i < fast.data.length; i += 4)
    for (let k = 0; k < 3; k++) {
      const d = Math.abs((fast.data[i + k] ?? 0) - (look.data[i + k] ?? 0));
      sum += d;
      if (d > max) max = d;
    }
  return {
    name: face.name,
    color: face.color,
    blended: fast.took,
    max,
    mean: sum / ((fast.data.length / 4) * 3),
  };
};

const faceDeltas = (cases: ReadonlyArray<FaceCase>): FaceDelta[] => cases.map(compare);
Object.assign(globalThis, { faceDeltas });
