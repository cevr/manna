/* oxlint-disable effect/noTernary -- the reference writes the hsintro spec's table out as plain branches, apart from the reducer's data. */

/**
 * The tour (`./tour`) against the hsintro spec's table (O2), written out
 * here apart from the reducer: every pair of state and tap, then 3,000
 * generated tap sequences of 40, each step equal to the table, the replay
 * never moving back from how a verse grows to the welcome, and floors on
 * every move the table names.
 */

import { describe, expect, it } from 'bun:test';

import { tourStep, type Tour, type TourTap } from './tour';

const TOURS: readonly Tour[] = ['off', 'welcome', 'grows', 'tips'];
const TAPS: readonly TourTap[] = ['Continue', 'How', 'Begin', 'Skip', 'See', 'GotIt', 'Leave'];

/** The spec's table: where `tap` leads from `tour`, a pair it does not name staying put. */
const reference = (tour: Tour, tap: TourTap): Tour => {
  if (tap === 'Leave') return 'off';
  if (tap === 'Continue') return tour === 'off' ? 'tips' : tour;
  if (tap === 'How') return tour === 'off' || tour === 'tips' ? 'welcome' : tour;
  if (tap === 'Begin') return tour === 'welcome' ? 'grows' : tour;
  if (tap === 'Skip') return tour === 'welcome' ? 'off' : tour;
  if (tap === 'See') return tour === 'grows' ? 'tips' : tour;
  return tour === 'tips' ? 'off' : tour;
};

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('the tour', () => {
  it('moves by the table for every state and tap: Continue to the tips, How to the welcome, Begin, Skip, See, Got it, and Leave from anywhere to off', () => {
    const table = TOURS.flatMap((tour) =>
      TAPS.map((tap) => `${tour} ${tap} → ${tourStep(tour, tap)}`),
    );
    expect(table).toEqual(
      TOURS.flatMap((tour) => TAPS.map((tap) => `${tour} ${tap} → ${reference(tour, tap)}`)),
    );
    expect(TOURS.filter((tour) => tourStep(tour, 'Continue') === 'tips')).toEqual(['off', 'tips']);
    expect(TOURS.filter((tour) => tourStep(tour, 'GotIt') === 'tips')).toEqual([]);
  });

  it('agrees with the table over 3,000 generated sequences of 40 taps, never moving the replay back, with floors on every move', () => {
    const moves = new Map<string, number>();
    const wrong: string[] = [];
    for (let seed = 1; seed <= 3000; seed++) {
      const next = random(seed);
      let tour: Tour = 'off';
      for (let step = 0; step < 40; step++) {
        const tap = TAPS[Math.floor(next() * TAPS.length)] ?? 'Leave';
        const after = tourStep(tour, tap);
        if (after !== reference(tour, tap))
          wrong.push(`seed ${seed} step ${step}: ${tour} ${tap} → ${after}`);
        if (tour === 'grows' && after === 'welcome')
          wrong.push(`seed ${seed} step ${step}: the replay moved back`);
        if (after !== tour) moves.set(`${tour}>${after}`, (moves.get(`${tour}>${after}`) ?? 0) + 1);
        tour = after;
      }
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const move of [
      'off>tips',
      'off>welcome',
      'tips>welcome',
      'welcome>grows',
      'welcome>off',
      'grows>tips',
      'tips>off',
      'grows>off',
    ])
      expect(moves.get(move) ?? 0, move).toBeGreaterThan(200);
  });
});
