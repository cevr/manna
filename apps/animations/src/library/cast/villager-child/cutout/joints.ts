type Pt = readonly [number, number];

export const JOINTS = {
  'poses-5': {
    shoulderRight: [60, 160],
    elbowRight: [40, 205],
    shoulderLeft: [150, 190],
    elbowLeft: [198, 140],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
