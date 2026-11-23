import { describe, expect, it } from 'bun:test';

import { boxOf, groundPoints, SCREEN, type Box } from './ground-point.ts';

const within = (box: Box, at: { readonly x: number; readonly y: number }) =>
  at.x > box.x && at.x < box.x + box.w && at.y > box.y && at.y < box.y + box.h;

describe('the points a drive reads a ground at', () => {
  it('on the whole screen are at its trailing edge, seven tenths down and a little lower', () => {
    const points = groundPoints(SCREEN);
    expect(points.map((at) => at.x.toFixed(3))).toEqual(['0.985', '0.985']);
    expect(points.map((at) => at.y)).toEqual([0.7, 0.71]);
  });

  it('in a sheet drawn inset from the screen’s sides are inside the sheet, not on the list beside it', () => {
    const sheet = boxOf({ x: 8, y: 437, w: 386, h: 429 }, 402, 874);
    const points = groundPoints(sheet);
    expect(points.every((at) => within(sheet, at))).toBe(true);
    expect(points.every((at) => at.x * 402 < 394)).toBe(true);
  });

  it('in a box that ends above seven tenths are held inside it', () => {
    const top = boxOf({ x: 20, y: 0, w: 300, h: 400 }, 402, 874);
    expect(groundPoints(top).every((at) => within(top, at))).toBe(true);
  });
});
