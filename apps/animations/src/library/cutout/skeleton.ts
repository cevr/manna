// A cut view's skeleton (`core/puppet.ts`), read in the kept view's pixels and
// moved into its part sheet's frame (`frames.ts`). A standing figure's lean
// runs from the hip to the base of the neck, the neck and head above it, and
// each arm's shoulder, elbow and wrist on the joints the member's cut records,
// the wrist at the cuff and its tip at the circle hand's middle. Each sleeve
// takes its shoulder's flap of the member's body part (that part's own pixels
// beside its cap, in a band about its pivot and outside its inner edge),
// resting on the lean. Bone names are the shared control names; the member
// names his parts, which bones each lies on, the flaps' part and the band
// (`Body`). A view that does not draw an arm (a profile) names no part for
// it: that arm has no bones and no flap, and its view gives no joints for it.
// Every arm a view draws is a stroke limb (`core/limb.ts`), declared on its
// shoulder, elbow and wrist, its sleeve ending at the wrist pivot unless the
// view gives its cuff; a view keeps an arm painted only by naming it, by his
// own side, with why (`painted`). An arm the measure refuses stays painted
// too, and its puppet says why (`Puppet.refused`).

import type { Skeleton } from '@manna/film/core';
import { Match, Option } from 'effect';
import type { Pt } from './rules.ts';

/** An arm a view keeps painted rather than drawn as a stroke limb: its part, and why. */
export const LIMB_LIMITS = { whole: 12, exposed: 8, unprotected: 0, ghost: 0 } as const;

/** A measured condition that keeps an arm painted. Its current value is
 * computed by the sweep; only the measure, pose and bound are recorded. */
export type ArmFailure = {
  [M in keyof typeof LIMB_LIMITS]: {
    readonly measure: M;
    readonly elbow: number;
    readonly wrist: number;
    readonly bound: (typeof LIMB_LIMITS)[M];
  };
}[keyof typeof LIMB_LIMITS];

export interface PaintedArm {
  readonly part: string;
  readonly reason: readonly [ArmFailure, ...ReadonlyArray<ArmFailure>];
  readonly limb: StrokeLimb;
}

/** A printable opt-out condition, derived from its typed measure and pose. */
export const paintedReason = (arm: PaintedArm) =>
  arm.reason
    .map((r) => `${r.measure} > ${r.bound} at elbow/wrist ${r.elbow}/${r.wrist}`)
    .join('; ');

/** A skeleton with its root (where the puppet stands), and the arms its view keeps painted. */
export type Rooted = Skeleton & {
  readonly root: Pt;
  readonly painted?: ReadonlyArray<PaintedArm>;
};

/** A stroke limb as a skeleton declares it (`core/limb.ts`'s `PuppetLimb`). */
type StrokeLimb = NonNullable<Skeleton['limbs']>[number];

/** His own sides, as his arms name them. */
type Side = 'right' | 'left';

/** Which way a view faces: from the front his right arm is on the viewer's left; from the back, on the viewer's right. */
export type Facing = 'front' | 'back';

/** A flap's band about its shoulder, view pixels: rows above and below the pivot, and how far past the pivot it reaches on the side away from the sheet's edge. */
export interface FlapBand {
  readonly above: number;
  readonly below: number;
  readonly reach: number;
}

/** A member's arms' parts, by his own side; an arm a view does not draw is absent. */
export interface Arms {
  readonly right?: string;
  readonly left?: string;
}

/** Both arms drawn: the arms of a view from the front, the back or three-quarters. */
interface BothArms {
  readonly right: string;
  readonly left: string;
}

/** What a member's standing views share: his parts as his part sheets name them, the bones each lies on, his arms' parts, the part each sleeve's flap is taken from, and the flap band. */
export interface Body<A extends Arms = BothArms> {
  readonly skin: Skeleton['skin'];
  readonly arms: A;
  readonly from: string;
  readonly band: FlapBand;
}

/** The places a standing view's lean, neck and head are read from, view pixels, and the way the view faces. */
interface Trunk {
  readonly facing: Facing;
  readonly hip: Pt;
  readonly neck: Pt;
  readonly chin: Pt;
  readonly crown: Pt;
}

/** The arms a view keeps painted, by his own side, of those its body names, each with why its stroke limb is not drawn; every other arm it draws is a stroke limb. */
interface Limbed<A extends Arms> {
  readonly painted?: Partial<Readonly<Record<Extract<keyof A, Side>, PaintedArm['reason']>>>;
}

/** His right arm's joints, its flap's inner edge (x: the arm on the viewer's left takes the body left of it, on the viewer's right the body right of it), its cap radius (the member's cut), and, where its sleeve does not end at the wrist pivot, where it ends on the forearm (its stroke limb's cuff). */
interface RightArm {
  readonly shoulderRight: Pt;
  readonly elbowRight: Pt;
  readonly wristRight: Pt;
  readonly handRight: Pt;
  readonly flapRight: number;
  readonly capRight: number;
  readonly cuffRight?: Pt;
}

