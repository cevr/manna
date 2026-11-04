import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['cold-baby', 'cold-table']);

describe("In Its Order's baby and table shots", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate drawn over it in any frame, and reads every face (the table below every chin, critique 2, item 1)",
    (_, faults, moving) => {
      expect(faults).toEqual([]);
      expect(moving).toEqual([]);
    },
  );

  test('reads both shots', () => {
    expect(covers.map(([id]) => id)).toEqual(['cold-baby', 'cold-table']);
  });
});
