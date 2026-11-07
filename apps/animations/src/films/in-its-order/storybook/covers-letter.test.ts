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

  test('crosses no face with a moving plate: the scroll comes up from behind the table into his hand below his face, and the bottle stays in his hand (critique 2, finding 2: the falling scroll flashed over his head; critique 3, finding 1)', () => {
    expect(covers.map(([id, , moving]) => [id, moving])).toEqual([['cold-letter', []]]);
  });
});
