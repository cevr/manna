import type { Stage } from './garden.d.ts';

/** A verse's stage on the field: its plant's, or `not planted` before its first recall. */
export type PlantStage = Stage | 'not planted';
