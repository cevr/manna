import { Option } from 'effect';

import type { Grown } from './grown';

/** Milliseconds, work caps and degrees shared by the plan and its drawings. */
export const MOTION = {
  hold: 1200,
  sways: 12,
  endFirst: 300,
  endStep: 160,
  springDuration: 420,
  swayDegrees: 3,
  swayDuration: 1800,
} as const;

/** A drawing's spring delay, if it enters, and whether its full corn sways. */
export interface PlantMotion {
  readonly spring: Option.Option<number>;
  readonly sway: boolean;
}

const rest = (): PlantMotion => ({ spring: Option.none(), sway: false });

/** The first grown plants spring in run order; only full corn among those sways. */
export const endMotionOf = (grown: readonly Grown[]): readonly PlantMotion[] =>
  grown.map((plant, index) => {
    if (index >= MOTION.sways) return rest();
    return {
      spring: Option.some(Math.min(MOTION.endFirst + MOTION.endStep * index, MOTION.hold)),
      sway: plant.stage === 'full corn',
    };
  });
