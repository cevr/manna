type Pt = readonly [number, number];

export const JOINTS = {
  'poses-1': {
    shoulderRight: [92, 320],
    elbowRight: [44, 462],
    shoulderLeft: [289, 320],
    elbowLeft: [339, 462],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
