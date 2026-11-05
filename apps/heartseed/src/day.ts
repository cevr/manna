/* oxlint-disable effect/noGlobals -- the zone is the platform's own, read through the runtime's `Date` at each press (Hermes over the system zone on iOS); Effect's Clock gives the instant, not the zone. */

import { Option } from 'effect';

/**
 * The device zone's offset at the instant `at`, in whole minutes east of
 * UTC (ISO's sign: New York `-300` in winter and `-240` in summer, Kolkata
 * `330`). A recall's record holds it for its start, taken once at the press
 * and kept through every rewrite of that recital, so the local wall clock at
 * `startedAt` is a fact of the record alone, never of the zone the device
 * is in later. It reads the runtime's zone at each call, never a cached one.
 */
export const offsetAt = (at: number) => 0 - Math.round(new Date(at).getTimezoneOffset());

const MINUTE_MS = 60_000;

const DAY_MS = 86_400_000;

/** When the reader's day starts on the local clock: 04:00 (Anki's rollover), so a recital after midnight counts for the evening before it. */
const DAY_STARTS_MS = 4 * 3_600_000;

/** A recital's start, and the zone's offset at it when its record holds one. */
interface Started {
  readonly startedAt: number;
  readonly offset?: number;
}

/**
 * The day a recital counts for, numbered from the epoch: the local date of
 * the 04:00-to-04:00 day it started in, by its own stored offset alone
 * (03:59:59.999 is the day before, 04:00 the day itself), so daylight
 * saving, a part-hour zone and the zone the device is in now change
 * nothing. A record kept before offsets were stored keeps its UTC date,
 * the day it was counted on then.
 */
export const dayOf = (recital: Started) =>
  Option.match(Option.fromNullishOr(recital.offset), {
    onNone: () => Math.floor(recital.startedAt / DAY_MS),
    onSome: (offset) =>
      Math.floor((recital.startedAt + offset * MINUTE_MS - DAY_STARTS_MS) / DAY_MS),
  });
