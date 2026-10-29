// The sower's joints on his cut views, view pixels: what his cut records as
// each sleeve's pivot (`cut.ts`) and his skeleton turns each arm about
// (`skeleton.ts`). Pure data.

type Pt = readonly [number, number];

/** Each view's joints, view pixels: a shoulder at the sleeve's middle a little below the shoulder's curve, an elbow at the sleeve's middle on its axis. */
export const JOINTS = {
  front: {
    shoulderRight: [42, 220],
    elbowRight: [34, 282],
    shoulderLeft: [206, 220],
    elbowLeft: [218, 282],
  },
  threeQuarterLeft: {
    shoulderRight: [42, 212],
    elbowRight: [30, 280],
    shoulderLeft: [182, 212],
    elbowLeft: [191, 280],
  },
  back: {
    shoulderRight: [210, 220],
    elbowRight: [219, 282],
    shoulderLeft: [44, 220],
    elbowLeft: [36, 282],
  },
  // his left arm only: a profile to the viewer's left shows no right arm
  profileLeft: {
    shoulderLeft: [110, 190],
    elbowLeft: [101, 282],
  },
  // his right arm only: a profile to the viewer's right shows no left arm
  profileRight: {
    shoulderRight: [64, 197],
    elbowRight: [60, 282],
  },
  threeQuarterRight: {
    shoulderRight: [48, 215],
    elbowRight: [38, 282],
    shoulderLeft: [190, 212],
    elbowLeft: [200, 282],
  },
  // scattering seed: his right arm (far, the viewer's left) flung out level, his left (near) hanging to the seed bag
  'poses-1': {
    shoulderRight: [175, 212],
    elbowRight: [110, 223],
    shoulderLeft: [322, 205],
    elbowLeft: [343, 270],
  },
  // standing from behind: his left arm on the viewer's left, its hand over the seed bag, his right on the viewer's right
  'poses-2': {
    shoulderRight: [228, 205],
    elbowRight: [250, 280],
    shoulderLeft: [70, 205],
    elbowLeft: [45, 280],
  },
  // reaching into the seed bag: his right arm (far, the viewer's left) bent across his body, its hand in the bag's mouth, his left (near) hanging
  'poses-3': {
    shoulderRight: [55, 200],
    elbowRight: [32, 295],
    shoulderLeft: [228, 205],
    elbowLeft: [238, 275],
  },
  // standing from the front: his right arm on the viewer's left, his left on the viewer's right, its hand over the seed bag
  'poses-4': {
    shoulderRight: [78, 210],
    elbowRight: [45, 280],
    shoulderLeft: [232, 205],
    elbowLeft: [262, 280],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
