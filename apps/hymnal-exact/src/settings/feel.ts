/**
 * The Sounds and haptics setting: whether the controls are felt, on until
 * the reader turns it off, as the current hymnal's `feel`. The view keeps
 * the choice as Contract's `persist` text, its word (`on` or `off`); the
 * rule below reads that text back. `feel.test.ts` holds it to the current
 * hymnal's (`feel` in `apps/hymnal/src/settings.ts`).
 */
export const feels = ['on', 'off'] as const;

export type Feel = (typeof feels)[number];

/** The choice kept text names: one of the two, else on, as a fresh launch is. */
export const feelOf = (kept: string): Feel => feels.find((feel) => feel === kept) ?? 'on';

/** The setting's answer to the view: whether the controls are felt. */
export interface FeelAnswer {
  readonly on: boolean;
}

/** Whether the kept text leaves the controls felt. */
export const feelAnswer = (kept: string): FeelAnswer => ({ on: feelOf(kept) === 'on' });
