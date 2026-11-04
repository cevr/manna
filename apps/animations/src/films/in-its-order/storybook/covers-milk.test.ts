import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['milk-cup', 'milk-pour', 'milk-row']);

describe("In Its Order's parchment shots", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate drawn over it in any frame (the book, the dropper and the ribbon), and reads every face (critique 2, item 1)",
    (_, faults) => {
      expect(faults).toEqual([]);
    },
  );

  test('names the dropper crossing the villager on its way down to the cup and back as moving, its only pass over a face', () => {
    const dropper = 'src/films/in-its-order/plates/milk-dropper.png over villager';
    expect(covers.map(([id, , moving]) => [id, moving])).toEqual([
      ['milk-cup', []],
      [
        'milk-pour',
        [
          `INFO cover moving: ${dropper} frames 111–115`,
          `INFO cover moving: ${dropper} frames 127–132`,
        ],
      ],
      ['milk-row', []],
    ]);
  });

  test('reads the three shots', () => {
    expect(covers.map(([id]) => id)).toEqual(['milk-cup', 'milk-pour', 'milk-row']);
  });
});
