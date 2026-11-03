/** §10 Milestone 8: "RRF k=60 with ×2 original weighting and top-rank bonuses
 *  reproduces the fusion fixture exactly."
 *
 *  "Exactly" is the word that shapes this file. The fixture below is not a
 *  regression snapshot taken from the implementation — it is the arithmetic
 *  written out by hand from §9.4's four rules, so a change to the formula fails
 *  here even if the new formula is self-consistent. A fixture generated from the
 *  code it tests can only ever prove the code is deterministic. */

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

/** §9.4's four constants, pinned. A silent change to any of them reorders every
 *  result a client shows, so they are asserted rather than imported and
 *  trusted. */
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

/** Two ranked lists over five documents, chosen so every branch of §9.4 shows
 *  up in the answer:
 *
 *  - `a` tops the lexical list and sits 4th in the vector list — the confident
 *    top hit that also has broad agreement.
 *  - `b` is 2nd lexically and 1st by vector — a top-rank bonus in each list,
 *    one of them weighted.
 *  - `c` is 3rd in both — the bonus band twice, no #1.
 *  - `d` appears only in the lexical list, deep.
 *  - `e` appears only in the vector list, at its #2. */
const LEXICAL = ['a', 'b', 'c', 'd'];
const VECTOR = ['b', 'e', 'c', 'a'];

/** The scores, computed by hand from qmd's formula: sum `weight / (60 + rank)`
 *  over the lists, then add ONE unweighted bonus from the document's best rank
 *  in any list.
 *
 *  Every line is `Σ weight/(k+rank)` + `bonus(min rank)`, written out rather
 *  than derived, so a change back to a per-list or weighted bonus fails here. */
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
