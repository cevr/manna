import { Option } from 'effect';

import type { Furrow } from '../home';
import type { Grown } from './grown';

/** Milliseconds, work caps and degrees shared by the plan and its drawings. */
export const MOTION = {
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
} as const;

/** A drawing's spring delay, if it enters, and whether its full corn sways. */
export interface PlantMotion {
  readonly spring: Option.Option<number>;
  readonly sway: boolean;
}

/** A furrow's icon entrance and its plants' motions, in their reading order. */
export interface FurrowMotion {
  readonly icon: Option.Option<number>;
  readonly plants: readonly PlantMotion[];
}

const rest = (): PlantMotion => ({ spring: Option.none(), sway: false });

/** The first furrows' drawings enter in turn, bounded independently by planted plants and full corn. */
export const motionOf = (furrows: readonly Furrow[]): readonly FurrowMotion[] => {
  let planted = 0;
  let corn = 0;
  return furrows.map((furrow, row) => {
    if (row >= MOTION.furrows) return { icon: Option.none(), plants: furrow.plants.map(rest) };
    return {
      icon: Option.some(MOTION.step * row),
      plants: furrow.plants.map((plant, place): PlantMotion => {
        if (plant.stage === 'not planted') return rest();
        let spring = Option.none<number>();
        if (planted < MOTION.springs)
          spring = Option.some(
            Math.min(MOTION.step * row + MOTION.plantStep * (place + 1), MOTION.hold),
          );
        planted++;
        let sway = false;
        if (plant.stage === 'full corn') {
          sway = corn < MOTION.sways;
          corn++;
        }
        return { spring, sway };
      }),
    };
  });
};

/** The first grown plants spring in run order; only full corn among those sways. */
export const endMotionOf = (grown: readonly Grown[]): readonly PlantMotion[] =>
  grown.map((plant, index) => {
    if (index >= MOTION.sways) return rest();
    return {
      spring: Option.some(Math.min(MOTION.endFirst + MOTION.endStep * index, MOTION.hold)),
      sway: plant.stage === 'full corn',
    };
  });
