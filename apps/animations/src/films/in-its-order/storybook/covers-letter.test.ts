import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['cold-letter', 'cold-ouch']);

describe("In Its Order's letter and close shots", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate drawn over it in any frame (the table and the scroll), and reads every face (critique 2, item 1)",
    (_, lines) => {
      expect(lines).toEqual([]);
    },
  );

  test('reads both shots', () => {
    expect(covers.map(([id]) => id)).toEqual(['cold-letter', 'cold-ouch']);
  });
});
