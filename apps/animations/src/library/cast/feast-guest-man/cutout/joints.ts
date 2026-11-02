// The man's shoulder and elbow joints in his kept view's pixels: the cut's arm
// pivots and the skeleton's arm bones read the same points. His mantle covers
// each shoulder and his headcloth's drape hangs behind it, so a shoulder joint
// lies under the mantle, inside where the shoulder's outline meets the drape's
// hem; an elbow lies at the outer bend of his wide sleeve, by its crease. Data.

type Pt = readonly [number, number];

export const JOINTS = {
  // seated, his hands on his knees: his right arm on the viewer's left
  'poses-1': {
    shoulderRight: [100, 315],
    elbowRight: [48, 450],
    shoulderLeft: [311, 315],
    elbowLeft: [360, 450],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
