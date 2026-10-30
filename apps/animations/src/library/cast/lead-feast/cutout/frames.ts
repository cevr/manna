// The series lead's cut views' frames on his kept sheets: each part sheet is
// cut from its view's kept box (`cast-sheet.json`) padded, so his crown's and
// cuffs' outer ink, which runs a pixel or two past the kept box, and the
// ground shadow, which runs on below his soles and fades past it, are whole.
// His cut (`cut.ts`), part sheets (`sheets/<view>/`), skeletons
// (`skeleton.ts`) and puppets (`puppets.ts`) are in this frame
// (`library/cutout/frames.ts`). Pure data.

import { framesOf } from '../../../cutout/frames.ts';

type Box = readonly [number, number, number, number];

/**
 * Each cut view's frame: the kept sheet it is on, its kept box, and the
 * pixels its part sheet pads it by (left, top, right, bottom). A standing
 * view takes 12 rows below, where the shadow fades, and 3 each other side;
 * his bust's foot is the crop's open edge, so it takes none below.
 */
export const FRAMES = {
  front: { sheet: 'turnaround', kept: [18, 194, 265, 857], pad: [3, 3, 3, 12] },
  threeQuarterLeft: { sheet: 'turnaround', kept: [292, 194, 511, 857], pad: [3, 3, 3, 12] },
  'heads-4': { sheet: 'heads', kept: [774, 314, 1014, 650], pad: [3, 3, 3, 0] },
  // his raised-bottle drawing, kept as its own file on the single sheet (`kept/single-1.png`)
  'single-1': { sheet: 'single', kept: [191, 109, 742, 1382], pad: [3, 3, 3, 12] },
} as const satisfies Readonly<
  Record<
    string,
    { readonly sheet: 'turnaround' | 'heads' | 'single'; readonly kept: Box; readonly pad: Box }
  >
>;

/** A cut view, by its name in his sheets' views. */
export type FramedView = keyof typeof FRAMES;

/** A view's part sheet frame on its kept sheet (its kept box padded, `boxOf`), and where the kept box's top-left corner lies in it (`keptAt`). */
export const { boxOf, keptAt } = framesOf(FRAMES);
