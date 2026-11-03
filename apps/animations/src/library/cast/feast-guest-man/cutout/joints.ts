type Pt = readonly [number, number];

export const JOINTS = {
  'poses-1': {
    shoulderRight: [100, 315],
    elbowRight: [48, 450],
    shoulderLeft: [311, 315],
    elbowLeft: [360, 450],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
