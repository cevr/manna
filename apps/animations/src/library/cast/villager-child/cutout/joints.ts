// The villager child's arm joints in each cut view, in view pixels: each
// shoulder where its sleeve leaves the body, each elbow at the sleeve's bend.
// Pure data.

type Pt = readonly [number, number];

export const JOINTS = {
  // his right arm hangs on the viewer's left; his left arm is raised to the viewer's right, writing
  'poses-5': {
    shoulderRight: [60, 160],
    elbowRight: [40, 205],
    shoulderLeft: [150, 190],
    elbowLeft: [198, 140],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
