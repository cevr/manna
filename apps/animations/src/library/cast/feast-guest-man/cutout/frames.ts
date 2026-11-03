import { framesOf } from '../../../cutout/frames.ts';
import type { CutFrame } from '../../../cutout/table.ts';

export const FRAMES = {
  'poses-1': { sheet: 'poses', kept: [72, 108, 479, 844], pad: [3, 3, 3, 3] },
} as const satisfies Readonly<Record<string, CutFrame>>;

/** A cut view of his, by its name in his sheet's views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
