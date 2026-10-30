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
  // his right arm raised with its elbow tucked: the upper arm hangs to the
  // sleeve's foot, the forearm rises to the hand at his cheek
  'single-1': {
    shoulderRight: [185, 440],
    elbowRight: [110, 550],
    shoulderLeft: [470, 470],
    elbowLeft: [485, 620],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
