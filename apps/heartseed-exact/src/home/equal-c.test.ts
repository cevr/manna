/**
 * Home equals the current app's over its whole domain (spec A1 to A3), the
 * last third of the seeds (`../test/home-equal.ts`).
 */

import { it } from 'bun:test';

import { checkSeeds } from '../test/home-equal';

it('answers what the current app answers, and keeps every invariant', () => {
  checkSeeds(351, 525);
});
