import type { Skeleton } from '@manna/film/core';
import { Match, Option } from 'effect';
import type { Pt } from './rules.ts';

export type Rooted = Skeleton & { readonly root: Pt };

type StrokeLimb = NonNullable<Skeleton['limbs']>[number];

type Side = 'right' | 'left';

export type Facing = 'front' | 'back';

export interface FlapBand {
  readonly above: number;
  readonly below: number;
  readonly reach: number;
}

export interface Arms {
  readonly right?: string;
  readonly left?: string;
}

interface BothArms {
  readonly right: string;
  readonly left: string;
}

export interface Body<A extends Arms = BothArms> {
  readonly skin: Skeleton['skin'];
  readonly arms: A;
  readonly from: string;
  readonly band: FlapBand;
}

interface Trunk {
  readonly facing: Facing;
  readonly hip: Pt;
  readonly neck: Pt;
  readonly chin: Pt;
  readonly crown: Pt;
}

interface Limbed<A extends Arms> {
  readonly limbs?: ReadonlyArray<Extract<keyof A, Side>>;
}

interface RightArm {
  readonly shoulderRight: Pt;
  readonly elbowRight: Pt;
  readonly wristRight: Pt;
  readonly handRight: Pt;
  readonly flapRight: number;
  readonly capRight: number;
  readonly cuffRight?: Pt;
}

interface LeftArm {
  readonly shoulderLeft: Pt;
  readonly elbowLeft: Pt;
  readonly wristLeft: Pt;
  readonly handLeft: Pt;
  readonly flapLeft: number;
  readonly capLeft: number;
  readonly cuffLeft?: Pt;
}

export type Standing<A extends Arms = BothArms> = Trunk &
  Limbed<A> &
  (A extends { readonly right: string } ? RightArm : Record<never, never>) &
  (A extends { readonly left: string } ? LeftArm : Record<never, never>);

type Read = Trunk & Limbed<Arms> & Partial<RightArm> & Partial<LeftArm>;

interface Arm {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly wrist: Pt;
  readonly hand: Pt;
  readonly flap: number;
  readonly cap: number;
}

interface Stroke {
  readonly drawn: boolean;
  readonly cuff: Option.Option<Pt>;
}

const flapRegion = (
  band: FlapBand,
  shoulder: Pt,
  edge: number,
  onViewersLeft: boolean,
): ReadonlyArray<Pt> => {
  const [top, bottom] = [shoulder[1] - band.above, shoulder[1] + band.below];
  const [x0, x1] = Match.value(onViewersLeft).pipe(
    Match.when(true, (): Pt => [-1, edge]),
    Match.orElse((): Pt => [edge, shoulder[0] + band.reach]),
  );
  return [
    [x0, top],
    [x1, top],
    [x1, bottom],
    [x0, bottom],
  ];
};

const limb = (
  side: 'Right' | 'Left',
  body: Body<Arms>,
  part: Option.Option<string>,
  joints: Option.Option<Arm>,
  onViewersLeft: boolean,
  stroke: Stroke,
) =>
  Option.all([part, joints]).pipe(
    Option.map(([name, a]) => ({
      bones: [
        { name: `shoulder${side}`, parent: 'lean', pivot: a.shoulder, tip: a.elbow },
        { name: `elbow${side}`, parent: `shoulder${side}`, pivot: a.elbow, tip: a.wrist },
        { name: `wrist${side}`, parent: `elbow${side}`, pivot: a.wrist, tip: a.hand },
      ],
      flap: {
        part: name,
        from: body.from,
        bone: `shoulder${side}`,
        body: 'lean',
        cap: a.cap,
        region: flapRegion(body.band, a.shoulder, a.flap, onViewersLeft),
      },
      stroke: Option.some(stroke).pipe(
        Option.filter((s) => s.drawn),
        Option.map((s): StrokeLimb => ({
          part: name,
          bones: [`shoulder${side}`, `elbow${side}`, `wrist${side}`],
          ...Option.match(s.cuff, { onNone: () => ({}), onSome: (cuff) => ({ cuff }) }),
        })),
      ),
    })),
  );

const standingOf = (body: Body<Arms>, s: Read): Rooted => {
  const stroked = Option.getOrElse(Option.fromUndefinedOr(s.limbs), (): ReadonlyArray<Side> => []);
  const limbs = [
    limb(
      'Right',
      body,
      Option.fromUndefinedOr(body.arms.right),
      Option.all({
        shoulder: Option.fromUndefinedOr(s.shoulderRight),
        elbow: Option.fromUndefinedOr(s.elbowRight),
        wrist: Option.fromUndefinedOr(s.wristRight),
        hand: Option.fromUndefinedOr(s.handRight),
        flap: Option.fromUndefinedOr(s.flapRight),
        cap: Option.fromUndefinedOr(s.capRight),
      }),
      s.facing === 'front',
      { drawn: stroked.includes('right'), cuff: Option.fromUndefinedOr(s.cuffRight) },
    ),
    limb(
      'Left',
      body,
      Option.fromUndefinedOr(body.arms.left),
      Option.all({
        shoulder: Option.fromUndefinedOr(s.shoulderLeft),
        elbow: Option.fromUndefinedOr(s.elbowLeft),
        wrist: Option.fromUndefinedOr(s.wristLeft),
        hand: Option.fromUndefinedOr(s.handLeft),
        flap: Option.fromUndefinedOr(s.flapLeft),
        cap: Option.fromUndefinedOr(s.capLeft),
      }),
      s.facing === 'back',
      { drawn: stroked.includes('left'), cuff: Option.fromUndefinedOr(s.cuffLeft) },
    ),
  ].flatMap((l) => Option.toArray(l));
  return {
    bones: [
      { name: 'lean', pivot: s.hip, tip: s.neck },
      { name: 'neck', parent: 'lean', pivot: s.neck, tip: s.chin },
      { name: 'head', parent: 'neck', pivot: s.chin, tip: s.crown },
      ...limbs.flatMap((l) => l.bones),
    ],
    skin: body.skin,
    flaps: limbs.map((l) => l.flap),
    limbs: limbs.flatMap((l) => Option.toArray(l.stroke)),
    root: s.hip,
  };
};

export const standing = <A extends Arms = BothArms>(body: Body<A>, s: Standing<A>): Rooted =>
  standingOf(body, s);

export const framed = ([dx, dy]: Pt, s: Rooted): Rooted => {
  const at = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  return {
    bones: s.bones.map((b) => ({ ...b, pivot: at(b.pivot), tip: at(b.tip) })),
    skin: s.skin,
    flaps: Option.getOrElse(Option.fromUndefinedOr(s.flaps), () => []).map((f) => ({
      ...f,
      region: f.region.map(at),
    })),
    limbs: Option.getOrElse(Option.fromUndefinedOr(s.limbs), () => []).map((l) => ({
      ...l,
      ...Option.match(Option.fromUndefinedOr(l.cuff), {
        onNone: () => ({}),
        onSome: (cuff) => ({ cuff: at(cuff) }),
      }),
    })),
    root: at(s.root),
  };
};
