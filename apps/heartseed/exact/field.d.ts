import type { ReadGarden, Stage } from './garden.d.ts';
import type { Range } from './passages.d.ts';

/** A verse's stage on the field: its plant's, or `not planted` before its first recall. */
export type PlantStage = Stage | 'not planted';

/** A row the field is asked to show: a title, its verses, and its range when the reader chose one. */
export interface FieldPassage {
  readonly title: string;
  readonly verses: ReadonlyArray<string>;
  readonly range?: Range;
}

/** One verse of a row and its stage. */
export interface FieldPlant {
  readonly reference: string;
  readonly stage: PlantStage;
}

/** A row of the field. */
export interface FieldRow {
  readonly title: string;
  readonly plants: ReadonlyArray<FieldPlant>;
  readonly range?: Range;
}

/** The field: its rows, the days sown and the verses at full corn. */
export interface Field {
  readonly rows: ReadonlyArray<FieldRow>;
  readonly sown: number;
  readonly harvest: number;
}

/** The field of a read garden over the rows asked for, then each other verse planted. */
export declare const fieldOf: (garden: ReadGarden, passages: ReadonlyArray<FieldPassage>) => Field;

/** The days sown as the field's heading writes them. */
export declare const sownText: (days: number) => string;

/** The verses at full corn as the field's heading writes them. */
export declare const harvestText: (verses: number) => string;
