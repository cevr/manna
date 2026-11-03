import type { CutFrame } from './table.ts';

import type { Pt } from './rules.ts';
type Box = readonly [number, number, number, number];

export const paddedBox = ({ kept, pad }: CutFrame): Box => [
  kept[0] - pad[0],
  kept[1] - pad[1],
  kept[2] + pad[2],
  kept[3] + pad[3],
];

export const keptCorner = ({ pad }: CutFrame): Pt => [pad[0], pad[1]];

export const framesOf = <V extends string>(frames: Readonly<Record<V, CutFrame>>) => ({
  boxOf: (view: V): Box => paddedBox(frames[view]),
  keptAt: (view: V): Pt => keptCorner(frames[view]),
});
