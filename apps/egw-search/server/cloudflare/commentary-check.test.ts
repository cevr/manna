import { describe, expect, test } from 'bun:test';

import { differingVerses, verseCounts } from './commentary-check.ts';

describe('the commentary check', () => {
  test("reads each verse's note count, a whole chapter under verse 0", () => {
    expect([
      ...verseCounts({
        verses: {
          '43.1': [
            [0, [2]],
            [14, [0, 1, 3]],
          ],
          '1.1': [[1, [4]]],
        },
      }),
    ]).toEqual([
      ['43.1:0', 1],
      ['43.1:14', 3],
      ['1.1:1', 1],
    ]);
  });

  test('names each verse whose count differs, either side missing it as 0', () => {
    const local = new Map([
      ['43.1:14', 35],
      ['43.1:1', 31],
      ['1.1:1', 1],
    ]);
    const live = new Map([
      ['43.1:14', 1],
      ['43.1:1', 31],
      ['2.1:1', 2],
    ]);
    expect(differingVerses(local, live)).toEqual(['1.1:1 1/0', '2.1:1 0/2', '43.1:14 35/1']);
    expect(differingVerses(local, local)).toEqual([]);
  });
});
