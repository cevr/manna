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
  // in profile to the viewer's left only her left arm shows; her veil hangs behind it, off the shoulder
  profileLeft: {
    shoulderLeft: [90, 215],
    elbowLeft: [86, 290],
  },
  // in profile to the viewer's right only her right arm shows
  profileRight: {
    shoulderRight: [112, 215],
    elbowRight: [115, 290],
  },
  // turned to the viewer's right: her near right arm on the viewer's left, her far left arm on the viewer's right
  threeQuarterRight: {
    shoulderRight: [62, 238],
    elbowRight: [62, 300],
    shoulderLeft: [186, 238],
    elbowLeft: [192, 300],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
