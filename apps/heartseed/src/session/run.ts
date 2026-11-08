/**
 * What Today shows of the session's run, a pure function of the session's
 * view and the garden read. With a plan made, Today shows one item: the
 * held one if any, with the piece the hold took (so a held verse stays
 * shown, its text with it, after a making took it out of the pieces), else
 * the visit's first item not done, with its own piece, else the plan's
 * first item not done; none is the done state. With no plan (an unread
 * garden, or a read one before its first plan is made), it shows the first
 * piece, as a garden with no run does.
 */

import { Array as Arr, Option } from 'effect';

import type { ReadGarden } from '../garden';
import { isDone, pieceAt, type Item, type TextPiece } from '../session';
import type { SessionView } from './service';

/** Today's run as shown: no plan yet (the first piece, if any), an item of the plan or the visit with its piece, or the done state. */
export type Shown =
  | { readonly _tag: 'Unplanned'; readonly piece: Option.Option<TextPiece> }
  | {
      readonly _tag: 'Item';
      readonly item: Item;
      readonly piece: TextPiece;
      /** The item is held: its recital, or its result, shows. */
      readonly held: boolean;
      /** Its plant holds more recalls than its item's baseline: the plan's making, or the visit's tap. */
      readonly done: boolean;
    }
  | { readonly _tag: 'Done' };

/** The item Today shows over `view` and `garden`, and its piece: the held item with its held piece, never `Done`; else the visit's first item not done; else the plan's. */
export const shownOf = (view: SessionView, garden: Option.Option<ReadGarden>): Shown => {
  const run = Option.all({ plan: view.plan, garden });
  if (Option.isNone(run)) return { _tag: 'Unplanned', piece: Arr.head(view.pieces) };
  const { plan, garden: read } = run.value;
  const item = Option.orElse(view.held, () =>
    Option.orElse(
      Option.map(
        Arr.findFirst(view.visit, (each) => !isDone(read, each.item)),
        (each) => each.item,
      ),
      () => Arr.findFirst(plan.items, (each) => !isDone(read, each)),
    ),
  );
  const shown = Option.flatMap(item, (each) =>
    Option.map(
      Option.orElse(
        Option.filter(view.heldPiece, (piece) => piece.reference === each.reference),
        () =>
          Option.orElse(
            Option.map(
              Arr.findFirst(view.visit, (verse) => verse.piece.reference === each.reference),
              (verse) => verse.piece,
            ),
            () => pieceAt(view.pieces, each.reference),
          ),
      ),
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
