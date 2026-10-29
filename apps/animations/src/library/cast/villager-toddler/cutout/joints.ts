// The villager toddler's arm joints in each cut view, in the kept view's
// pixels: the shoulder at the sleeve's root (a crease with no ink, x148-164,
// under their ear) and the elbow along the sleeve, read off the view
// (inferred from its ink). Their cut (`cut.ts`) and skeleton (`skeleton.ts`)
// read them. Pure data.

/** A point of a kept view, pixels. */
type Pt = readonly [number, number];

/** Each view's arm joints. In poses-1 only their left arm, the near one, is drawn. */
export const JOINTS = {
  'poses-1': {
    shoulderLeft: [150, 125],
    elbowLeft: [180, 128],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
