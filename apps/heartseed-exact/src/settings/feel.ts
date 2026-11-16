/**
 * The Sounds and haptics setting: whether Heartseed's ticks are felt, on
 * until the reader turns it off, as the hymnal's row is (owner, q116). The
 * view keeps the choice as Contract's `persist` text, its word (`on` or
 * `off`); the rule below reads that text back, and every tick of the app
 * plays only under its answer (`feelTick`, `features/feel.contract`).
 */
export const feels = ['on', 'off'] as const;

export type Feel = (typeof feels)[number];

/** The choice kept text names: one of the two, else on, as a fresh launch is. */
export const feelOf = (kept: string): Feel => feels.find((feel) => feel === kept) ?? 'on';

/** The setting's answer to the view: whether the ticks are felt. */
export interface FeelAnswer {
  readonly on: boolean;
}

/** Whether the kept text leaves the ticks felt. */
export const feelAnswer = (kept: string): FeelAnswer => ({ on: feelOf(kept) === 'on' });
