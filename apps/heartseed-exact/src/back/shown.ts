/**
 * Whether Today offers Move back a stage: on a planted verse the run shows,
 * by the current Heartseed's own footer rule (`offersBack`): at rest (no
 * recital listening, held or done, no Show all taken on it) on a verse of
 * the session's visit, one a tap started (a list's row, a plant of home,
 * Practice this list). A verse the run shows before its plan is made is a
 * recital in the current app, so it offers none. Show all's own step back
 * (`moveBack` of Today's view) is never offered beside it.
 */

import { offersBack } from '@manna/heartseed/garden/bar';
import { Option } from 'effect';

/** The verse the run shows, as much of it as the rule reads: its piece, its item (none before a plan), and whether it is held or done. */
export interface BackShowing {
  readonly piece: { readonly reference: string };
  readonly item: Option.Option<unknown>;
  readonly held: boolean;
  readonly done: boolean;
}

/** The session, as much of it as the rule reads: the verses its visit holds. */
export interface BackSession {
  readonly visit: ReadonlyArray<{ readonly piece: { readonly reference: string } }>;
}

/** The garden read, as much of it as the rule reads: its plants by reference. */
export interface BackGardenRead {
  readonly plants: ReadonlyMap<string, unknown>;
}

/** Whether Today's footer offers Move back on `showing`, in the session `session` over the garden read `garden`, the recital listening or not and Show all taken on it or not. */
export const backOn = (
  showing: Option.Option<BackShowing>,
  session: Option.Option<BackSession>,
  garden: Option.Option<BackGardenRead>,
  listening: boolean,
  shownAll: boolean,
): boolean =>
  Option.exists(showing, (each) => {
    const { reference } = each.piece;
    return (
      Option.exists(garden, (read) => read.plants.has(reference)) &&
      offersBack({
        listening,
        recital: each.held || Option.isNone(each.item),
        done: each.done,
        shownAll,
        visited: Option.exists(session, (view) =>
          view.visit.some((verse) => verse.piece.reference === reference),
        ),
      })
    );
  });
