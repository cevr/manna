import type { FramedView } from './frames.ts';

export const PAPERS = {
  'poses-3': [253, 237, 212],
  'poses-4': [253, 236, 213],
  'poses-6': [253, 237, 213],
  'single-15': [253, 239, 216],
} as const satisfies Readonly<Record<FramedView, readonly [number, number, number]>>;
