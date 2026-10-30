// The villager toddler's arm joints in each cut view, in the kept view's
// pixels: the shoulder at the sleeve's root (a crease with no ink, x148-164,
// under their ear) and the elbow along the sleeve, read off the view
// (inferred from its ink). Their cut (`cut.ts`) and skeleton (`skeleton.ts`)
// read them. Pure data.

/** A point of a kept view, pixels. */
type Pt = readonly [number, number];

/**
 * Each view's arm joints. In poses-1 only their left arm, the near one, is
 * drawn. In poses-2 (sitting, facing the viewer) both sleeves hang from under
 * the jaw with no inner ink, so each elbow is a guess along the sleeve's outer
 * ink.
 */
export const JOINTS = {
  'poses-1': {
    shoulderLeft: [150, 125],
    elbowLeft: [180, 128],
  },
  'poses-2': {
    shoulderRight: [45, 140],
    elbowRight: [25, 158],
    shoulderLeft: [122, 140],
    elbowLeft: [140, 158],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;
