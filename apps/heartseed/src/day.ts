/* oxlint-disable effect/noGlobals -- the zone is the platform's own, read through the runtime's `Date` at each press (Hermes over the system zone on iOS); Effect's Clock gives the instant, not the zone. */

/**
 * The device zone's offset at the instant `at`, in whole minutes east of
 * UTC (ISO's sign: New York `-300` in winter and `-240` in summer, Kolkata
 * `330`). A recall's record holds it for its start, taken once at the press
 * and kept through every rewrite of that recital, so the local wall clock at
 * `startedAt` is a fact of the record alone, never of the zone the device
 * is in later. It reads the runtime's zone at each call, never a cached one.
 */
export const offsetAt = (at: number) => 0 - Math.round(new Date(at).getTimezoneOffset());
