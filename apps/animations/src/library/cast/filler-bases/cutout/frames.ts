// The filler bases' cut views' frames on their kept poses sheet: each view is
// cut as a bust for a crowd, so its part sheet is its kept box (`cast-sheet.json`)
// from the crown down to the waist, padded 3 at the top and sides so the outer
// ink of the head and shoulders, which meets the kept box's edges, is whole.
// The waist row is the crop's open edge, the bust's foot, so it takes no pad
// below. Their cut (`cut.ts`), part sheets (`sheets/<view>/`) and skeletons
// (`skeleton.ts`) are in this frame (`library/cutout/frames.ts`). Pure data.

import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  // the grown man, facing the viewer, his arms at his sides
  'poses-1': { sheet: 'poses', kept: [76, 141, 378, 560], pad: [3, 3, 3, 0] },
  // the grown woman, her hair tied at her left
  'poses-2': { sheet: 'poses', kept: [450, 159, 728, 560], pad: [3, 3, 3, 0] },
  // the older man
  'poses-3': { sheet: 'poses', kept: [791, 146, 1090, 560], pad: [3, 3, 3, 0] },
  // the older woman, her hair in a bun at her right
  'poses-4': { sheet: 'poses', kept: [1164, 159, 1447, 560], pad: [3, 3, 3, 0] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view of theirs, by its name in their sheet's views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
