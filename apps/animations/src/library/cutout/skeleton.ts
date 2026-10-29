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

import type { Skeleton } from '@manna/film/core';
import { Match, Option } from 'effect';
import type { Pt } from './rules.ts';

/** A skeleton with its root: where the puppet stands. */
export type Rooted = Skeleton & { readonly root: Pt };

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

/** His right arm's joints, its flap's inner edge (x: the arm on the viewer's left takes the body left of it, on the viewer's right the body right of it) and its cap radius (the member's cut). */
interface RightArm {
  readonly shoulderRight: Pt;
  readonly elbowRight: Pt;
  readonly wristRight: Pt;
  readonly handRight: Pt;
  readonly flapRight: number;
  readonly capRight: number;
}

/** His left arm's joints, flap's inner edge and cap radius, as `RightArm`. */
interface LeftArm {
  readonly shoulderLeft: Pt;
  readonly elbowLeft: Pt;
  readonly wristLeft: Pt;
  readonly handLeft: Pt;
  readonly flapLeft: number;
  readonly capLeft: number;
}

/** The places a standing view's skeleton is read from, view pixels: the trunk, and the joints of each arm its body names. */
export type Standing<A extends Arms = BothArms> = Trunk &
  (A extends { readonly right: string } ? RightArm : Record<never, never>) &
  (A extends { readonly left: string } ? LeftArm : Record<never, never>);

/** A standing view as read, each arm's joints there or not. */
type Read = Trunk & Partial<RightArm> & Partial<LeftArm>;

/** One arm's joints, its flap's inner edge and its cap. */
interface Arm {
  readonly shoulder: Pt;
  readonly elbow: Pt;
  readonly wrist: Pt;
  readonly hand: Pt;
  readonly flap: number;
  readonly cap: number;
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

/** An arm's three bones on the lean and its sleeve's flap of `body.from`, when its body names its part and its view gives its joints. */
const limb = (
  side: 'Right' | 'Left',
  body: Body<Arms>,
  part: Option.Option<string>,
  joints: Option.Option<Arm>,
  onViewersLeft: boolean,
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
    })),
  );

/** A standing view's skeleton, view pixels: lean, neck and head, each drawn arm's three bones and its sleeve's flap of `body.from`, the band mirrored for a view from the back. */
const standingOf = (body: Body<Arms>, s: Read): Rooted => {
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
    root: s.hip,
  };
};

/** A standing view's skeleton, view pixels: its body's arms (both, unless it names fewer) set which joints the view gives. */
export const standing = <A extends Arms = BothArms>(body: Body<A>, s: Standing<A>): Rooted =>
  standingOf(body, s);

/** A skeleton read in the kept view's pixels, moved into its part sheet's frame: every joint, tip, flap and the root by the kept corner (`keptAt`). */
export const framed = ([dx, dy]: Pt, s: Rooted): Rooted => {
  const at = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  return {
    bones: s.bones.map((b) => ({ ...b, pivot: at(b.pivot), tip: at(b.tip) })),
    skin: s.skin,
    flaps: Option.getOrElse(Option.fromUndefinedOr(s.flaps), () => []).map((f) => ({
      ...f,
      region: f.region.map(at),
    })),
    root: at(s.root),
  };
};
