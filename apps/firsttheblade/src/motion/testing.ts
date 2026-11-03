import { TURN } from './sun.ts';

export const turnAt = (seconds: number) =>
  TURN.swing * Math.sin((seconds * 2 * Math.PI) / TURN.period);
