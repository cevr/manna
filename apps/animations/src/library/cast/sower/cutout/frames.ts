// The sower's cut views' frames on his kept sheets: each part sheet is cut
// from its view's kept box (`cast-sheet.json`) padded, so his sleeves' outer
// ink, which runs a pixel or two past the kept box, and the ground shadow,
// which runs on below his soles and fades past it, are whole. His cut
// (`cut.ts`), part sheets (`sheets/<view>/`) and skeletons (`skeleton.ts`) are
// in this frame (`library/cutout/frames.ts`). Pure data.

import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

/**
 * Each cut view's frame: the kept sheet it is on, its kept box, and the
 * pixels its part sheet pads it by (left, top, right, bottom). A standing
 * view takes 12 rows below, where the shadow fades, and 3 each other side;
 * the three-quarter view to the viewer's left takes 18, as its shadow runs 17
 * rows past his soles, the back view 21, as its shadow runs 20 rows past them,
 * each profile 21, as its shadow runs 18 rows past them, and the three-quarter
 * view to the viewer's right 23, as its shadow runs 21 rows past them. His
 * kept pose scattering seed (poses-1, on his kept poses sheet) takes 15, as its
 * shadow runs 15 rows past its kept box's bottom row, and his kept pose
 * standing from behind (poses-2, on the same sheet) 15, as its shadow runs 9
 * rows past it, and his kept pose reaching into the seed bag (poses-3, on the
 * same sheet) 15, as its shadow runs 14 rows past it, and his kept pose
 * standing from the front (poses-4, on the same sheet) 15, as its shadow runs
 * 14 rows past it.
 */
export const FRAMES = {
  front: { sheet: 'turnaround', kept: [28, 227, 283, 776], pad: [3, 3, 3, 12] },
  threeQuarterLeft: { sheet: 'turnaround', kept: [308, 227, 538, 776], pad: [3, 3, 3, 18] },
  back: { sheet: 'turnaround', kept: [775, 226, 1028, 776], pad: [3, 3, 3, 21] },
  profileLeft: { sheet: 'turnaround', kept: [568, 227, 743, 776], pad: [3, 3, 3, 21] },
  profileRight: { sheet: 'turnaround', kept: [1057, 226, 1221, 776], pad: [3, 3, 3, 21] },
  threeQuarterRight: { sheet: 'turnaround', kept: [1264, 227, 1492, 776], pad: [3, 3, 3, 23] },
  'poses-1': { sheet: 'poses', kept: [52, 249, 450, 834], pad: [3, 3, 3, 15] },
  'poses-2': { sheet: 'poses', kept: [488, 249, 784, 838], pad: [3, 3, 3, 15] },
  'poses-3': { sheet: 'poses', kept: [853, 250, 1125, 835], pad: [3, 3, 3, 15] },
  'poses-4': { sheet: 'poses', kept: [1178, 249, 1488, 835], pad: [3, 3, 3, 15] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view, by its name in his sheets' views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
