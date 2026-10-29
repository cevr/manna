// The feast mother's shoulder and elbow joints in each kept view's pixels: the
// cut's arm pivots and the skeleton's arm bones read the same points. Her veil
// covers each shoulder, so a shoulder joint lies under the veil, above where
// her sleeve comes out below its hem. Data.

type Pt = readonly [number, number];

export const JOINTS = {
  front: {
    shoulderRight: [42, 225],
    elbowRight: [32, 300],
    shoulderLeft: [176, 225],
    elbowLeft: [186, 300],
  },
  // turned to the viewer's left: her right arm still on the viewer's left
  threeQuarterLeft: {
    shoulderRight: [36, 228],
    elbowRight: [22, 300],
    shoulderLeft: [160, 232],
    elbowLeft: [158, 300],
  },
  // from behind: her right arm on the viewer's right
  back: {
    shoulderRight: [180, 235],
    elbowRight: [190, 300],
    shoulderLeft: [36, 235],
    elbowLeft: [26, 300],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
