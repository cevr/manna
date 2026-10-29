// A cut view's skeleton (`core/puppet.ts`), read in the kept view's pixels and
// moved into its part sheet's frame (`frames.ts`). A standing figure's lean
// runs from the sash's knot to the base of the neck, the neck and head above
// it, and each arm's shoulder, elbow and wrist on the joints the member's cut
// records, the wrist at the cuff and its tip at the circle hand's middle. The
// torso and sash lean; the robe, sandals and ground shadow stand with the
// root; each sleeve takes its shoulder's flap of torso (the torso's own
// pixels beside its cap, above its pivot and outside its inner edge),
// resting on the lean. Bone names are the shared control names.

import type { Skeleton } from '@manna/film/core';
import { Option } from 'effect';

type Pt = readonly [number, number];

/** A skeleton with its root: where the puppet stands. */
export type Rooted = Skeleton & { readonly root: Pt };

/** The places a standing view's skeleton is read from, view pixels. */
export interface Standing {
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
  /** Each flap's region's inner edge, x: right takes the torso left of it, left right of it. */
  readonly flapRight: number;
  readonly flapLeft: number;
  /** The sleeves' cap radius (the member's cut). */
  readonly capRight: number;
  readonly capLeft: number;
}

/** A flap's region: a band about the shoulder from above the cap to just below the pivot, on its outer side. */
const flapRegion = (shoulder: Pt, edge: number, side: 'right' | 'left'): ReadonlyArray<Pt> => {
  const [top, bottom] = [shoulder[1] - 50, shoulder[1] + 12];
  const [x0, x1]: Pt = { right: [-1, edge] as const, left: [edge, shoulder[0] + 60] as const }[
    side
  ];
  return [
    [x0, top],
    [x1, top],
    [x1, bottom],
    [x0, bottom],
  ];
};

/** A standing view's skeleton, view pixels: lean, neck and head, two arms of three bones each, each sleeve's flap of torso. */
export const standing = (s: Standing): Rooted => ({
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
  skin: {
    head: ['neck', 'head'],
    torso: ['lean'],
    sash: ['lean'],
    armRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
    armLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
  },
  flaps: [
    {
      part: 'armRight',
      from: 'torso',
      bone: 'shoulderRight',
      body: 'lean',
      cap: s.capRight,
      region: flapRegion(s.shoulderRight, s.flapRight, 'right'),
    },
    {
      part: 'armLeft',
      from: 'torso',
      bone: 'shoulderLeft',
      body: 'lean',
      cap: s.capLeft,
      region: flapRegion(s.shoulderLeft, s.flapLeft, 'left'),
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
