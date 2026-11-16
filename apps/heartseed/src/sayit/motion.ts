/**
 * How Say it's drawings move, in milliseconds and scale: a word lights
 * over `light`; the ring behind the big button pulses over `pulse`, growing
 * by `pulseGrowth` of its size as it fades. `draw.tsx` draws with these, and
 * the Exact port's motion tokens are held to them.
 */
export const SAYIT_MOTION = {
  light: 180,
  pulse: 1200,
  pulseGrowth: 0.4,
} as const;
