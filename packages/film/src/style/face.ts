import { lerp } from '../core/time.ts';
import { type FaceKnob, smooth } from './rig/parts.ts';

export type Expression = Readonly<Record<Exclude<FaceKnob, 'gazeX' | 'gazeY' | 'follow'>, number>>;

export const EASE: Expression = {
  browY: 0,
  browTilt: 0.12,
  eyes: 1,
  eyeW: 1,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
};

const KEYS = [
  'browY',
  'browTilt',
  'eyes',
  'eyeW',
  'mouth',
  'mouthLine',
  'mouthOpen',
] as const satisfies ReadonlyArray<keyof Expression>;

const toward = (out: Record<keyof Expression, number>, to: Expression, k: number) => {
  for (const key of KEYS) out[key] = lerp(out[key], to[key], Math.max(0, Math.min(1, k)));
};

type Beat = readonly [Expression, number];

export const acted = (
  out: Record<keyof Expression, number>,
  from: Expression,
  beats: ReadonlyArray<Beat>,
) => {
  Object.assign(out, from);
  for (const [to, k] of beats) toward(out, to, k);
  out.mouthLine = Math.min(out.mouthLine, 1 - smooth(0.05, 0.3, out.mouthOpen));
  return out;
};
