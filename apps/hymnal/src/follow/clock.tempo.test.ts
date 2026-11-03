/**
 * The follow clock at a tempo (unit `tempo`, acceptance A1): between the
 * player's reports the clock runs on at the rate it was set at, for every
 * tempo the Tempo dial offers (50 % to 150 % in 5 % steps), and a report
 * carries the rate on.
 *
 * Final path: `apps/hymnal/src/follow/clock.tempo.test.ts`.
 */

import { describe, expect, it } from 'bun:test';

import { clockAt, observe, placeOf, SLACK } from './clock';

/** Every detent of the Tempo dial, in percent. */
const TEMPI = Array.from({ length: 21 }, (_, i) => 50 + 5 * i);
/** Elapsed times, ms: none, under a poll, a poll, a second, a minute, ten minutes. */
const ELAPSED = [0, 1, 120, 250, 1000, 60_000, 600_000];

describe('the follow clock at a tempo', () => {
  it('runs on at rate × elapsed while playing, for every tempo and elapsed time', () => {
    for (const tempo of TEMPI)
      for (const elapsed of ELAPSED) {
        const rate = tempo / 100;
        const clock = clockAt(10_000, true, 5000, rate);
        expect(placeOf(clock, 5000 + elapsed)).toBeCloseTo(10_000 + rate * elapsed, 6);
      }
  });

  it('holds while not playing, at every tempo', () => {
    for (const tempo of TEMPI) {
      const clock = clockAt(10_000, false, 0, tempo / 100);
      expect(placeOf(clock, 60_000)).toBe(10_000);
    }
  });

  it('runs at 1000 ms a second when no rate is given (the one-tap path)', () => {
    expect(placeOf(clockAt(10_000, true, 0), 1000)).toBe(11_000);
  });

  it('takes a seek report at its rate, and runs on at that rate', () => {
    for (const tempo of TEMPI) {
      const rate = tempo / 100;
      const was = clockAt(0, true, 0, 1);
      const now = observe(was, { at: 30_000, playing: true, seek: true, rate }, 2000);
      expect(placeOf(now, 3000)).toBeCloseTo(30_000 + rate * 1000, 6);
    }
  });

  it('keeps running at the rate when the next poll lands where the rate puts it (no step back, no jump)', () => {
    for (const tempo of TEMPI) {
      const rate = tempo / 100;
      const clock = clockAt(10_000, true, 0, rate);
      const next = observe(
        clock,
        { at: 10_000 + rate * 250, playing: true, seek: false, rate },
        250,
      );
      expect(placeOf(next, 500)).toBeCloseTo(10_000 + rate * 500, 6);
      expect(Math.abs(placeOf(next, 250) - (10_000 + rate * 250))).toBeLessThan(SLACK);
    }
  });
});
