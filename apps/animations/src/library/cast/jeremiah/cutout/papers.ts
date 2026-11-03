import type { FramedView } from './frames.ts';

export const PAPERS = {
  'heads-1': [252, 243, 226],
  'heads-2': [252, 243, 226],
  'heads-3': [252, 243, 226],
  'heads-4': [252, 243, 226],
  'heads-5': [252, 243, 226],
  'heads-6': [252, 243, 226],
} as const satisfies Readonly<Record<FramedView, readonly [number, number, number]>>;
