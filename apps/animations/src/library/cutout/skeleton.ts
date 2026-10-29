// A cut view's skeleton (`core/puppet.ts`), read in the kept view's pixels and
// moved into its part sheet's frame (`frames.ts`). A standing figure's lean
// runs from the hip to the base of the neck, the neck and head above it, and
// each arm's shoulder, elbow and wrist on the joints the member's cut records,
// the wrist at the cuff and its tip at the circle hand's middle. Each sleeve
// takes its shoulder's flap of the member's body part (that part's own pixels
// beside its cap, in a band about its pivot and outside its inner edge),
// resting on the lean. Bone names are the shared control names; the member
// names his parts, which bones each lies on, the flaps' part and the band
// (`Body`).

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

/** What a member's standing views share: his parts as his part sheets name them, the bones each lies on, his arms' parts, the part each sleeve's flap is taken from, and the flap band. */
export interface Body {
  readonly skin: Skeleton['skin'];
  readonly arms: { readonly right: string; readonly left: string };
  readonly from: string;
  readonly band: FlapBand;
}

/** The places a standing view's skeleton is read from, view pixels, and the way the view faces. */
export interface Standing {
  readonly facing: Facing;
  readonly hip: Pt;
  readonly neck: Pt;
  readonly chin: Pt;
  readonly crown: Pt;
  readonly shoulderRight: Pt;
  readonly elbowRight: Pt;
  readonly wristRight: Pt;
  readonly handRight: Pt;
  readonly shoulderLeft: Pt;
  readonly elbowLeft: Pt;
  readonly wristLeft: Pt;
  readonly handLeft: Pt;
  /** Each flap's region's inner edge, x: the arm on the viewer's left takes the body left of it, the arm on the viewer's right the body right of it. */
  readonly flapRight: number;
  readonly flapLeft: number;
  /** The sleeves' cap radius (the member's cut). */
  readonly capRight: number;
  readonly capLeft: number;
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

/** A standing view's skeleton, view pixels: lean, neck and head, two arms of three bones each, each sleeve's flap of `body.from`, its band mirrored for a view from the back. */
export const standing = (body: Body, s: Standing): Rooted => ({
  bones: [
    { name: 'lean', pivot: s.hip, tip: s.neck },
    { name: 'neck', parent: 'lean', pivot: s.neck, tip: s.chin },
    { name: 'head', parent: 'neck', pivot: s.chin, tip: s.crown },
    { name: 'shoulderRight', parent: 'lean', pivot: s.shoulderRight, tip: s.elbowRight },
    { name: 'elbowRight', parent: 'shoulderRight', pivot: s.elbowRight, tip: s.wristRight },
    { name: 'wristRight', parent: 'elbowRight', pivot: s.wristRight, tip: s.handRight },
    { name: 'shoulderLeft', parent: 'lean', pivot: s.shoulderLeft, tip: s.elbowLeft },
    { name: 'elbowLeft', parent: 'shoulderLeft', pivot: s.elbowLeft, tip: s.wristLeft },
    { name: 'wristLeft', parent: 'elbowLeft', pivot: s.wristLeft, tip: s.handLeft },
  ],
  skin: body.skin,
  flaps: [
    {
      part: body.arms.right,
      from: body.from,
      bone: 'shoulderRight',
      body: 'lean',
      cap: s.capRight,
      region: flapRegion(body.band, s.shoulderRight, s.flapRight, s.facing === 'front'),
    },
    {
      part: body.arms.left,
      from: body.from,
      bone: 'shoulderLeft',
      body: 'lean',
      cap: s.capLeft,
      region: flapRegion(body.band, s.shoulderLeft, s.flapLeft, s.facing === 'back'),
    },
  ],
  root: s.hip,
});

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
