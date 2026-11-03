import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import type { Pt } from '../rig/parts.ts';
import { Length, Point, Units } from './measure.ts';

const Shape = Schema.Struct({
  eyes: Schema.optionalKey(Point),
  eyeY: Schema.optionalKey(Units),
  eye: Schema.optionalKey(Schema.Tuple([Length, Length])),
  roam: Schema.optionalKey(Units),
  turn: Schema.optionalKey(Units),
  turnPull: Schema.optionalKey(Units),
  brows: Schema.optionalKey(Point),
  browY: Schema.optionalKey(Units),
  browHalf: Schema.optionalKey(Length),
  brow: Schema.optionalKey(Length),
  mouth: Schema.optionalKey(Point),
  mouthHalf: Schema.optionalKey(Length),
  mouthLine: Schema.optionalKey(Length),
});

const Rest = Schema.Struct({
  browY: Schema.optionalKey(Units),
  browTilt: Schema.optionalKey(Units),
  eyes: Schema.optionalKey(Units),
  eyeW: Schema.optionalKey(Units),
  mouth: Schema.optionalKey(Units),
  mouthLine: Schema.optionalKey(Units),
  mouthOpen: Schema.optionalKey(Units),
});

const KitAPart = Schema.TaggedStruct('KitA', {
  x: Units,
  y: Units,
  scale: Length,
  rotation: Schema.optionalKey(Units),
  eyeLean: Schema.optionalKey(Units),
  shape: Schema.optionalKey(Shape),
  rest: Schema.optionalKey(Rest),
  gaze: Point,
  extra: Schema.optionalKey(
    Schema.Array(Schema.Literals(['wince', 'glad', 'marksY', 'mouthY', 'mouthW'])),
  ),
  layer: Schema.optionalKey(Schema.Literal('over')),
});
export type KitA = typeof KitAPart.Type;

export const decodeKit = decoder(KitAPart, { any: 'KitA' });

export const KitA = (o: Omit<KitA, '_tag'>): KitA => decodeKit({ _tag: 'KitA', ...o }, 'KitA');

interface TracedMarks {
  readonly eyes: readonly [Pt, Pt];
  readonly eye: readonly [number, number];
  readonly brows: readonly [readonly [Pt, Pt], readonly [Pt, Pt]];
  readonly brow: number;
  readonly mouth: readonly [Pt, Pt];
  readonly mouthLine: number;
}

interface Panel {
  readonly scale: number;
  readonly head: Pt;
}

const hundredth = (v: number) => +v.toFixed(2);

export const tracedKit = (m: TracedMarks, panel: Panel, turn: number) => {
  const [l, r] = m.eyes;
  const c: Pt = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  const rotation = Math.atan2(r[1] - l[1], r[0] - l[0]);
  const [cos, sin] = [Math.cos(-rotation), Math.sin(-rotation)];
  const local = ([x, y]: Pt): Pt => {
    const [dx, dy] = [x - c[0], y - c[1]];
    return [(dx * cos - dy * sin) * panel.scale, (dx * sin + dy * cos) * panel.scale];
  };
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const half = (a: Pt, b: Pt) => (Math.hypot(b[0] - a[0], b[1] - a[1]) / 2) * panel.scale;
  const [eyeL, eyeR] = [local(l), local(r)];
  const [browL, browR] = [local(mid(...m.brows[0])), local(mid(...m.brows[1]))];
  const mouth = local(mid(...m.mouth));
  return {
    x: hundredth((c[0] - panel.head[0]) * panel.scale),
    y: hundredth((c[1] - panel.head[1]) * panel.scale),
    scale: 1,
    rotation: hundredth(rotation),
    shape: {
      eyes: [hundredth(eyeL[0]), hundredth(eyeR[0])],
      eyeY: hundredth((eyeL[1] + eyeR[1]) / 2),
      eye: [hundredth(m.eye[0] * panel.scale), hundredth(m.eye[1] * panel.scale)],
      turn,
      brows: [hundredth(browL[0]), hundredth(browR[0])],
      browY: hundredth((browL[1] + browR[1]) / 2),
      browHalf: hundredth((half(...m.brows[0]) + half(...m.brows[1])) / 2),
      brow: hundredth(m.brow * panel.scale),
      mouth: [hundredth(mouth[0]), hundredth(mouth[1])],
      mouthHalf: hundredth(half(...m.mouth)),
      mouthLine: hundredth(m.mouthLine * panel.scale),
    },
  } as const;
};
