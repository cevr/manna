// The woman's cut view's frame on her kept seated sheet: its part sheet is cut
// from the view's kept box (`cast-sheet.json`) padded 3, so the outer ink of
// her veil's crown and sides and of her stool and sandals, which meets the
// kept box's edges, is whole. Her cut (`cut.ts`), part sheets
// (`sheets/<view>/`) and skeleton (`skeleton.ts`) are in this frame
// (`library/cutout/frames.ts`). Pure data.

import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  // seated on her stool facing the viewer, her hands on her knees: her neutral seated view
  'poses-1': { sheet: 'poses', kept: [95, 89, 479, 785], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view of hers, by its name in her sheet's views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
