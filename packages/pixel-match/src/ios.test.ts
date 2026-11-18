import { describe, expect, test } from 'bun:test';

import { rectIn } from './ios.ts';

describe("a driver's rect", () => {
  test('is the first whole rect, depth first', () => {
    const answer =
      '{"ok":true,"node":{"label":"Today","frame":{"x":20,"y":64.5,"width":120,"height":41}}}';
    expect(rectIn(answer)).toEqual({ x: 20, y: 64.5, width: 120, height: 41 });
  });

  test('is none for a part of a rect, or text that is no JSON', () => {
    expect(rectIn('{"frame":{"y":1,"height":2}}')).toBeUndefined();
    expect(rectIn('not json')).toBeUndefined();
  });
});
