// Paul's cut views' frames on his kept heads sheet: each part sheet is cut
// from its view's kept box (`cast-sheet.json`) padded, so the outer ink of
// his head and shoulders, which runs a pixel or two past the kept box, is
// whole. His cut (`cut.ts`), part sheets (`sheets/<view>/`) and skeletons
// (`skeleton.ts`) are in this frame (`library/cutout/frames.ts`). Pure data.

import { framesOf } from '../../../cutout/frames.ts';

type Box = readonly [number, number, number, number];

/**
 * Each cut view's frame: the kept sheet it is on, its kept box, and the
 * pixels its part sheet pads it by (left, top, right, bottom). Each view is a
 * bust whose foot is the crop's open edge, so it takes none below.
 */
export const FRAMES = {
  'heads-1': { sheet: 'heads', kept: [29, 336, 282, 641], pad: [3, 3, 3, 0] },
  'heads-2': { sheet: 'heads', kept: [279, 347, 530, 644], pad: [3, 3, 3, 0] },
  'heads-3': { sheet: 'heads', kept: [532, 338, 765, 645], pad: [3, 3, 3, 0] },
  'heads-4': { sheet: 'heads', kept: [772, 337, 1006, 646], pad: [3, 3, 3, 0] },
  'heads-5': { sheet: 'heads', kept: [1014, 337, 1255, 646], pad: [3, 3, 3, 0] },
  'heads-6': { sheet: 'heads', kept: [1263, 333, 1508, 646], pad: [3, 3, 3, 0] },
} as const satisfies Readonly<
  Record<string, { readonly sheet: 'heads'; readonly kept: Box; readonly pad: Box }>
>;

/** A cut view, by its name in his sheet's views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
