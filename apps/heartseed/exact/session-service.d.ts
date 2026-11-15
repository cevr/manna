import type { Context, Effect, Layer, Option, Stream } from 'effect';
import type { KeyValueStore } from 'effect/persistence/KeyValueStore';

import type { Dictation } from './dictation.d.ts';
import type { Garden } from './garden.d.ts';
import type { Passages, Range } from './passages.d.ts';
import type { Item, Minutes, Plan, TextPiece } from './session.d.ts';

/** The key the session keeps its minutes under. */
export declare const MINUTES_KEY: 'heartseed/session/minutes';

/** One verse a visit shows ahead of the plan, and its piece. */
export interface VisitVerse {
  readonly item: Item;
  readonly piece: TextPiece;
}

/** A launch's session: the minutes, the plan once made, its pieces, the item held with its piece, and the visit. */
export interface SessionView {
  readonly minutes: Minutes;
  readonly plan: Option.Option<Plan>;
  readonly pieces: readonly TextPiece[];
  readonly held: Option.Option<Item>;
  readonly heldPiece: Option.Option<TextPiece>;
  readonly visit: readonly VisitVerse[];
}

/** A promise collection a session may teach: its id, title and promises. */
export interface Collection {
  readonly id: string;
  readonly title: string;
  readonly promises: readonly Range[];
}

declare const SessionTag: Context.ServiceClass<
  Session,
  'heartseed/session/Session',
  {
    readonly begin: Effect.Effect<void>;
    readonly choose: (minutes: Minutes) => Effect.Effect<void>;
    readonly hold: (item: Item) => Effect.Effect<void>;
    readonly next: Effect.Effect<void>;
    readonly visit: (
      collection: Pick<Collection, 'id' | 'title'>,
      promise: Range,
    ) => Effect.Effect<void>;
    readonly start: (verse: string) => Effect.Effect<void>;
    readonly startList: (verses: readonly string[]) => Effect.Effect<void>;
    readonly wake: Effect.Effect<void>;
    readonly remake: Effect.Effect<void>;
    readonly view: Effect.Effect<SessionView>;
    readonly changes: Stream.Stream<SessionView>;
  }
>;

/** The session Today runs: the plan, the hold and the visit of one launch. */
export declare class Session extends SessionTag {}

/** The session over the app's own pieces and the collections it teaches. */
export declare const layer: (
  own: readonly TextPiece[],
  collections?: readonly Collection[],
) => Layer.Layer<Session, never, KeyValueStore | Garden | Dictation | Passages>;
