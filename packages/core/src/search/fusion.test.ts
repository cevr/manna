import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import {
  contribution,
  fuse,
  NEAR_TOP_RANK_BONUS,
  ORIGINAL_QUERY_WEIGHT,
  rankBonus,
  RRF_K,
  TOP_RANK_BONUS,
} from './fusion.js';

describe('§9.4 the pinned constants', () => {
  it('is RRF with k = 60', () => {
    expect(RRF_K).toBe(60);
  });

  it('weights the original query ×2', () => {
    expect(ORIGINAL_QUERY_WEIGHT).toBe(2);
  });

  it('gives +0.05 to a list’s #1 and +0.02 to its #2-3', () => {
    expect(TOP_RANK_BONUS).toBe(0.05);
    expect(NEAR_TOP_RANK_BONUS).toBe(0.02);
  });
});

describe('§9.4 one contribution', () => {
  it('is weight / (k + rank), with no bonus in it', () => {
    expect(contribution(1, 1)).toBeCloseTo(1 / 61, 12);
    expect(contribution(2, 1)).toBeCloseTo(1 / 62, 12);
    expect(contribution(3, 1)).toBeCloseTo(1 / 63, 12);
    expect(contribution(4, 1)).toBeCloseTo(1 / 64, 12);
  });

  it('scales the reciprocal term by the weight', () => {
    expect(contribution(1, 2)).toBeCloseTo(2 / 61, 12);
  });

  it('carries no bonus, because the bonus is not a per-list quantity', () => {
    expect(contribution(1, 1) - 1 / 61).toBeCloseTo(0, 12);
  });
});

describe('§9.4 the one bonus', () => {
  it('is +0.05 at best rank 1, +0.02 at best rank 2-3, nothing below', () => {
    expect(rankBonus(1)).toBe(TOP_RANK_BONUS);
    expect(rankBonus(2)).toBe(NEAR_TOP_RANK_BONUS);
    expect(rankBonus(3)).toBe(NEAR_TOP_RANK_BONUS);
    expect(rankBonus(4)).toBe(0);
  });
});

const LEXICAL = ['a', 'b', 'c', 'd'];
const VECTOR = ['b', 'e', 'c', 'a'];

const EXPECTED = {
  a: 2 / 61 + 1 / 64 + TOP_RANK_BONUS,
  b: 2 / 62 + 1 / 61 + TOP_RANK_BONUS,
  c: 2 / 63 + 1 / 63 + NEAR_TOP_RANK_BONUS,
  d: 2 / 64,
  e: 1 / 62 + NEAR_TOP_RANK_BONUS,
} as const;

describe('§9.4 the fusion fixture', () => {
  const fused = fuse([
    { ids: LEXICAL, weight: ORIGINAL_QUERY_WEIGHT },
    { ids: VECTOR, weight: 1 },
  ]);

  it('reproduces every score exactly', () => {
    for (const hit of fused) {
      expect(hit.score).toBeCloseTo(EXPECTED[hit.id as keyof typeof EXPECTED], 12);
    }
    expect(fused.length).toBe(5);
  });

  it('produces the order those scores imply', () => {
    const byScore = Object.entries(EXPECTED)
      .sort(([, left], [, right]) => right - left)
      .map(([id]) => id);
    expect(fused.map((hit) => hit.id)).toEqual(byScore);
  });

  it('bonuses a document once even when it tops one list and nearly tops another', () => {
    const order = fused.map((hit) => hit.id);
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    expect((EXPECTED.b - EXPECTED.a).toFixed(5)).toBe('0.00024');
  });

  it('gives a document that tops two lists no more bonus than one that tops one', () => {
    const both = fuse([
      { ids: ['x'], weight: 1 },
      { ids: ['x'], weight: 1 },
    ]);
    expect(both[0]?.score).toBeCloseTo(1 / 61 + 1 / 61 + TOP_RANK_BONUS, 12);
    const one = fuse([{ ids: ['x'], weight: 1 }]);
    expect(one[0]?.score).toBeCloseTo(1 / 61 + TOP_RANK_BONUS, 12);
    expect((both[0]?.score ?? 0) - (one[0]?.score ?? 0)).toBeCloseTo(1 / 61, 12);
  });

  it('does not multiply the bonus by the weight', () => {
    const weighted = fuse([{ ids: ['x'], weight: ORIGINAL_QUERY_WEIGHT }]);
    expect(weighted[0]?.score).toBeCloseTo(2 / 61 + TOP_RANK_BONUS, 12);
  });

  it('lifts a doubly-agreed document above one the weighted list ranked higher', () => {
    const order = fused.map((hit) => hit.id);
    expect(order.indexOf('e')).toBeLessThan(order.indexOf('d'));
  });

  it('carries each document’s rank in each list, positionally', () => {
    const a = fused.find((hit) => hit.id === 'a');
    expect(a?.ranks).toEqual([Option.some(1), Option.some(4)]);
    const e = fused.find((hit) => hit.id === 'e');
    expect(e?.ranks).toEqual([Option.none(), Option.some(2)]);
  });
});

describe('§9.4 fusion is a function of its inputs', () => {
  it('breaks ties by first appearance, not by iteration order', () => {
    const fused = fuse([
      { ids: ['x', 'y'], weight: 1 },
      { ids: ['y', 'x'], weight: 1 },
    ]);
    expect(fused.map((hit) => hit.id)).toEqual(['x', 'y']);
    expect(fused[0]?.score).toBeCloseTo(fused[1]?.score ?? 0, 12);
  });

  it('scores a repeated id once, at its best rank', () => {
    const fused = fuse([{ ids: ['x', 'x'], weight: 1 }]);
    expect(fused.length).toBe(1);
    expect(fused[0]?.score).toBeCloseTo(1 / 61 + TOP_RANK_BONUS, 12);
    expect(fused[0]?.ranks).toEqual([Option.some(1)]);
  });

  it('an empty list contributes nothing and breaks nothing', () => {
    const withVector = fuse([
      { ids: LEXICAL, weight: ORIGINAL_QUERY_WEIGHT },
      { ids: [], weight: 1 },
    ]);
    expect(withVector.map((hit) => hit.id)).toEqual(LEXICAL);
    for (const hit of withVector) {
      expect(hit.ranks[1]).toEqual(Option.none());
    }
  });
});
