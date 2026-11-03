import { describe, expect, test } from 'bun:test';

import { coverMap, positionOf } from './cover.ts';

const land = (map: readonly [number, number, number, number], u: number, v: number) => [
  u * map[0] + map[2],
  v * map[1] + map[3],
];

describe('the picture under its canvas', () => {
  test('reads the stylesheet’s percentages, and anything else as the centre', () => {
    expect(positionOf('38% 60%')).toEqual({ x: 0.38, y: 0.6 });
    expect(positionOf('left top')).toEqual({ x: 0.5, y: 0.5 });
  });

  test('a box as wide as the picture shows all of it', () => {
    const map = coverMap(
      { width: 300, height: 200 },
      { width: 1536, height: 1024 },
      { x: 0.5, y: 0.5 },
    );
    expect(land(map, 0, 0)).toEqual([0, 0]);
    expect(land(map, 1, 1)).toEqual([1, 1]);
  });

  test('a tall box shows the slice the position picks, as `object-fit: cover` does', () => {
    const map = coverMap(
      { width: 100, height: 200 },
      { width: 300, height: 200 },
      { x: 0.38, y: 0.6 },
    );
    const [left = 0, top = 0] = land(map, 0, 0);
    const [right = 0, bottom = 0] = land(map, 1, 1);
    expect(left).toBeCloseTo(76 / 300);
    expect(right).toBeCloseTo(176 / 300);
    expect([top, bottom]).toEqual([0, 1]);
  });
});
