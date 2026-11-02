// The man's cut view's frame on his kept seated sheet: its part sheet is cut
// from the view's kept box (`cast-sheet.json`) padded 3, so the outer ink of
// his headcloth's crown and of his stool and sandals, which meets the kept
// box's edges, is whole. His cut (`cut.ts`), part sheets (`sheets/<view>/`)
// and skeleton (`skeleton.ts`) are in this frame (`library/cutout/frames.ts`).
// Pure data.

import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  // seated on his stool facing the viewer, his hands on his knees: his neutral seated view
  'poses-1': { sheet: 'poses', kept: [72, 108, 479, 844], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view of his, by its name in his sheet's views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
