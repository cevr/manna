import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['cold-letter']);

describe("In Its Order's letter shot", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate at rest over it in any frame (the table and the scroll), and reads every face (critique 2, item 1)",
    (_, faults) => {
      expect(faults).toEqual([]);
    },
  );

  test('crosses faces with the falling scroll alone, its fall the only moving pass over a face (the orchestrator’s ruling: a falling letter reads as motion); the bottle stays in his hand and crosses none (critique 3, finding 1)', () => {
    const scroll = 'INFO cover moving: src/films/in-its-order/plates/scroll-rolled.png over';
    expect(covers.map(([id, , moving]) => [id, moving])).toEqual([
      ['cold-letter', [`${scroll} lead frames 20–21`]],
    ]);
  });
});
