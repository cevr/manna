/**
 * The growing seed's plan (`./growth`, hsintro O6) over generated clocks:
 * gentle durations whose sum is the cycle; every frame summing to one and
 * showing at most two neighbouring stages; no stage moving more than
 * `16 / fade` in a 16 ms frame; the cycle repeating; the seed alone at 0
 * and on a bad clock; the still frame full corn alone; the loop's start a
 * frame of full corn alone; and the points the drawing adapter reads
 * (`GROWTH_STEPS`), interpolated apart from `growthAt`, equal to it.
 */

import { describe, expect, it } from 'bun:test';

import { GROWTH, GROWTH_START, GROWTH_STEPS, GROWTH_STILL, growthAt } from './growth';

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const EPSILON = 1e-9;

/** The stages a frame shows, by index. */
const shown = (frame: readonly number[]) =>
  [...frame.keys()].filter((index) => (frame[index] ?? 0) > EPSILON);

/** The adapter's reading of the points: the straight line through `row` at `ms` in one cycle, written apart. */
const lineAt = (row: readonly number[], ms: number) => {
  const { at } = GROWTH_STEPS;
  for (let index = 1; index < at.length; index++) {
    const from = at[index - 1] ?? 0;
    const to = at[index] ?? 0;
    if (ms <= to && to > from) {
      const low = row[index - 1] ?? 0;
      const high = row[index] ?? 0;
      return low + ((ms - from) / (to - from)) * (high - low);
    }
  }
  return row.at(-1) ?? 0;
};

describe('the growing seed’s plan', () => {
  it('holds gentle durations whose sum is the cycle', () => {
    const { hold, fade, rest, cycle } = GROWTH;
    expect([
      hold >= 600 && hold <= 2000,
      fade >= 300 && fade <= 1000,
      rest >= hold && rest <= 4000,
      cycle === 3 * hold + rest + 4 * fade,
    ]).toEqual([true, true, true, true]);
  });

  it('shows the seed alone at 0 and on a bad clock, full corn alone still and at the loop’s start', () => {
    for (const ms of [0, -1, -GROWTH.cycle, Number.NaN, Number.POSITIVE_INFINITY])
      expect(growthAt(ms), String(ms)).toEqual([1, 0, 0, 0]);
    expect(GROWTH_STILL).toEqual([0, 0, 0, 1]);
    expect(growthAt(GROWTH_START)).toEqual([...GROWTH_STILL]);
    expect(growthAt(GROWTH_START + GROWTH.cycle)).toEqual([...GROWTH_STILL]);
  });

  it('over 4,000 generated instants sums to one, shows two neighbouring stages at most, moves gently, repeats by the cycle and matches the points the adapter reads', () => {
    const next = random(4028);
    const seen = new Set<string>();
    for (let index = 0; index < 4000; index++) {
      const ms = Math.floor(next() * 86_400_000);
      const frame = growthAt(ms);
      const sum = frame.reduce((total, each) => total + each, 0);
      const stages = shown(frame);
      const [first = 0, second = first] = stages;
      const neighbours =
        stages.length < 2 || (second - first + 4) % 4 === 1 || (first - second + 4) % 4 === 1;
      const later = growthAt(ms + 16);
      const step = Math.max(...frame.map((each, stage) => Math.abs(each - (later[stage] ?? 0))));
      const again = growthAt(ms + GROWTH.cycle);
      const inCycle = ms % GROWTH.cycle;
      const read = GROWTH_STEPS.opacity.map((row) => lineAt(row, inCycle));
      expect({
        ms,
        sum: Math.abs(sum - 1) < 1e-6,
        count: stages.length <= 2,
        neighbours,
        gentle: step <= 16 / GROWTH.fade + 1e-6,
        repeats: again.every((each, stage) => Math.abs(each - (frame[stage] ?? 0)) < 1e-6),
        read: read.every((each, stage) => Math.abs(each - (frame[stage] ?? 0)) < 1e-6),
      }).toEqual({
        ms,
        sum: true,
        count: true,
        neighbours: true,
        gentle: true,
        repeats: true,
        read: true,
      });
      if (stages.length === 1) seen.add(`alone:${first}`);
      if (stages.length === 2) seen.add(`fade:${first}-${second}`);
    }
    expect([...seen].toSorted()).toEqual([
      'alone:0',
      'alone:1',
      'alone:2',
      'alone:3',
      'fade:0-1',
      'fade:0-3',
      'fade:1-2',
      'fade:2-3',
    ]);
  });

  it('leads seed, blade, ear, full corn once a cycle on a 16 ms clock', () => {
    const order: number[] = [];
    for (let ms = 0; ms < GROWTH.cycle; ms += 16) {
      const frame = growthAt(ms);
      const lead = frame.indexOf(Math.max(...frame));
      if (order.at(-1) !== lead) order.push(lead);
    }
    expect(order).toEqual([0, 1, 2, 3, 0]);
  });
});
