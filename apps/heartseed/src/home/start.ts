/**
 * Start here (hq2 (a)): a tap on a verse of the home starts that verse, as
 * a visit of one verse Today shows ahead of the plan. The plan's earliest
 * open item on the verse (a phrase folded into its verse) starts exactly as
 * planned, so a phrase starts its phrase and the new piece stays fresh;
 * else a planted canon verse starts as a review from its plant's recalls
 * now; else nothing starts, as for a verse not planted yet. Pure: it reads
 * the session's view and the garden read, and nothing is stored.
 */

import { Array as Arr, Option } from 'effect';

import type { ReadGarden } from '../garden';
import { verseOf } from '../home';
import { versesOf } from '../kjv';
import { placeOf } from '../lists';
import { sourceWords } from '../matcher/words';
import { isDone, pieceAt, type TextPiece } from '../session';
import type { SessionView, VisitVerse } from '../session/service';

/** The estimate of one recital of `words` words, in seconds, as the plan estimates its items. */
const secondsOf = (words: number) => 10 + words / 2;

/** The plan's earliest item not done on `verse`, with its piece, exactly as planned. */
const planned = (view: SessionView, garden: ReadGarden, verse: string): Option.Option<VisitVerse> =>
  Option.flatMap(view.plan, (plan) =>
    Option.flatMap(
      Arr.findFirst(
        plan.items,
        (item) => !isDone(garden, item) && verseOf(item.reference) === verse,
      ),
      (item) => Option.map(pieceAt(view.pieces, item.reference), (piece) => ({ item, piece })),
    ),
  );

/** The verse's piece among the session's pieces, else its corpus text grouped by its own reference, with no phrases. */
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

/** A review of a planted canon verse from its plant's recalls now. */
const review = (view: SessionView, garden: ReadGarden, verse: string): Option.Option<VisitVerse> =>
  Option.flatMap(
    Option.filter(Option.fromUndefinedOr(garden.plants.get(verse)), () =>
      Option.isSome(placeOf(verse)),
    ),
    (plant) =>
      Option.map(wholePiece(view, verse), (piece) => ({
        item: {
          reference: verse,
          fresh: false,
          recalls: plant.recalls.length,
          seconds: secondsOf(piece.words),
        },
        piece,
      })),
  );

/** What a tap on `verse` starts: none before a plan; the plan's earliest open item on it; else a review of the planted verse; else none. */
export const startOf = (
  view: SessionView,
  garden: ReadGarden,
  verse: string,
): Option.Option<VisitVerse> => {
  if (Option.isNone(view.plan)) return Option.none();
  return Option.orElse(planned(view, garden, verse), () => review(view, garden, verse));
};
