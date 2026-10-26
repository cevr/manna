import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { type SketchItem, SketchItem as Item, inside, moved, sketchSummary } from './sketch.ts';

const view = { w: 1000, h: 500 };
const pen: SketchItem = {
  _tag: 'Pen',
  id: 'a',
  ink: 'ink',
  points: [
    { x: 0.1, y: 0.1, p: 0.5 },
    { x: 0.3, y: 0.1, p: 0.6 },
  ],
};
const rect: SketchItem = { _tag: 'Rect', id: 'b', ink: 'red', x: 0.5, y: 0.5, w: 0.2, h: 0.2 };

describe('a sketch item', () => {
  test('decodes from a note as written, and refuses an unknown ink', () => {
    expect(Schema.decodeSync(Item)(rect)).toEqual(rect);
    expect(() => Schema.decodeUnknownSync(Item)({ ...rect, ink: 'blue' })).toThrow();
  });
  test('a marquee selects what it wholly holds', () => {
    expect(inside(view, rect, { x: 490, y: 240, w: 220, h: 120 })).toBe(true);
    expect(inside(view, rect, { x: 490, y: 240, w: 100, h: 120 })).toBe(false);
  });
  test('moves by panel fractions, every point of it', () => {
    const m = moved(pen, 0.1, -0.05);
    expect(m._tag === 'Pen' && m.points.map((p) => [p.x, p.y])).toEqual([
      [0.2, 0.05],
      [0.4, 0.05],
    ]);
  });
  test('says what a sketch holds in a few words', () => {
    expect(sketchSummary([pen, pen, rect])).toBe('pen 2, rect 1');
  });
});
