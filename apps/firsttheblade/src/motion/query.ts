export const LESS_MOTION = '(prefers-reduced-motion: reduce)';

export const COARSE_POINTER = '(pointer: coarse)';

export const raysTurn = (matches: (query: string) => boolean) =>
  !matches(LESS_MOTION) && !matches(COARSE_POINTER);
