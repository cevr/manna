import { describe, expect, test } from 'effect-bun-test';
import { RESOURCE_GROUPS, shotResources } from './testing.ts';

const [, ids] = RESOURCE_GROUPS;

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const shots = await shotResources(ids);

describe("In Its Order's storybook shots: what the film paints against what the verify paints, the letter and the close", () => {
  test.each(shots)(
    '%s reads the same picture files at the same sizes, places, moves and reveals, each cell at the same anchor and head, the same head shares, worn heads, blinks and dress, under the same light, in the film as in the scene the verify’s loader gives its page (round 1, M3; round 3, M2)',
    (_, film, verify) => {
      expect(film).toEqual(verify);
    },
  );

  test('reads its two shots', () => {
    expect(shots.map(([id]) => id)).toEqual([...ids]);
  });
});
