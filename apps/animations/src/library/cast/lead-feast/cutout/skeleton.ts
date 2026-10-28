// The series lead's skeletons, one a cut view (`core/puppet.ts`), read in
// view pixels and moved into its part sheet's frame (`frames.ts`): his lean
// from his sash's knot to the base of his neck, his neck
// and head above it, and each arm's shoulder, elbow and wrist on the joints
// his cut records (`joints.ts`), the wrist at the cuff and its tip at his
// circle hand's middle. His torso and sash lean; his robe, sandals and
// ground shadow stand with the root; each sleeve takes its shoulder's flap
// of torso (the torso's own pixels beside its cap, above its pivot and
// outside its inner edge), resting on his lean. His bust (heads-4) is a lean
// and a head. Bone names are the shared control names (`PUPPET_CONTROLS`).
// Pure data.

import type { Skeleton } from '@manna/film/core';
import { Option } from 'effect';
import { type FramedView, keptAt } from './frames.ts';
import { JOINTS } from './joints.ts';

type Pt = readonly [number, number];

/** The places a standing view's skeleton is read from, view pixels. */
interface Standing {
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
  /** The sleeves' cap radius (`cut.ts`). */
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

const standing = (s: Standing): Skeleton & { readonly root: Pt } => ({
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

/** A skeleton read in the kept view's pixels, moved into its part sheet's frame (`frames.ts`): every joint, tip, flap and the root by the pad's left and top. */
const framed = (
  view: FramedView,
  s: Skeleton & { readonly root: Pt },
): Skeleton & { readonly root: Pt } => {
  const [dx, dy] = keptAt(view);
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

/** Each cut view's skeleton in its part sheet's frame, by the view's name in his sheets' views. */
export const SKELETONS = {
  front: framed(
    'front',
    standing({
      hip: [123, 360],
      neck: [123, 205],
      chin: [122, 185],
      crown: [120, 20],
      ...JOINTS.front,
      wristRight: [31, 405],
      handRight: [29.5, 429],
      wristLeft: [215, 405],
      handLeft: [216.5, 428.5],
      flapRight: 51,
      flapLeft: 199,
      capRight: 13,
      capLeft: 13,
    }),
  ),
  threeQuarterLeft: framed(
    'threeQuarterLeft',
    standing({
      hip: [110, 360],
      neck: [107, 215],
      chin: [106, 195],
      crown: [100, 20],
      ...JOINTS.threeQuarterLeft,
      wristRight: [22, 405],
      handRight: [20, 430],
      wristLeft: [183, 405],
      handLeft: [184, 430],
      flapRight: 45,
      flapLeft: 152,
      capRight: 11,
      capLeft: 13,
    }),
  ),
  'heads-4': framed('heads-4', {
    bones: [
      { name: 'lean', pivot: [120, 336], tip: [120, 232] },
      { name: 'head', parent: 'lean', pivot: [120, 232], tip: [120, 30] },
    ],
    skin: { head: ['head'], torso: ['lean'] },
    root: [120, 336],
  }),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
