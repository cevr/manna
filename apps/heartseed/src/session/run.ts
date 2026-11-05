/**
 * What Today shows of the session's run, a pure function of the session's
 * view and the garden read. With a plan made, Today shows one item: the
 * held one if any, else the plan's first item not done; none is the done
 * state. With no plan (an unread garden, or a read one before its first
 * plan is made), it shows the first piece, as a garden with no run does.
 */

import { Array as Arr, Option } from 'effect';

import type { ReadGarden } from '../garden';
import { isDone, type Item, type TextPiece } from '../session';
import type { SessionView } from './service';

/** Today's run as shown: no plan yet (the first piece, if any), an item of the plan with its piece, or the done state. */
export type Shown =
  | { readonly _tag: 'Unplanned'; readonly piece: Option.Option<TextPiece> }
  | {
      readonly _tag: 'Item';
      readonly item: Item;
      readonly piece: TextPiece;
      /** The item is held: its recital, or its result, shows. */
      readonly held: boolean;
      /** Its plant holds more recalls than when its plan was made. */
      readonly done: boolean;
    }
  | { readonly _tag: 'Done' };

/** The item Today shows over `view` and `garden`, and its piece. */
export const shownOf = (view: SessionView, garden: Option.Option<ReadGarden>): Shown => {
  const run = Option.all({ plan: view.plan, garden });
  if (Option.isNone(run)) return { _tag: 'Unplanned', piece: Arr.head(view.pieces) };
  const { plan, garden: read } = run.value;
  const item = Option.orElse(view.held, () =>
    Arr.findFirst(plan.items, (each) => !isDone(read, each)),
  );
  const shown = Option.flatMap(item, (each) =>
    Option.map(
      Arr.findFirst(view.pieces, (piece) => piece.reference === each.reference),
      (piece) => ({ item: each, piece }),
    ),
  );
  return Option.match(shown, {
    onNone: (): Shown => ({ _tag: 'Done' }),
    onSome: ({ item: each, piece }): Shown => ({
      _tag: 'Item',
      item: each,
      piece,
      held: Option.isSome(view.held),
      done: isDone(read, each),
    }),
  });
};
