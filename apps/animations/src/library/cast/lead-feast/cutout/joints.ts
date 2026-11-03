type Pt = readonly [number, number];

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
  'single-1': {
    shoulderRight: [185, 440],
    elbowRight: [110, 550],
    shoulderLeft: [470, 470],
    elbowLeft: [485, 620],
  },
  'single-9': {
    shoulderRight: [180, 455],
    elbowRight: [55, 545],
    shoulderLeft: [468, 458],
    elbowLeft: [505, 630],
    cuffLeft: [472, 674],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
