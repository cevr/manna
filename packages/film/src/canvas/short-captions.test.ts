import { describe, expect, test } from 'bun:test';
import { breakLines } from './short-captions.ts';

describe('breakLines', () => {
  test('a phrase that fits stays on one line', () => {
    expect(breakLines([100, 200, 100], 10, 800)).toEqual([[0, 1, 2]]);
  });

  test('a phrase too wide for one line is cut where the lines come out most even', () => {
    expect(breakLines([200, 400, 150, 40], 15, 800)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  test('never more lines than the greedy break needs', () => {
    expect(breakLines([500, 500, 500], 10, 800)).toHaveLength(3);
  });
});
