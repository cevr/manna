import type { Option } from 'effect';

import type { FieldPassage, PlantStage } from './field.d.ts';
import type { ReadGarden } from './garden.d.ts';
import type { List, ListSource } from './lists.d.ts';
import type { Range } from './passages.d.ts';
import type { Plan } from './session.d.ts';

/** The names of the current home's icon set; the port draws none of them. */
export type HomeIcon =
  | 'add'
  | 'blade'
  | 'bow'
  | 'corn'
  | 'ear'
  | 'harp'
  | 'lamp'
  | 'scroll'
  | 'seed'
  | 'sun'
  | 'moon'
  | 'gear';

/** What a list is to the reader: the app's own, held, or taught. */
export type FurrowKind = 'own' | 'held' | 'taught';

/** A plant of a row: its verse, stage, whether the plan holds it open, and its spoken name. */
export interface FurrowPlant {
  readonly reference: string;
  readonly stage: PlantStage;
  readonly ready: boolean;
  readonly label: string;
}

/** One row of home: a list, its caption and its plants in order. */
export interface Furrow {
  readonly id: string;
  readonly title: string;
  readonly range?: Range;
  readonly source: ListSource;
  readonly kind: FurrowKind;
  readonly icon: HomeIcon;
  readonly caption: string;
  readonly plants: readonly FurrowPlant[];
}

/** A single verse on home, with the range its Remove takes out when the reader planted it alone. */
export interface SinglePlant extends FurrowPlant {
  readonly removal: Option.Option<Range>;
}

/** The greeting's words and its icon. */
export interface Greeting {
  readonly words: 'Good morning' | 'Good afternoon' | 'Good evening';
  readonly icon: 'sun' | 'moon';
}

/** A row's caption over its plants. */
export declare const captionOf: (plants: readonly Pick<FurrowPlant, 'stage' | 'ready'>[]) => string;

/** One row per list over the garden read, each plant ready when its verse is in `ready`. */
export declare const furrowsOf: (
  garden: ReadGarden,
  lists: readonly List[],
  ready: ReadonlySet<string>,
) => readonly Furrow[];

/** The single verses home shows under the lists: `singles` in order, then every other verse held that no list names. */
export declare const singlesOf: (
  garden: ReadGarden,
  lists: readonly List[],
  singles: readonly string[],
  held: readonly Range[],
  ready: ReadonlySet<string>,
) => readonly SinglePlant[];

/** The rows the field shows: the lists, then the single verses as one row. */
export declare const fieldPassagesWith: (
  lists: readonly List[],
  singles: readonly string[],
) => readonly FieldPassage[];

/** The verse a plant's reference belongs to. */
export declare const verseOf: (reference: string) => string;

/** The verses the plan holds open; none before a plan. */
export declare const readyOf: (
  plan: Option.Option<Plan>,
  garden: ReadGarden,
) => ReadonlySet<string>;

/** The local minute of the day at `at`, `offset` minutes east of UTC. */
export declare const minuteOf: (at: number, offset: number) => number;

/** The greeting at the local minute `minute`. */
export declare const greetingOf: (minute: number) => Greeting;
