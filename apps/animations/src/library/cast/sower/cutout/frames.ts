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
 * the three-quarter view takes 18, as its shadow runs 17 rows past his soles.
 */
export const FRAMES = {
  front: { sheet: 'turnaround', kept: [28, 227, 283, 776], pad: [3, 3, 3, 12] },
  threeQuarterLeft: { sheet: 'turnaround', kept: [308, 227, 538, 776], pad: [3, 3, 3, 18] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view, by its name in his sheets' views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
