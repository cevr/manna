/**
 * The tour on the port beside the current Heartseed's `tourStep`: every
 * state the tour reaches, every tap it hears from there (Continue, How,
 * Begin, Skip, See, Got it, Leave), and generated sequences of them, each
 * step the same state on both. Continue is Planted's alone: on the port it
 * moves the tour only from Planted, once, and leaves the flow; anywhere
 * else it changes nothing, as the current root shows no Continue there.
 */

import { describe, expect, it } from 'bun:test';
import { tourStep, type Tour, type TourTap } from '@manna/heartseed/first/tour';

import { seeded } from '../test/random';
import { afterTap, afterTour, firstBegun, shownOf, type FirstLaunch } from './flow';

const TOURS: readonly Tour[] = ['off', 'welcome', 'grows', 'tips'];
const TAPS: readonly TourTap[] = ['Continue', 'How', 'Begin', 'Skip', 'See', 'GotIt', 'Leave'];
const SEQUENCES = 300;
const LENGTH = 16;

/** A launch at Planted, its Continue not yet tapped. */
const atPlanted = (): FirstLaunch => ({
  ...firstBegun(),
  flow: { phase: 'planted', since: 1 },
});

/** A launch left at home after Continue, in tour state `tour`. */
const atHome = (tour: Tour): FirstLaunch => ({ ...atPlanted(), continued: true, tour });

describe('the tour on the port, beside the current tourStep', () => {
  for (const tour of TOURS)
    for (const tap of TAPS.filter((each) => each !== 'Continue'))
      it(`${tap} from ${tour}`, () => {
        expect(shownOf(afterTour(atHome(tour), tap)).tour).toBe(tourStep(tour, tap));
      });

  it("Planted's Continue shows the tips and leaves the flow; a second does nothing", () => {
    const once = afterTour(atPlanted(), 'Continue');
    expect([once.tour, once.continued]).toEqual([tourStep('off', 'Continue'), true]);
    const again = afterTour(afterTour(once, 'GotIt'), 'Continue');
    expect([again.tour, again.continued]).toEqual(['off', true]);
  });

  it('Continue before Planted changes nothing', () => {
    const begun = firstBegun();
    expect(afterTour(begun, 'Continue')).toBe(begun);
    const hearing = afterTap(begun, 'Skip');
    expect(afterTour(hearing, 'Continue')).toBe(hearing);
  });

  it(`walks ${SEQUENCES} generated sequences of taps at home as tourStep does`, () => {
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const random = seeded(seed);
      let port = atHome('off');
      let one: Tour = 'off';
      for (let at = 0; at < LENGTH; at++) {
        const tap = random.pick(TAPS.filter((each) => each !== 'Continue'));
        port = afterTour(port, tap);
        one = tourStep(one, tap);
        expect({ seed, at, tour: port.tour }).toEqual({ seed, at, tour: one });
      }
    }
  });
});
