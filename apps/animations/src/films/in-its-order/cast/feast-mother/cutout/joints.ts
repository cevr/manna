type Pt = readonly [number, number];

export const JOINTS = {
  front: {
    shoulderRight: [42, 225],
    elbowRight: [32, 300],
    shoulderLeft: [176, 225],
    elbowLeft: [186, 300],
  },
  threeQuarterLeft: {
    shoulderRight: [36, 228],
    elbowRight: [22, 300],
    shoulderLeft: [160, 232],
    elbowLeft: [158, 300],
  },
  back: {
    shoulderRight: [180, 235],
    elbowRight: [190, 300],
    shoulderLeft: [36, 235],
    elbowLeft: [26, 300],
  },
  profileLeft: {
    shoulderLeft: [90, 215],
    elbowLeft: [86, 290],
  },
  profileRight: {
    shoulderRight: [112, 215],
    elbowRight: [115, 290],
  },
  threeQuarterRight: {
    shoulderRight: [62, 238],
    elbowRight: [62, 300],
    shoulderLeft: [186, 238],
    elbowLeft: [192, 300],
  },
  'poses-1': {
    shoulderRight: [70, 262],
    elbowRight: [15, 380],
    shoulderLeft: [295, 265],
    elbowLeft: [300, 390],
  },
  'poses-2': {
    shoulderRight: [88, 275],
    elbowRight: [42, 420],
    shoulderLeft: [322, 320],
    elbowLeft: [342, 425],
  },
  'poses-3': {
    shoulderRight: [80, 280],
    elbowRight: [40, 420],
    shoulderLeft: [305, 310],
    elbowLeft: [322, 420],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
