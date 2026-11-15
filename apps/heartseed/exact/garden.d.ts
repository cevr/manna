import type { Array as Arr, Context, Effect, Layer, Option, Stream } from 'effect';
import type { KeyValueStore } from 'effect/persistence/KeyValueStore';

import type { Card } from './fsrs.d.ts';
import type { Grade, Help, Recall, Recalls } from './sayit.d.ts';

/** A plant's four stages, seed first (Mark 4:28). */
export type Stage = 'seed' | 'blade' | 'ear' | 'full corn';

/** A verse's recalls in time order, its steps back, and the card they fold to. */
export interface Plant {
  readonly reference: string;
  readonly recalls: Arr.NonEmptyReadonlyArray<Recall>;
  readonly backs: readonly number[];
  readonly card: Card;
}

/** A recital that grew its verse, from one stage to the next. */
export interface Growth {
  readonly reference: string;
  readonly startedAt: number;
  readonly from: Stage;
  readonly to: Stage;
}

/** A read of the store that completed: every plant by reference. */
export interface ReadGarden {
  readonly _tag: 'Read';
  readonly plants: ReadonlyMap<string, Plant>;
}

/** What the garden knows: a completed read, or `Unread` when every attempt failed. */
export type GardenView = ReadGarden | { readonly _tag: 'Unread' };

/** A step back asked for: the verse, the stage it was seen at, and its instant (the clock's when absent). */
export interface BackAsk {
  readonly reference: string;
  readonly from: Stage;
  readonly at?: number;
}

/** What a step back answers. */
export type BackAnswer = 'Moved' | 'Failed';

/** The stage a verse's recalls and steps back give it. */
export declare const stageOf: (plant: Plant) => Stage;

/** The stage one below `stage`; none for a seed. */
export declare const backOf: (stage: Stage) => Option.Option<Stage>;

/** The best grade a try after Show all may take on a verse at `stage`. */
export declare const shownAllCap: (stage: Stage) => Grade;

/** `view` with Show all's step back of `help` laid over it. */
export declare const withHelp: (view: ReadGarden, help: Help) => ReadGarden;

declare const ChimeTag: Context.ServiceClass<
  Chime,
  'heartseed/garden/Chime',
  { readonly grow: (growth: Growth) => Effect.Effect<void> }
>;

/** The growth sound the garden plays. */
export declare class Chime extends ChimeTag {}

declare const GardenTag: Context.ServiceClass<
  Garden,
  'heartseed/garden/Garden',
  {
    readonly view: Effect.Effect<GardenView>;
    readonly settled: Effect.Effect<GardenView>;
    readonly changes: Stream.Stream<GardenView>;
  }
>;

/** The garden's view and its changes. */
export declare class Garden extends GardenTag {}

declare const BacksTag: Context.ServiceClass<
  Backs,
  'heartseed/garden/Backs',
  { readonly back: (ask: BackAsk) => Effect.Effect<BackAnswer> }
>;

/** Moving a verse back a stage. */
export declare class Backs extends BacksTag {}

/** The garden over a store, read at its build: the garden, its recalls and its steps back. */
export declare const layer: Layer.Layer<Garden | Recalls | Backs, never, KeyValueStore | Chime>;
