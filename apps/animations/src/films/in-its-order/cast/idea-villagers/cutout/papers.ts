// The IDEA villagers' papers, by view. Their puppets un-matte each part's rim
// from its view's paper (`puppets.ts`, `core/unmatte.ts`), and their cut
// table's clean rule clears the paper-coloured rim their part sheets keep
// outside their ink (`cut.ts`, `CLEAN`). Data only: both read it, so neither
// imports the other's pixels.

import type { FramedView } from './frames.ts';

/** Each view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
export const PAPERS = {
  'poses-3': [253, 237, 212],
  'poses-4': [253, 236, 213],
  'poses-6': [253, 237, 213],
  'single-15': [253, 239, 216],
} as const satisfies Readonly<Record<FramedView, readonly [number, number, number]>>;
