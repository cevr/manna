import { describe, expect, test } from 'effect-bun-test';
import { shotResources } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const shots = await shotResources();

describe("In Its Order's storybook shots: what the film paints against what the verify paints", () => {
  test.each(shots)(
    '%s reads the same picture files at the same sizes, places, moves and reveals, the same head shares, worn heads and blinks, under the same light, in the film as in the verify’s page (round 1, M3)',
    (_, film, verify) => {
      expect(film).toEqual(verify);
    },
  );

  test('reads all nine shots', () => {
    expect(shots.map(([id]) => id)).toEqual([
      'cold-baby',
      'cold-table',
      'cold-letter',
      'cold-ouch',
      'cold-what',
      'title',
      'milk-cup',
      'milk-pour',
      'milk-row',
    ]);
  });
});
