import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['milk-cup', 'milk-pour', 'milk-row']);

describe("In Its Order's parchment shots", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate drawn over it in any frame (the book, the dropper and the ribbon), and reads every face (critique 2, item 1)",
    (_, lines) => {
      expect(lines).toEqual([]);
    },
  );

  test('reads the three shots', () => {
    expect(covers.map(([id]) => id)).toEqual(['milk-cup', 'milk-pour', 'milk-row']);
  });
});
