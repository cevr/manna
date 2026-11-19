import type { Stage } from './garden.d.ts';

/** A stage's two names: the stage line's (`shown`) and the growth line's (`grown`). */
export interface StageName {
  readonly shown: string;
  readonly grown: string;
}

/** The current Today's names of each stage. */
export declare const STAGE_NAMES: Readonly<Record<Stage, StageName>>;
