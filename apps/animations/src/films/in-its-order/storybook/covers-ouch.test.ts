import { describe, expect, test } from 'effect-bun-test';
import { faceCovers } from './testing.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const covers = await faceCovers(['cold-ouch']);

describe("In Its Order's close on the lead", () => {
  test.each(covers)(
    "%s covers no figure's face with a plate at rest over it in any frame (the table and the scroll at rest before him, the far table before the diners), reads every face, and has no plate passing over one (critique 1, item 1)",
    (_, faults, moving) => {
      expect(faults).toEqual([]);
      expect(moving).toEqual([]);
    },
  );

  test('reads the close', () => {
    expect(covers.map(([id]) => id)).toEqual(['cold-ouch']);
  });
});
