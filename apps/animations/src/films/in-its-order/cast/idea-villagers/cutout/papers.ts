import type { FramedView } from './frames.ts';

/** Each view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
export const PAPERS = {
  'poses-3': [253, 237, 212],
  'poses-4': [253, 236, 213],
  'poses-6': [253, 237, 213],
  'single-15': [253, 239, 216],
} as const satisfies Readonly<Record<FramedView, readonly [number, number, number]>>;
