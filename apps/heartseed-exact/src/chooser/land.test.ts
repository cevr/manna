import { expect, it } from 'bun:test';

import { landRoom, landSources, portOf, type LandFrames } from './land';

const NONE = { landedTop: 0, landedRoom: -1 };

/** iOS on an iPhone 17 at the default size, as the iOS probe read it: the scroll from the screen's top, under the navigation bar (to 116); the seen area 592 high. */
const IOS = { seenTop: 116, seenHeight: 592, scrollTop: 0, scrollHeight: 705 };

/** Where a landing puts the verse's top: the room below the origin the host counts it from. */
const landedAt = (frames: LandFrames, port: number) => port + landRoom(frames);

it('lands a short verse a third down the seen area, past the bar the scroll runs under', () => {
  const frames = { ...IOS, verseHeight: 70, ...NONE };
  expect(landedAt(frames, 0)).toBeCloseTo(116 + (705 - 116) / 3, 6);
});

it('lands it a third down the scroll itself where nothing covers it (the web)', () => {
  const frames = {
    seenTop: 0,
    seenHeight: 800,
    scrollTop: 0,
    scrollHeight: 800,
    verseHeight: 70,
    ...NONE,
  };
  expect(landRoom(frames)).toBeCloseTo(800 / 3, 6);
});

it('takes the origin a landing showed: one under the bar lands the verse at the same place', () => {
  const first = { ...IOS, verseHeight: 70, ...NONE };
  const target = landedAt(first, 0);
  const shown = { ...first, landedTop: 116 + landRoom(first), landedRoom: landRoom(first) };
  expect(portOf(shown)).toBe(116);
  expect(landedAt(shown, 116)).toBeCloseTo(target, 6);
  const again = { ...shown, landedTop: landedAt(shown, 116), landedRoom: landRoom(shown) };
  expect(landRoom(again)).toBe(landRoom(shown));
});

it('settles at once where the first landing was right, a third of a point aside', () => {
  const first = { ...IOS, verseHeight: 70, ...NONE };
  const shown = {
    ...first,
    landedTop: landRoom(first) + 0.33,
    landedRoom: landRoom(first),
  };
  expect(landRoom(shown)).toBe(landRoom(first));
});

it('lands a verse taller than the two thirds below that line higher, whole above the scroll foot with its margin (the largest text)', () => {
  const frames = {
    ...IOS,
    scrollHeight: 655.5,
    verseHeight: 460.93,
    landedTop: 347,
    landedRoom: 231.07,
  };
  const top = landedAt(frames, portOf(frames));
  expect(top).toBeGreaterThanOrEqual(116);
  expect(top + 460.93 + 16).toBeCloseTo(655.5, 6);
});

it('lands a verse taller than the seen area at its top, under the bar', () => {
  expect(landedAt({ ...IOS, verseHeight: 900, ...NONE }, 0)).toBe(116);
});

it("falls back to a third of the scroll's height before the seen area is laid out", () => {
  expect(landRoom({ ...IOS, seenHeight: 0, verseHeight: 70, ...NONE })).toBeCloseTo(705 / 3, 6);
  expect(
    landRoom({ ...IOS, seenHeight: Number.NaN, verseHeight: Number.NaN, ...NONE }),
  ).toBeCloseTo(705 / 3, 6);
});

it('answers the source with the same room', () => {
  expect(landSources.chapterLand([116, 592, 0, 705, 70, 0, -1]).room).toBe(
    landRoom({ ...IOS, verseHeight: 70, ...NONE }),
  );
});

it('answers the source from its read-back: the origin a landing showed under the bar, in the last two places', () => {
  const first = landRoom({ ...IOS, verseHeight: 70, ...NONE });
  const shown = { ...IOS, verseHeight: 70, landedTop: 116 + first, landedRoom: first };
  const room = landSources.chapterLand([116, 592, 0, 705, 70, 116 + first, first]).room;
  expect(room).toBe(landRoom(shown));
  expect(room).toBeCloseTo((705 - 116) / 3, 6);
  expect(room).not.toBeCloseTo(first, 6);
});

it('takes a read-back with room 0 as read: its origin is where the verse came to rest', () => {
  const shown = { ...IOS, verseHeight: 70, landedTop: 116, landedRoom: 0 };
  expect(portOf(shown)).toBe(116);
  expect(landRoom(shown)).toBeCloseTo((705 - 116) / 3, 6);
});

it('counts no negative cover where the origin read lies below the seen top', () => {
  const shown = { ...IOS, verseHeight: 70, landedTop: 200, landedRoom: 50 };
  expect(portOf(shown)).toBe(150);
  expect(landRoom(shown)).toBeCloseTo((705 - 116) / 3, 6);
});
