type Pt = readonly [number, number];

export const JOINTS = {
  'poses-3': {
    shoulderRight: [80, 185],
    elbowRight: [45, 220],
    shoulderLeft: [215, 190],
    elbowLeft: [265, 188],
  },
  'poses-4': {
    shoulderRight: [45, 138],
    elbowRight: [55, 160],
    shoulderLeft: [127, 138],
    elbowLeft: [117, 160],
  },
  'poses-6': {
    shoulderRight: [35, 195],
    elbowRight: [20, 260],
    shoulderLeft: [172, 195],
    elbowLeft: [187, 260],
  },
  'single-15': {
    shoulderRight: [70, 430],
    elbowRight: [40, 560],
    shoulderLeft: [370, 430],
    elbowLeft: [397, 580],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
