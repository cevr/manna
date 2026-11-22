/** One cycle of the welcome's growing seed, in milliseconds; see `src/first/growth.ts`. */
export declare const GROWTH: {
  readonly hold: number;
  readonly fade: number;
  readonly rest: number;
  readonly cycle: number;
};

/** The four stages' opacities, in the order seed, blade, ear, full corn. */
export type GrowthFrame = readonly [seed: number, blade: number, ear: number, corn: number];

/** The frame that stands still: full corn alone. */
export declare const GROWTH_STILL: GrowthFrame;

/** The cycle's points: each instant, and each stage's opacity there. */
export declare const GROWTH_STEPS: { at: number[]; opacity: number[][] };

/** The clock the loop starts at. */
export declare const GROWTH_START: number;

/** Each stage's opacity `ms` after the welcome showed. */
export declare const growthAt: (ms: number) => GrowthFrame;
