import { expect, it } from 'bun:test';

import { landRoom, landSources } from './land';

/** iOS on an iPhone 17 at the default size, as drive-chapter measured it: the scroll from the screen's top, the seen area between the navigation bar (to 116) and the tab bar's clearance (to 705). */
const IOS = { seenTop: 116, seenHeight: 589, scrollTop: 0, scrollHeight: 705 };

it('lands a short verse a third down the seen area, past the bar the scroll runs under', () => {
  const room = landRoom({ ...IOS, verseHeight: 70 });
  expect(IOS.scrollTop + room).toBeCloseTo(IOS.seenTop + IOS.seenHeight / 3, 6);
});

it('lands it a third down the scroll itself where nothing covers it (the web)', () => {
  const room = landRoom({
    seenTop: 0,
    seenHeight: 800,
    scrollTop: 0,
    scrollHeight: 800,
    verseHeight: 70,
  });
  expect(room).toBeCloseTo(800 / 3, 6);
});

it('lands a verse taller than the two thirds below that line higher, so it shows whole above the margin', () => {
  const verseHeight = 500;
  const room = landRoom({ ...IOS, verseHeight });
  expect(room).toBe(IOS.seenTop + IOS.seenHeight - verseHeight - 16);
  expect(IOS.scrollTop + room + verseHeight + 16).toBe(IOS.seenTop + IOS.seenHeight);
});

it('lands a verse taller than the seen area at its top, under the bar', () => {
  expect(landRoom({ ...IOS, verseHeight: 900 })).toBe(IOS.seenTop);
});

it("falls back to a third of the scroll's height, with no cover, before the seen area is laid out", () => {
  expect(landRoom({ ...IOS, seenHeight: 0, verseHeight: 70 })).toBeCloseTo(705 / 3, 6);
  expect(landRoom({ ...IOS, seenHeight: Number.NaN, verseHeight: Number.NaN })).toBeCloseTo(
    705 / 3,
    6,
  );
});

it('answers the source with the same room', () => {
  expect(landSources.chapterLand([116, 589, 0, 705, 70]).room).toBe(
    landRoom({ ...IOS, verseHeight: 70 }),
  );
});
