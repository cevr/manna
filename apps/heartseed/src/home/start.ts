/**
 * Start here (hq2 (a)): a tap on a verse of the home starts that verse,
 * whole, as a visit of one verse Today shows ahead of the plan. The plan's
 * earliest open item on the verse itself starts exactly as planned, so the
 * new piece stays fresh and a verse said through a tap is done in the plan
 * too; else a planted canon verse starts as a review from its plant's
 * recalls now; else a canon verse not planted starts as the verse learned,
 * fresh, so Today offers Listen on it as on the plan's new piece; else
 * nothing starts. The item and its piece are always the verse's own, never
 * a piece of it kept under a word range (`src/phrase.ts`). Pure: it reads
 * the session's view and the garden read, and nothing is stored.
 */

import { Array as Arr, Option } from 'effect';

import type { ReadGarden } from '../garden';
import { versesOf } from '../kjv';
import { placeOf } from '../lists';
import { sourceWords } from '../matcher/words';
import { isDone, pieceAt, type TextPiece } from '../session';
import type { SessionView, VisitVerse } from '../session/service';

/** The estimate of one recital of `words` words, in seconds, as the plan estimates its items. */
const secondsOf = (words: number) => 10 + words / 2;

/** The plan's earliest item not done on `verse` itself, with its piece, exactly as planned. */
const planned = (view: SessionView, garden: ReadGarden, verse: string): Option.Option<VisitVerse> =>
  Option.flatMap(view.plan, (plan) =>
    Option.flatMap(
      Arr.findFirst(plan.items, (item) => !isDone(garden, item) && item.reference === verse),
      (item) => Option.map(pieceAt(view.pieces, item.reference), (piece) => ({ item, piece })),
    ),
  );

/** The verse's piece among the session's pieces, else its corpus text grouped by its own reference. */
const wholePiece = (view: SessionView, verse: string): Option.Option<TextPiece> =>
  Option.orElse(
    Arr.findFirst(view.pieces, (piece) => piece.reference === verse),
    () =>
      Option.flatMap(placeOf(verse), (place) =>
        Option.map(
          Arr.get(versesOf(place.book, place.chapter), place.verse - 1),
          (text): TextPiece => ({
            reference: verse,
            text,
            words: sourceWords(text).length,
            group: verse,
          }),
        ),
      ),
  );

/** `verse` with its whole piece, as an item of `fresh` and `recalls`, when it is a canon verse. */
const wholeVisit = (
  view: SessionView,
  verse: string,
  fresh: boolean,
  recalls: number,
): Option.Option<VisitVerse> =>
  Option.flatMap(
    Option.filter(Option.some(verse), () => Option.isSome(placeOf(verse))),
    () =>
      Option.map(wholePiece(view, verse), (piece) => ({
        item: { reference: verse, fresh, recalls, seconds: secondsOf(piece.words) },
        piece,
      })),
  );

/** A planted canon verse as a review from its own plant's recalls now; else the verse learned, fresh, with no recalls, whatever pieces of it are planted. */
const ownOf = (view: SessionView, garden: ReadGarden, verse: string): Option.Option<VisitVerse> =>
  Option.match(Option.fromUndefinedOr(garden.plants.get(verse)), {
    onNone: () => wholeVisit(view, verse, true, 0),
    onSome: (plant) => wholeVisit(view, verse, false, plant.recalls.length),
  });

/** What a tap on `verse` starts: none before a plan; the plan's earliest open item on the verse itself; else a review of the planted verse; else the verse learned, when it is a canon verse; else none. */
export const startOf = (
  view: SessionView,
  garden: ReadGarden,
  verse: string,
): Option.Option<VisitVerse> => {
  if (Option.isNone(view.plan)) return Option.none();
  return Option.orElse(planned(view, garden, verse), () => ownOf(view, garden, verse));
};
