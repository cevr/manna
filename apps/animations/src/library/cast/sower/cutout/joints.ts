// The sower's joints on his cut views, view pixels: what his cut records as
// each sleeve's pivot (`cut.ts`) and his skeleton turns each arm about
// (`skeleton.ts`). Pure data.

type Pt = readonly [number, number];

/** Each view's joints, view pixels: a shoulder at the sleeve's middle a little below the shoulder's curve, an elbow at the sleeve's middle on its axis. */
export const JOINTS = {
  front: {
    shoulderRight: [42, 220],
    elbowRight: [34, 282],
    shoulderLeft: [206, 220],
    elbowLeft: [218, 282],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
