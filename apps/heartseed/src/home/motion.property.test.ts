import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { STAGES } from '../garden';
import { below, pickOf, random } from '../test/garden-model';
import type { Grown } from './grown';
import { endMotionOf, MOTION } from './motion';

type Delay = number | 'rest';
interface PlainPlant {
  readonly spring: Delay;
  readonly sway: boolean;
}

const endModel = (grown: readonly Grown[]): readonly PlainPlant[] => {
  const result: PlainPlant[] = [];
  for (let index = 0; index < grown.length; index++) {
    let spring: Delay = 'rest';
    let sway = false;
    if (index < 12) {
      spring = Math.min(300 + 160 * index, 1200);
      sway = grown[index]?.stage === 'full corn';
    }
    result.push({ spring, sway });
  }
  return result;
};

const delayOf = (delay: Option.Option<number>): Delay =>
  Option.match(delay, { onNone: () => 'rest' as const, onSome: (ms) => ms });

const plainPlants = (plants: ReturnType<typeof endMotionOf>): readonly PlainPlant[] =>
  plants.map((plant) => ({ spring: delayOf(plant.spring), sway: plant.sway }));

describe('the motion plan', () => {
  it('keeps the timing and work bounds in one set of constants', () => {
    expect(MOTION).toEqual({
      hold: 1200,
      sways: 12,
      endFirst: 300,
      endStep: 160,
      springDuration: 420,
      swayDegrees: 3,
      swayDuration: 1800,
    });
  });

  it('springs the first twelve grown plants in order and sways only their full corn, leaving the rest still', () => {
    const next = random(10_202);
    const floors = { longer: 0, corn: 0, held: 0, empty: 0 };
    const seen = new Set<string>();
    for (let run = 0; run < 160; run++) {
      let count = below(next, 31);
      if (run % 10 === 0) count = 0;
      const grown: readonly Grown[] = Array.from({ length: count }, (_, index) => ({
        reference: `Psalms 119:${index + 1}`,
        stage: pickOf(next, STAGES),
      }));
      const before = structuredClone(grown);
      const got = endMotionOf(grown);
      const want = endModel(grown);
      expect(plainPlants(got), `grown ${run}`).toEqual(want);
      expect(endMotionOf(grown), `repeat grown ${run}`).toEqual(got);
      expect(grown, `unchanged grown ${run}`).toEqual(before);
      if (grown.length > 12) floors.longer++;
      if (grown.some((plant) => plant.stage === 'full corn')) floors.corn++;
      if (want.some((plant) => plant.spring === 1200)) floors.held++;
      if (grown.length === 0) floors.empty++;
      for (const plant of grown) seen.add(plant.stage);
    }
    for (const [kind, count] of Object.entries(floors))
      expect(count, kind).toBeGreaterThanOrEqual(10);
    expect([...seen].toSorted()).toEqual([...STAGES].toSorted());
  });
});
