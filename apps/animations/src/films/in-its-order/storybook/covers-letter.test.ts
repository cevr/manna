import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['cold-letter', 'cold-ouch']);

describe("In Its Order's letter and close shots", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate at rest over it in any frame (the table and the scroll), and reads every face (critique 2, item 1)",
    (_, faults) => {
      expect(faults).toEqual([]);
    },
  );

  test('names the falling scroll crossing faces as moving, its only pass over a face', () => {
    const scroll = 'INFO cover moving: src/films/in-its-order/plates/scroll-rolled.png over';
    expect(covers.map(([id, , moving]) => [id, moving])).toEqual([
      [
        'cold-letter',
        [
          `${scroll} lead frames 20–23`,
          `${scroll} diner-3 frames 21–23`,
          `${scroll} diner-3 frames 28–29`,
          `${scroll} diner-4 frames 21–24`,
          `${scroll} diner-4 frames 27–30`,
        ],
      ],
      ['cold-ouch', []],
    ]);
  });

  test('reads both shots', () => {
    expect(covers.map(([id]) => id)).toEqual(['cold-letter', 'cold-ouch']);
  });
});
