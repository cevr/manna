import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import type { PlantStage } from '../field';
import { STAGES } from '../garden';
import { HOME_ICONS, type Furrow, type FurrowKind } from '../home';
import { below, pickOf, random } from '../test/garden-model';
import type { Grown } from './grown';
import { endMotionOf, motionOf, MOTION } from './motion';

const stages = ['not planted', ...STAGES] as const satisfies readonly PlantStage[];
const kinds = ['own', 'held', 'taught', 'other'] as const satisfies readonly FurrowKind[];

const furrowOf = (next: () => number, index: number, plants: readonly PlantStage[]): Furrow => ({
  id: `furrow-${index}`,
  title: `Furrow ${index}`,
  source: { _tag: 'Loose' },
  kind: pickOf(next, kinds),
  icon: pickOf(next, HOME_ICONS),
  caption: `${plants.length} verses to learn`,
  plants: plants.map((stage, place) => ({
    reference: `Psalms 119:${place + 1}`,
    stage,
    ready: below(next, 2) === 0,
    label: `Plant ${place}, ${stage}`,
  })),
});

type Delay = number | 'rest';
interface PlainPlant {
  readonly spring: Delay;
  readonly sway: boolean;
}
interface PlainFurrow {
  readonly icon: Delay;
  readonly plants: readonly PlainPlant[];
}

/** The literal timing rule, with separate counts for planted plants and full corn in reading order. */
const homeModel = (furrows: readonly Furrow[]): readonly PlainFurrow[] => {
  const result: PlainFurrow[] = [];
  let planted = 0;
  let corn = 0;
  for (let row = 0; row < furrows.length; row++) {
    const plants: PlainPlant[] = [];
    const furrow = furrows[row];
    if (!furrow) continue;
    for (let place = 0; place < furrow.plants.length; place++) {
      const plant = furrow.plants[place];
      let spring: Delay = 'rest';
      let sway = false;
      if (row < 14 && plant && plant.stage !== 'not planted') {
        if (planted < 60) spring = Math.min(90 * row + 70 * (place + 1), 1200);
        planted++;
        if (plant.stage === 'full corn') {
          sway = corn < 12;
          corn++;
        }
      }
      plants.push({ spring, sway });
    }
    let icon: Delay = 'rest';
    if (row < 14) icon = row * 90;
    result.push({ icon, plants });
  }
  return result;
};

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

const plainHome = (furrows: ReturnType<typeof motionOf>): readonly PlainFurrow[] =>
  furrows.map((furrow) => ({ icon: delayOf(furrow.icon), plants: plainPlants(furrow.plants) }));

const fieldOf = (next: () => number, run: number): readonly Furrow[] => {
  if (run % 10 === 0) return [];
  if (run % 10 === 1)
    return [
      furrowOf(
        next,
        0,
        Array.from({ length: 60 }, () => 'seed'),
      ),
      furrowOf(next, 1, ['full corn']),
    ];
  let rows = below(next, 21);
  if (run % 10 === 2) rows = below(next, 121);
  return Array.from({ length: rows }, (_, row) => {
    let count = below(next, 201);
    if (run % 10 === 2) count = 1;
    if (run % 10 === 3 && row === 0) count = 0;
    return furrowOf(
      next,
      row,
      Array.from({ length: count }, () => pickOf(next, stages)),
    );
  });
};

/** Every entrance finishes promptly, and the independent spring and sway caps bound the work. */
const expectBounds = (furrows: readonly PlainFurrow[]) => {
  const plants = furrows.flatMap((furrow) => furrow.plants);
  expect(plants.filter((plant) => plant.spring !== 'rest').length).toBeLessThanOrEqual(60);
  expect(plants.filter((plant) => plant.sway).length).toBeLessThanOrEqual(12);
  for (const furrow of furrows) {
    if (furrow.icon !== 'rest') expect(furrow.icon + 300).toBeLessThanOrEqual(1620);
    for (const plant of furrow.plants)
      if (plant.spring !== 'rest') expect(plant.spring + 420).toBeLessThanOrEqual(1620);
  }
};

describe('the motion plan', () => {
  it('keeps the timing and work bounds in one set of constants', () => {
    expect(MOTION).toEqual({
      step: 90,
      plantStep: 70,
      hold: 1200,
      furrows: 14,
      springs: 60,
      sways: 12,
      endFirst: 300,
      endStep: 160,
      iconDuration: 300,
      springDuration: 420,
      swayDegrees: 3,
      swayDuration: 1800,
    });
  });

  it('staggers only the first fourteen furrows, sixty planted plants and twelve full corn independently, without changing its inputs', () => {
    const next = random(10_201);
    const floors = { furrows: 0, springs: 0, sways: 0, independent: 0, held: 0, bare: 0, empty: 0 };
    const seenStages = new Set<PlantStage>();
    const seenKinds = new Set<FurrowKind>();
    const seenIcons = new Set<string>();
    for (let run = 0; run < 240; run++) {
      const furrows = fieldOf(next, run);
      const before = structuredClone(furrows);
      const want = homeModel(furrows);
      const got = motionOf(furrows);
      expect(plainHome(got), `field ${run}`).toEqual(want);
      expect(motionOf(furrows), `repeat field ${run}`).toEqual(got);
      expect(furrows, `unchanged field ${run}`).toEqual(before);
      const eligible = furrows.slice(0, 14).flatMap((furrow) => furrow.plants);
      if (furrows.length > 14) floors.furrows++;
      if (eligible.filter((plant) => plant.stage !== 'not planted').length > 60) floors.springs++;
      if (eligible.filter((plant) => plant.stage === 'full corn').length > 12) floors.sways++;
      const plans = want.flatMap((furrow) => furrow.plants);
      if (plans.some((plant) => plant.spring === 'rest' && plant.sway)) floors.independent++;
      if (plans.some((plant) => plant.spring === 1200)) floors.held++;
      if (furrows.some((furrow) => furrow.plants.length === 0)) floors.bare++;
      if (furrows.length === 0) floors.empty++;
      for (const furrow of furrows) {
        seenKinds.add(furrow.kind);
        seenIcons.add(furrow.icon);
        for (const plant of furrow.plants) seenStages.add(plant.stage);
      }
      expectBounds(plainHome(got));
    }
    for (const [kind, count] of Object.entries(floors))
      expect(count, kind).toBeGreaterThanOrEqual(10);
    expect([...seenStages].toSorted()).toEqual([...stages].toSorted());
    expect([...seenKinds].toSorted()).toEqual([...kinds].toSorted());
    expect([...seenIcons].toSorted()).toEqual([...HOME_ICONS].toSorted());
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
