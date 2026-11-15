import type { Array as Arr, Option } from 'effect';

import type { ReadGarden } from './garden.d.ts';
import type { FurrowPlant } from './home.d.ts';
import type { SessionView, VisitVerse } from './session-service.d.ts';

/** What a list page's `Practice this list` starts: its open items, its weakest verse, its first to learn, or nothing. */
export type ListStart =
  | { readonly _tag: 'Open'; readonly visit: Arr.NonEmptyReadonlyArray<VisitVerse> }
  | { readonly _tag: 'Weakest'; readonly verse: string; readonly visit: readonly [VisitVerse] }
  | { readonly _tag: 'Learn'; readonly verse: string; readonly visit: readonly [VisitVerse] }
  | { readonly _tag: 'None' };

/** What `Practice this list` starts on `verses`. */
export declare const listStartOf: (
  view: SessionView,
  garden: ReadGarden,
  verses: readonly string[],
) => ListStart;

/** The line under `Practice this list`; none when it starts nothing. */
export declare const listLineOf: (start: ListStart) => Option.Option<string>;

/** A list page's caption over its plants. */
export declare const listCaptionOf: (plants: readonly Pick<FurrowPlant, 'stage'>[]) => string;
