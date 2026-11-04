import { describe, expect, test } from 'effect-bun-test';
import { GRID } from './grid.ts';
import { COLD_STORY, MILK_STORY, TITLE_STORY } from './stories.ts';

describe("In Its Order's drawings over its shots", () => {
  test('only the title draws over a shot, and its boxes cover under a tenth of the frame, so the parity reads the rest', () => {
    const area = (story: typeof TITLE_STORY) =>
      story.over.reduce((sum, o) => sum + o.box.w * o.box.h, 0);
    expect([COLD_STORY, MILK_STORY].map(area)).toEqual([0, 0]);
    expect(area(TITLE_STORY)).toBeLessThan(0.1 * GRID.size.width * GRID.size.height);
  });
});
