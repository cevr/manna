// The villager toddler's cut views' frames on their kept poses sheet (shared
// with the villager child): each part sheet is cut from its view's kept box
// (`cast-sheet.json`) padded, so the hand's outer ink and the ground shadow,
// which runs on below the soles and fades past the box, are whole. Their cut
// (`cut.ts`), part sheets (`sheets/<view>/`) and skeletons (`skeleton.ts`) are
// in this frame (`library/cutout/frames.ts`). Pure data.

import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

/**
 * Each cut view's sheet and kept box (measured), and its pad `[left, top,
 * right, bottom]`: 3 px on three sides, and below the kept box the ground
 * shadow's rows (y286-308 of the view, 23 rows).
 */
export const FRAMES = {
  'poses-1': { sheet: 'poses', kept: [35, 461, 277, 747], pad: [3, 3, 3, 23] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view, by its name in their sheets' views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
