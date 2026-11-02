// The woman's shoulder and elbow joints in her kept view's pixels: the cut's arm
// pivots and the skeleton's arm bones read the same points. Her olive mantle
// covers each shoulder and arm, and her veil's drape hangs behind the shoulder,
// so a shoulder joint lies under the mantle, inside the shoulder's outline where
// its slope turns down her arm; an elbow lies at the outer bend of her arm,
// above where the mantle's lower end turns in to her cream cuff. Data.

type Pt = readonly [number, number];

export const JOINTS = {
  // seated, her hands on her knees: her right arm on the viewer's left
  'poses-1': {
    shoulderRight: [92, 320],
    elbowRight: [44, 462],
    shoulderLeft: [289, 320],
    elbowLeft: [339, 462],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
