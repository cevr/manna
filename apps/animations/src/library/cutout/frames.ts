import type { CutFrame } from './table.ts';

import type { Pt } from './rules.ts';
type Box = readonly [number, number, number, number];

/** A view's part sheet frame on its kept sheet: its kept box padded. */
export const paddedBox = ({ kept, pad }: CutFrame): Box => [
  kept[0] - pad[0],
  kept[1] - pad[1],
  kept[2] + pad[2],
  kept[3] + pad[3],
];

/** Where the kept box's top-left corner lies in a view's part sheet: the pad's left and top. */
export const keptCorner = ({ pad }: CutFrame): Pt => [pad[0], pad[1]];

/** A member's frames read by view name: each view's padded box (`boxOf`) and kept corner (`keptAt`). */
export const framesOf = <V extends string>(frames: Readonly<Record<V, CutFrame>>) => ({
  boxOf: (view: V): Box => paddedBox(frames[view]),
  keptAt: (view: V): Pt => keptCorner(frames[view]),
});
