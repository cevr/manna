/**
 * How long `All at once`'s tiles take to come and go, in milliseconds
 * (`AllAtOnce.tsx`): the zoom out grows them in over `in`, the zoom in
 * fades them out over `out`, and with Reduce Motion on they cross-fade
 * over `fade`. A pure module, so the Exact port holds its motion tokens
 * to these.
 */
export const tileTimes = { in: 180, out: 140, fade: 150 } as const;
