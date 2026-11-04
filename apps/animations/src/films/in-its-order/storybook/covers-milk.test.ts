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

  test("faults a still 2×2 plate laid inside each milk-row figure's lower face where the page paints it, the baby, the toddler and the child at their head shares (0.68, 0.81, 0.86) included (round 1, M1)", () => {
    const row = covers.find(([id]) => id === 'milk-row');
    expect(row?.[3].toSorted(([a], [b]) => a.localeCompare(b))).toEqual(
      ['baby', 'child', 'lead', 'toddler', 'villager'].map((name) => [name, true]),
    );
  });

  test('reads the three shots', () => {
    expect(covers.map(([id]) => id)).toEqual(['milk-cup', 'milk-pour', 'milk-row']);
  });
});
