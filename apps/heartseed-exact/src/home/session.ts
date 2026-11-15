/**
 * The session's view as home reads it: the wire the session hands the
 * view (`today.session.wire`, `../today/sources.ts`) back in the current
 * app's terms. The plan, the hold and the visit are the wire's items; each
 * item's piece is its verse as the KJV gives it, so every item the session
 * planned has its piece, as it has in the app. Home's rules read a piece
 * only to know that an item has one; no words reach home's answer.
 */

import { placeOf } from '@manna/heartseed/lists';
import { versesOf } from '@manna/heartseed/kjv';
import { sourceWords } from '@manna/heartseed/matcher/words';
import type { Item, TextPiece } from '@manna/heartseed/session';
import type { SessionView, VisitVerse } from '@manna/heartseed/session/service';
import { Array as Arr, Option } from 'effect';

import { minutesOf } from '../settings/choices';
import type { SessionItem, SessionWire } from '../today/sources';

/** The session's view before the session answers: no plan made. */
export const NO_PLAN: SessionWire = {
  minutes: 5,
  planned: false,
  items: [],
  held: Option.getOrNull(Option.none()),
  visit: [],
};

const itemOf = (item: SessionItem): Item => ({
  reference: item.reference,
  fresh: item.fresh,
  recalls: item.recalls,
  seconds: item.seconds,
});

/** The verse of `reference` as a piece of its own; none for a reference that is not a canon verse. */
export const pieceOf = (reference: string): Option.Option<TextPiece> =>
  Option.flatMap(placeOf(reference), (place) =>
    Option.map(Arr.get(versesOf(place.book, place.chapter), place.verse - 1), (text) => ({
      reference,
      text,
      words: sourceWords(text).length,
      group: reference,
    })),
  );

const visitOf = (item: SessionItem): Option.Option<VisitVerse> =>
  Option.map(pieceOf(item.reference), (piece) => ({ item: itemOf(item), piece }));

/** The current app's session view the wire stands for. */
export const sessionOf = (wire: SessionWire): SessionView => {
  const held = Option.map(Option.fromNullishOr(wire.held), itemOf);
  const references = [...new Set([...wire.items, ...wire.visit].map((item) => item.reference))];
  return {
    minutes: minutesOf(String(wire.minutes)),
    plan: Option.map(
      Option.liftPredicate(wire, (each) => each.planned),
      (each) => ({ items: each.items.map(itemOf) }),
    ),
    pieces: references.flatMap((reference) => Option.toArray(pieceOf(reference))),
    held,
    heldPiece: Option.flatMap(held, (item) => pieceOf(item.reference)),
    visit: wire.visit.flatMap((item) => Option.toArray(visitOf(item))),
  };
};
