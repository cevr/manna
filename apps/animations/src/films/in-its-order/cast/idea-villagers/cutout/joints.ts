// The IDEA villagers' shoulder and elbow joints in each kept view's pixels: the
// cut's arm pivots and the skeleton's arm bones read the same points. The grown
// villager's headcloth hangs over each shoulder, so a shoulder joint lies under
// it, above where his sleeve comes out below its edge. Data.

type Pt = readonly [number, number];

export const JOINTS = {
  // hopping: his right arm hangs on the viewer's left, his left arm reaches out on the viewer's right
  'poses-3': {
    shoulderRight: [80, 185],
    elbowRight: [45, 220],
    shoulderLeft: [215, 190],
    elbowLeft: [265, 188],
  },
  // the baby sitting, both hands between the knees
  'poses-4': {
    shoulderRight: [45, 138],
    elbowRight: [55, 160],
    shoulderLeft: [127, 138],
    elbowLeft: [117, 160],
  },
  // standing facing the viewer, the arms hanging at his sides
  'poses-6': {
    shoulderRight: [35, 195],
    elbowRight: [20, 260],
    shoulderLeft: [172, 195],
    elbowLeft: [187, 260],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
