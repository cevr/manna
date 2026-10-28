// The series lead's joints on his cut views, view pixels: what his cut
// records as each sleeve's pivot (`cut.ts`) and his skeleton turns each arm
// about (`skeleton.ts`). Pure data.

type Pt = readonly [number, number];

/** Each view's joints, view pixels: a shoulder at the sleeve's middle a little below the shoulder's curve, an elbow at the sleeve's middle on its axis. */
export const JOINTS = {
  front: {
    shoulderRight: [43, 250],
    elbowRight: [37, 335],
    shoulderLeft: [204, 250],
    elbowLeft: [210, 335],
  },
  threeQuarterLeft: {
    shoulderRight: [36, 250],
    elbowRight: [28, 335],
    shoulderLeft: [172, 250],
    elbowLeft: [178, 335],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
