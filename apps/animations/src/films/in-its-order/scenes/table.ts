import { ground, type PuppetLook, type PuppetPose, type PuppetSpec } from '@manna/film/canvas';
import { act, blink, idle, lag } from '@manna/film/core';
import { Array as Arr, Option } from 'effect';
import { HEADED as MAN_HEADED } from '../../../library/cast/feast-guest-man/cutout/heads.ts';
import { SEATED as MAN } from '../../../library/cast/feast-guest-man/cutout/seated.ts';
import { HEADED as WOMAN_HEADED } from '../../../library/cast/feast-guest-woman/cutout/heads.ts';
import { SEATED as WOMAN } from '../../../library/cast/feast-guest-woman/cutout/seated.ts';
import { DRAWINGS, PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import {
  RAISE_SEATED,
  type RaiseKey,
} from '../../../library/cast/lead-feast/cutout/raise-seated.ts';
import leadShut from '../../../library/cast/lead-feast/cutout/sheets/single-9/head-closed.png' with { type: 'file' };
import leadWince from '../../../library/cast/lead-feast/cutout/sheets/single-5/head.png' with { type: 'file' };
import type { Pt } from '../../../library/cutout/rules.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
import motherShut from '../cast/feast-mother/cutout/sheets/poses-1/head-closed.png' with { type: 'file' };

const FLOOR = 925;

const LEAD_SEAT = { x: 768, head: 80, box: [138, 0, 497, 433], root: [304, 663], h: 1115 } as const;

const FACE = (206 * LEAD_SEAT.head) / (LEAD_SEAT.box[2] - LEAD_SEAT.box[0]);

const GUESTS = {
  man: { x: 544, head: FACE, box: [136, 97, 297, 270], root: MAN.ground.at, h: MAN.size[1] },
  lead: LEAD_SEAT,
  woman: { x: 925, head: FACE, box: [115, 76, 277, 264], root: WOMAN.ground.at, h: WOMAN.size[1] },
} as const;

export type GuestKey = keyof typeof MAN.paintings;

const MAN_TINT = 'saturate(1.3)';

export const MOTHER_SEAT = {
  at: [1012, 730],
  eyes: [180, 153],
  head: 70,
  box: [78, 0, 365, 240],
  root: [193, 448],
} as const;

const { line: _line, ...MOTHER_POSES } = MOTHER['poses-1'];

const { line: _leadLine, ...LEAD_SEATED } = LEAD['single-9'];

const { line: _manLine, ...MAN_POSES } = MAN_HEADED;

const { line: _womanLine, ...WOMAN_POSES } = WOMAN_HEADED;

export const TABLE_PUPPETS = {
  mother: { ...MOTHER_POSES, drawings: [{ name: 'shut', png: motherShut, part: 'head' }] },
  man: MAN_POSES,
  woman: WOMAN_POSES,
  lead: {
    ...LEAD_SEATED,
    drawings: [
      { name: 'shut', png: leadShut, part: 'head' },
      { name: 'wince', png: leadWince },
      ...DRAWINGS['single-9'],
    ],
  },
} as const;

const boneOf = (skeleton: PuppetSpec['skeleton'], name: string) =>
  Option.getOrThrow(Arr.findFirst(skeleton.bones, (b) => b.name === name));

export const headMiddle = (skeleton: PuppetSpec['skeleton']): Pt => {
  const { pivot, tip } = boneOf(skeleton, 'head');
  return [(pivot[0] + tip[0]) / 2, (pivot[1] + tip[1]) / 2];
};

const ON_SHEET = { s: 1, dx: 0, dy: 0 } as const;

const OPEN: PuppetLook = { boil: 0, amp: 0 };

export const eyesLook = (pivot: Pt) => {
  const shut: PuppetLook = {
    ...OPEN,
    swaps: [{ part: 'head', drawing: 'shut', place: ON_SHEET, pivot }],
  };
  return (eyes: number): PuppetLook => {
    if (eyes > 0.5) return shut;
    return OPEN;
  };
};

const SHOULDER = boneOf(LEAD_SEATED.skeleton, 'shoulderRight').pivot;

export const raising = (look: PuppetLook, key: RaiseKey): PuppetLook => ({
  ...look,
  swaps: [
    ...(look.swaps ?? []),
    { part: 'armRight', drawing: key, place: ON_SHEET, pivot: SHOULDER },
  ],
});

const MOTHER_IDLE = idle(2);

const MOTHER_EYES = blink(2);

const motherEyes = eyesLook(headMiddle(MOTHER_POSES.skeleton));

export const motherLook = (t: number) => motherEyes(MOTHER_EYES(t));

const BOW = { deg: -2.5, from: 0.9, every: 8.4, down: 1.1, hold: 2.6, up: 1.3 } as const;

const BOWING = act(0, [
  { at: 0, dur: BOW.down, to: 1 },
  { at: BOW.down + BOW.hold, dur: BOW.up, to: 0 },
]);

const bow = (t: number) => {
  const into = t - BOW.from;
  return BOW.deg * BOWING(into - BOW.every * Math.floor(into / BOW.every));
};

const headBow = lag(bow, 0.1);

export const motherNumbers = (t: number) => {
  const { sway, breath, drift, tilt } = MOTHER_IDLE(t);
  return {
    lean: sway + 1.2 * breath + 0.5 * drift + 0.6 * bow(t),
    neck: 0.3 * tilt + 0.15 * bow(t),
    head: 0.6 * tilt + 0.25 * headBow(t),
  };
};

const MAN_IDLE = idle(3);

export const MAN_HEAD_LIMIT = 4;

export const MAN_LEAN_LIMIT = 3;

const WOMAN_IDLE = idle(4);

export const WOMAN_HEAD_LIMIT = MAN_HEAD_LIMIT;

export const WOMAN_LEAN_LIMIT = MAN_LEAN_LIMIT;

const NOD = { to: 2, hold: 0.6, dur: 0.4, dip: 0.2, settle: 0.8 } as const;

const guestNumbersOf =
  (guestIdle: ReturnType<typeof idle>, toward: 1 | -1) => (nods: ReadonlyArray<number>) => {
    const nod = act(
      0,
      nods.flatMap((at) => [
        { at, dur: NOD.dur, to: toward * NOD.to, anticipate: NOD.dip },
        { at: at + NOD.dur, dur: NOD.settle, to: toward * NOD.hold },
      ]),
    );
    const headNod = lag(nod, 0.06);
    return (t: number) => {
      const { sway, breath, drift, tilt } = guestIdle(t);
      return {
        lean: sway + 1.2 * breath + 0.5 * drift,
        neck: 0.3 * tilt + 0.35 * nod(t),
        head: 0.6 * tilt + 0.65 * headNod(t),
      };
    };
  };

export const manNumbersOf = guestNumbersOf(MAN_IDLE, 1);

export const womanNumbersOf = guestNumbersOf(WOMAN_IDLE, -1);

export interface TableFrame {
  readonly t: number;
  readonly ctx: CanvasRenderingContext2D;
  puppet(name: keyof typeof TABLE_PUPPETS, pose: PuppetPose, look?: PuppetLook): void;
}

const seat = (name: keyof typeof GUESTS): PuppetPose => {
  const g = GUESTS[name];
  const scale = g.head / (g.box[2] - g.box[0]);
  const headX = (g.box[0] + g.box[2]) / 2;
  return {
    numbers: {},
    root: [g.x + scale * (g.root[0] - headX), FLOOR - scale * (g.h - g.root[1])],
    scale,
  };
};

const LEAD_POSE = seat('lead');

const onKeys = (
  keySeat: PuppetPose,
  puppet: typeof MAN_POSES | typeof WOMAN_POSES,
  keys: typeof MAN | typeof WOMAN,
  shift: Pt,
): PuppetPose => ({
  numbers: {},
  root: [
    keySeat.root[0] +
      puppet.origin[0] +
      keySeat.scale * (puppet.skeleton.root[0] + shift[0] - keys.ground.at[0]),
    keySeat.root[1] +
      puppet.origin[1] +
      keySeat.scale * (puppet.skeleton.root[1] + shift[1] - keys.ground.at[1]),
  ],
  scale: keySeat.scale,
});

const MAN_SEAT = seat('man');

const MAN_POSE = onKeys(MAN_SEAT, MAN_POSES, MAN, [2, 2]);

const WOMAN_SEAT = seat('woman');

const WOMAN_POSE = onKeys(WOMAN_SEAT, WOMAN_POSES, WOMAN, [1, 2]);

const guestLook =
  (pivot: Pt) =>
  (key: GuestKey): PuppetLook => {
    if (key === 'neutral') return OPEN;
    return { ...OPEN, swaps: [{ part: 'head', drawing: key, place: ON_SHEET, pivot }] };
  };

const manLook = guestLook(headMiddle(MAN_POSES.skeleton));

const womanLook = guestLook(headMiddle(WOMAN_POSES.skeleton));

const posed = (
  ctx: CanvasRenderingContext2D,
  pose: PuppetPose,
  root: Pt,
  origin: Pt,
  draw: () => void,
) => {
  ctx.save();
  ctx.translate(pose.root[0] - origin[0], pose.root[1] - origin[1]);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(origin[0] - root[0], origin[1] - root[1]);
  draw();
  ctx.restore();
};

export const seatedLead = (f: TableFrame, numbers: PuppetPose['numbers'], look: PuppetLook) => {
  posed(f.ctx, LEAD_POSE, GUESTS.lead.root, LEAD_SEATED.origin, () =>
    ground(f.ctx, RAISE_SEATED.ground.at[0], RAISE_SEATED.ground.at[1], RAISE_SEATED.ground.w),
  );
  f.puppet('lead', { ...LEAD_POSE, numbers }, look);
};

const man = (f: TableFrame, key: GuestKey, nods: ReadonlyArray<number>) => {
  const { ground: shadow } = MAN;
  posed(f.ctx, MAN_SEAT, shadow.at, [0, 0], () =>
    ground(f.ctx, shadow.at[0], shadow.at[1], shadow.w),
  );
  f.ctx.save();
  f.ctx.filter = MAN_TINT;
  f.puppet('man', { ...MAN_POSE, numbers: manNumbersOf(nods)(f.t) }, manLook(key));
  f.ctx.restore();
};

const woman = (f: TableFrame, key: GuestKey, nods: ReadonlyArray<number>) => {
  const { ground: shadow } = WOMAN;
  posed(f.ctx, WOMAN_SEAT, shadow.at, [0, 0], () =>
    ground(f.ctx, shadow.at[0], shadow.at[1], shadow.w),
  );
  f.puppet('woman', { ...WOMAN_POSE, numbers: womanNumbersOf(nods)(f.t) }, womanLook(key));
};

const mother = (f: TableFrame) => {
  const scale = MOTHER_SEAT.head / (MOTHER_SEAT.box[2] - MOTHER_SEAT.box[0]);
  f.puppet(
    'mother',
    {
      numbers: motherNumbers(f.t),
      root: [
        MOTHER_SEAT.at[0] + scale * (MOTHER_SEAT.root[0] - MOTHER_SEAT.eyes[0]),
        MOTHER_SEAT.at[1] + scale * (MOTHER_SEAT.root[1] - MOTHER_SEAT.eyes[1]),
      ],
      scale,
    },
    motherLook(f.t),
  );
};

export const seatTable = (
  f: TableFrame,
  key: GuestKey,
  nods: ReadonlyArray<number>,
  lead: () => void,
) => {
  mother(f);
  man(f, key, nods);
  lead();
  woman(f, key, nods);
};