/** His left arm's joints, flap's inner edge, cap radius and cuff, as `RightArm`. */
interface LeftArm {
  readonly shoulderLeft: Pt;
  readonly elbowLeft: Pt;
  readonly wristLeft: Pt;
  readonly handLeft: Pt;
  readonly flapLeft: number;
  readonly capLeft: number;
  readonly cuffLeft?: Pt;
}

/** The places a standing view's skeleton is read from, view pixels: the trunk, the joints of each arm its body names, and the arms it draws as stroke limbs. */
export type Standing<A extends Arms = BothArms> = Trunk &
  Limbed<A> &
  (A extends { readonly right: string } ? RightArm : Record<never, never>) &
  (A extends { readonly left: string } ? LeftArm : Record<never, never>);

/** A standing view as read, each arm's joints there or not. */
type Read = Trunk & Limbed<Arms> & Partial<RightArm> & Partial<LeftArm>;

/** One arm's joints, its flap's inner edge and its cap. */
interface Arm {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly wrist: Pt;
  readonly hand: Pt;
  readonly flap: number;
  readonly cap: number;
}

/** Why a view keeps an arm painted, if it does, and the cuff it gives that arm, if any. */
interface Stroke {
  readonly painted: Option.Option<PaintedArm['reason']>;
  readonly cuff: Option.Option<Pt>;
}

/** A flap's region: the band about the shoulder, on its outer side: out to the sheet's left edge for the arm on the viewer's left, out by the band's reach for the arm on the viewer's right. */
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

/** Arm `part`'s stroke limb on its side's shoulder, elbow and wrist, its sleeve ending at `cuff` where given. */
const strokeLimb = (side: 'Right' | 'Left', part: string, cuff: Option.Option<Pt>): StrokeLimb => ({
  part,
  bones: [`shoulder${side}`, `elbow${side}`, `wrist${side}`],
  ...Option.match(cuff, { onNone: () => ({}), onSome: (at) => ({ cuff: at }) }),
});

/**
 * The stroke limbs of a skeleton written out by hand (a pose outside a
 * standing band), one for each arm `arms` names, each on its side's shoulder,
 * elbow and wrist bones, its sleeve ending at the wrist pivot: every arm a
 * view draws is a stroke limb, as `standing` declares them.
 */
export const armLimbs = (arms: Arms): ReadonlyArray<StrokeLimb> => [
  ...Option.toArray(Option.fromUndefinedOr(arms.right)).map((p) =>
    strokeLimb('Right', p, Option.none()),
  ),
  ...Option.toArray(Option.fromUndefinedOr(arms.left)).map((p) =>
    strokeLimb('Left', p, Option.none()),
  ),
];

/** An arm's three bones on the lean, its sleeve's flap of `body.from`, and its stroke limb unless its view keeps it painted (then why), when its body names its part and its view gives its joints. */
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
      stroke: Option.match(stroke.painted, {
        onNone: (): Option.Option<StrokeLimb> => Option.some(strokeLimb(side, name, stroke.cuff)),
        onSome: () => Option.none(),
      }),
      painted: Option.map(stroke.painted, (reason): PaintedArm => ({
        part: name,
        reason,
        limb: strokeLimb(side, name, stroke.cuff),
      })),
    })),
  );

/** A standing view's skeleton, view pixels: lean, neck and head, each drawn arm's three bones and its sleeve's flap of `body.from`, the band mirrored for a view from the back, each drawn arm's stroke limb, and the arms the view keeps painted with why. */
const standingOf = (body: Body<Arms>, s: Read): Rooted => {
  const painted: Partial<Readonly<Record<Side, PaintedArm['reason']>>> = Option.getOrElse(
    Option.fromUndefinedOr(s.painted),
    () => ({}),
  );
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
      {
        painted: Option.fromUndefinedOr(painted.right),
        cuff: Option.fromUndefinedOr(s.cuffRight),
      },
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
      {
        painted: Option.fromUndefinedOr(painted.left),
        cuff: Option.fromUndefinedOr(s.cuffLeft),
      },
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
    painted: limbs.flatMap((l) => Option.toArray(l.painted)),
    root: s.hip,
  };
};

/** A standing view's skeleton, view pixels: its body's arms (both, unless it names fewer) set which joints the view gives. */
export const standing = <A extends Arms = BothArms>(body: Body<A>, s: Standing<A>): Rooted =>
  standingOf(body, s);

/** A skeleton read in the kept view's pixels, moved into its part sheet's frame: every joint, tip, flap, cuff and the root by the kept corner (`keptAt`). */
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
    painted: Option.getOrElse(Option.fromUndefinedOr(s.painted), () => []).map((p) => ({
      ...p,
      limb: {
        ...p.limb,
        ...Option.match(Option.fromUndefinedOr(p.limb.cuff), {
          onNone: () => ({}),
          onSome: (cuff) => ({ cuff: at(cuff) }),
        }),
      },
    })),
    root: at(s.root),
  };
};
