import type { Option } from 'effect';

import type { ReadGarden } from './garden.d.ts';
import type { SessionView } from './session-service.d.ts';
import type { Item, TextPiece } from './session.d.ts';

/** Today's run as shown: no plan yet, an item with its piece, or the done state. */
export type Shown =
  | { readonly _tag: 'Unplanned'; readonly piece: Option.Option<TextPiece> }
  | {
      readonly _tag: 'Item';
      readonly item: Item;
      readonly piece: TextPiece;
      readonly held: boolean;
      readonly done: boolean;
    }
  | { readonly _tag: 'Done' };

/** The item Today shows over the session's view and the garden read. */
export declare const shownOf: (view: SessionView, garden: Option.Option<ReadGarden>) => Shown;
