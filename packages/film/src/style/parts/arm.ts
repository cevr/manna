import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { GarmentTones, Paper } from '../paper.ts';
import type { Pt } from '../rig/parts.ts';
import { Outline, Point } from './measure.ts';

const ArmPart = Schema.TaggedStruct('Arm', {
  pivot: Point,
  rest: Schema.Finite,
  outline: Outline,
  hand: Point,
  paper: Paper,
  tones: Schema.optionalKey(GarmentTones),
});
export type Arm = typeof ArmPart.Type;

const JointedArmPart = Schema.TaggedStruct('JointedArm', {
  pivot: Point,
  rest: Schema.Finite,
  outline: Outline,
  elbow: Point,
  bend: Schema.Finite,
  forearm: Outline,
  hand: Point,
  paper: Paper,
  tones: Schema.optionalKey(GarmentTones),
  forearmTones: Schema.optionalKey(GarmentTones),
});
export type JointedArm = typeof JointedArmPart.Type;

export type AnyArm = Arm | JointedArm;

export const ARM_SIDES = ['near', 'far'] as const;
export type ArmSide = (typeof ARM_SIDES)[number];

const decodeWholeArm = decoder(ArmPart, { fields: { ink: 'InteriorInk' } });

const decodeJointedArm = decoder(JointedArmPart, { fields: { ink: 'InteriorInk' } });

type ArmFields = typeof ArmPart.Encoded | typeof JointedArmPart.Encoded;

export const decodeArm = (input: ArmFields, part: string): AnyArm =>
  input._tag === 'JointedArm' ? decodeJointedArm(input, part) : decodeWholeArm(input, part);

export const Arm = (o: Omit<Arm, '_tag'>): Arm => decodeWholeArm({ _tag: 'Arm', ...o }, 'Arm');

export const JointedArm = (o: Omit<JointedArm, '_tag'>): JointedArm =>
  decodeJointedArm({ _tag: 'JointedArm', ...o }, 'JointedArm');

const turned = (p: Pt, about: Pt, by: number): Pt => {
  const [dx, dy] = [p[0] - about[0], p[1] - about[1]];
  const [cos, sin] = [Math.cos(by), Math.sin(by)];
  return [about[0] + dx * cos - dy * sin, about[1] + dx * sin + dy * cos];
};

export const armHand = (arm: AnyArm, turn: number, bend = 0): Pt =>
  arm._tag === 'Arm'
    ? turned(arm.hand, arm.pivot, turn)
    : turned(turned(arm.hand, arm.elbow, bend), arm.pivot, turn);

const within = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type Reach = { readonly turn: number; readonly bend: number; readonly hand: Pt };

export const armReach = (arm: JointedArm, target: Pt, elbow: 'rest' | 'out' = 'rest'): Reach => {
  const [s, e, h] = [arm.pivot, arm.elbow, arm.hand];
  const upper = Math.hypot(e[0] - s[0], e[1] - s[1]);
  const fore = Math.hypot(h[0] - e[0], h[1] - e[1]);
  const [dx, dy] = [target[0] - s[0], target[1] - s[1]];
  const span = Math.hypot(dx, dy);
  const d = Math.min(upper + fore, Math.max(Math.abs(upper - fore), span));
  const toward = Math.atan2(dy, dx);
  const cosine = d === 0 ? 0 : (upper * upper + d * d - fore * fore) / (2 * upper * d);
  const open = Math.acos(Math.min(1, Math.max(-1, cosine)));
  const out = Math.sign(s[0]) || 1;
  const elbowAt = (a: number): Pt => [s[0] + upper * Math.cos(a), s[1] + upper * Math.sin(a)];
  const [a1, a2] = [toward + open, toward - open];
  const side = (p: Pt) => dx * (p[1] - s[1]) - dy * (p[0] - s[0]);
  const rest = Math.sign(side(h));
  const [e1, e2] = [elbowAt(a1), elbowAt(a2)];
  const a =
    rest === 0 || elbow === 'out'
      ? (e1[0] - e2[0]) * out >= 0
        ? a1
        : a2
      : Math.sign(side(e1)) === rest
        ? a1
        : a2;
  const turn = within(a - Math.atan2(e[1] - s[1], e[0] - s[0]));
  const bent = elbowAt(a);
  const reach: Pt = [s[0] + (dx / (span || 1)) * d, s[1] + (dy / (span || 1)) * d];
  const forearm = Math.atan2(reach[1] - bent[1], reach[0] - bent[0]);
  const bend = within(forearm - Math.atan2(h[1] - e[1], h[0] - e[0]) - turn);
  return { turn, bend, hand: armHand(arm, turn, bend) };
};
