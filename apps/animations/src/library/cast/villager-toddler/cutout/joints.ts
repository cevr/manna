type Pt = readonly [number, number];

export const JOINTS = {
  'poses-1': {
    shoulderLeft: [150, 125],
    elbowLeft: [180, 128],
  },
  'poses-2': {
    shoulderRight: [45, 140],
    elbowRight: [25, 158],
    shoulderLeft: [122, 140],
    elbowLeft: [140, 158],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
