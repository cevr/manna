import type { Option } from 'effect';

import type { Grown } from './grown.d.ts';

/** The run's end's timings: its first entrance, the step between two, the latest any waits and how many enter; and the sway's. */
export declare const MOTION: {
  readonly hold: 1200;
  readonly sways: 12;
  readonly endFirst: 300;
  readonly endStep: 160;
  readonly springDuration: 420;
  readonly swayDegrees: 3;
  readonly swayDuration: 1800;
};

/** How one grown plant enters at the run's end: after its delay, if it is among the first that enter, and whether it sways. */
export interface PlantMotion {
  readonly spring: Option.Option<number>;
  readonly sway: boolean;
}

/** Each grown plant's entrance, in the run's order. */
export declare const endMotionOf: (grown: readonly Grown[]) => readonly PlantMotion[];
