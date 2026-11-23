/**
 * The first verse, as the current Heartseed names it (`FIRST_VERSE`,
 * `@manna/heartseed/first/verse`): its place, read as core reads a
 * reference, and its reference as the garden keys its plant. Its words are
 * read from the shipped KJV where they are drawn (Today's `/first` route);
 * none is written here.
 */

import { parseBibleQuery } from '@manna/core/bible';
import { FIRST_VERSE } from '@manna/heartseed/first/verse';
import { verseReference } from '@manna/heartseed/passages';
import { Option } from 'effect';

/** The first verse's place: none if the current app's query named no single verse. */
export const firstPlace = (): Option.Option<{ book: number; chapter: number; verse: number }> => {
  const parsed = parseBibleQuery(FIRST_VERSE);
  if (parsed._tag !== 'single') return Option.none();
  return Option.some(parsed.ref);
};

/** The first verse's reference as the garden keys it; empty if it names none. */
export const firstReference = (): string =>
  Option.match(firstPlace(), {
    onNone: () => '',
    onSome: (place) => verseReference(place.book, place.chapter, place.verse),
  });
