/**
 * One part of home's equality (spec A1 to A3), run by `src/home/equal-*.test.ts`
 * over its own seeds: each case's answer equals the current app's, every
 * invariant holds, and each kind of case comes up at least `FLOOR` times.
 */

import { expect } from 'bun:test';

import { invariantsOf, runSeeds } from './home-check';
import { homeCaseOf } from './home-model';
import { seeded } from './random';

const HOLDS = {
  singlesSectionExactlyWhenSingles: true,
  oneStageAndMarkPerVerse: true,
  noIconOrGlyph: true,
  singleInNoRow: true,
  plantIdsUnique: true,
};

/** How often each kind of case comes up at least, in a part. */
const FLOOR = 3;

/** Checks the seeds `first` to `last`. */
export const checkSeeds = (first: number, last: number) => {
  const reach = runSeeds(
    first,
    last,
    (seed, { port, oracle, ported }) => {
      expect({ seed, home: ported }).toEqual({ seed, home: oracle });
      expect({ seed, invariants: invariantsOf(port) }).toEqual({ seed, invariants: HOLDS });
    },
    (seed) => homeCaseOf(seeded(seed)),
  );
  const short = Object.entries(reach).filter(([, count]) => count < FLOOR);
  expect({ reach, short }).toEqual({ reach, short: [] });
};
