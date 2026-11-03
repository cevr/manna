// Jeremiah's papers, by view. His puppets un-matte each part's rim from its
// view's paper (`puppets.ts`, `core/unmatte.ts`), and his cut table's clean
// rule clears the paper-coloured rim his part sheets keep outside his ink
// (`cut.ts`, `CLEAN`). Data only: both read it, so neither imports the
// other's pixels.

import type { FramedView } from './frames.ts';

/** Each cut view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
export const PAPERS = {
  'heads-1': [252, 243, 226],
  'heads-2': [252, 243, 226],
  'heads-3': [252, 243, 226],
  'heads-4': [252, 243, 226],
  'heads-5': [252, 243, 226],
  'heads-6': [252, 243, 226],
} as const satisfies Readonly<Record<FramedView, readonly [number, number, number]>>;
