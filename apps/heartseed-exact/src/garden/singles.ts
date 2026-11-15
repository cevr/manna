/**
 * Single verses, until the current app's `Passages` holds them (hsminlist,
 * owner 2026-11-14: "minimum three"): a verse planted alone is no list but
 * a single verse, kept under `heartseed/singles` as a JSON array of
 * one-verse ranges in the order planted, each once, at most 20 of them, and
 * never counted among the three lists. A range of fewer than three verses
 * makes no list (`Short`). This stand-in follows hsminlist's keys and rules
 * so its bytes are that build's; the merge round after hsminlist lands
 * replaces it with `Passages.join` and `Passages.part`.
 *
 * The key is read once per call, tried three times as the current app's
 * reads are: no key is none, and a value that does not decode, or three
 * failed reads, read as unread, which claims nothing and is never written
 * over. A change writes the key alone and answers by its write.
 */

import { choosable, inChapter, passageReference, type Range } from '@manna/heartseed/passages';
import { Effect, Option, Schedule, Schema } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

/** The key the single verses are kept under. */
export const SINGLES_KEY = 'heartseed/singles';

/** The most single verses a reader may hold. */
export const MOST_SINGLES = 20;

/** The fewest verses a list the reader makes may hold. */
export const LEAST_VERSES = 3;

/** The line a range of fewer than three verses meets where it would make a list. */
export const SHORT_LINE = `A list holds at least ${LEAST_VERSES} verses.`;

/** The line while the single verses are at their limit. */
export const SINGLES_LIMIT_LINE = `${MOST_SINGLES} single verses, the most for now. Remove one to add another.`;

/** What a join answers: `Held` when every verse is single already, `Full` past 20. */
export type JoinAnswer = 'Added' | 'Held' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** What a part answers. */
export type PartAnswer = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** A whole number, as each of a verse's numbers is. */
const WHOLE = Schema.Int;

/** One kept single verse: a range of one verse in one chapter, its four numbers whole. */
const Single = Schema.Struct({ book: WHOLE, chapter: WHOLE, first: WHOLE, last: WHOLE }).check(
  Schema.makeFilter((verse: Range) => {
    if (inChapter(verse) && verse.first === verse.last) return true;
    return 'no one verse of the canon';
  }),
);

const Stored = Schema.fromJsonString(Schema.Array(Single));

/** How many verses `range` spans. */
export const verseCount = (range: Range) => range.last - range.first + 1;

/** Each verse of `range` as a one-verse range, in order, holding its four numbers alone. */
const versesOf = (range: Range): readonly Range[] =>
  Array.from({ length: verseCount(range) }, (_, index) => ({
    ...range,
    first: range.first + index,
    last: range.first + index,
  }));

/** `held`, then each of `more` not held already (by its reference), in order. */
const joined = (held: readonly Range[], more: readonly Range[]) =>
  more.reduce<readonly Range[]>((all, verse) => {
    if (all.some((each) => passageReference(each) === passageReference(verse))) return all;
    return [...all, verse];
  }, held);

/** The single verses kept, each once in the order planted; none when the key could not be read. */
export const readSingles = Effect.flatMap(KeyValueStore.KeyValueStore, (kept) =>
  kept.get(SINGLES_KEY).pipe(
    Effect.retry({ times: 2, schedule: Schedule.exponential('10 millis') }),
    Effect.flatMap((text) =>
      Option.match(Option.fromUndefinedOr(text), {
        onNone: () => Effect.succeed<readonly Range[]>([]),
        onSome: Schema.decodeEffect(Stored),
      }),
    ),
    Effect.map((ranges) => Option.some(joined([], ranges))),
    Effect.catch((cause) =>
      Effect.as(
        Effect.logWarning('singles.read.failed').pipe(Effect.annotateLogs({ reason: cause._tag })),
        Option.none<readonly Range[]>(),
      ),
    ),
  ),
);

/** Writes `after` as the single verses: true once the write lands. */
const writeSingles = (after: readonly Range[]) =>
  Effect.flatMap(KeyValueStore.KeyValueStore, (kept) =>
    Schema.encodeEffect(Stored)(after).pipe(
      Effect.flatMap((text) => kept.set(SINGLES_KEY, text)),
      Effect.as(true),
      Effect.catch((cause) =>
        Effect.as(
          Effect.logWarning('singles.write.failed').pipe(
            Effect.annotateLogs({ reason: cause._tag }),
          ),
          false,
        ),
      ),
    ),
  );

/** Each verse of `range` not single already joins the single verses, at the end, while they stay at 20 or fewer. */
export const joinSingles = (held: Option.Option<readonly Range[]>, range: Range) =>
  Option.match(held, {
    onNone: () => Effect.succeed<JoinAnswer>('Unread'),
    onSome: (singles) => {
      if (!choosable(range)) return Effect.succeed<JoinAnswer>('Invalid');
      const after = joined(singles, versesOf(range));
      if (after.length === singles.length) return Effect.succeed<JoinAnswer>('Held');
      if (after.length > MOST_SINGLES) return Effect.succeed<JoinAnswer>('Full');
      return Effect.map(writeSingles(after), (landed): JoinAnswer => {
        if (landed) return 'Added';
        return 'Failed';
      });
    },
  });

/** The single verse `range` leaves the single verses. */
export const partSingle = (held: Option.Option<readonly Range[]>, range: Range) =>
  Option.match(held, {
    onNone: () => Effect.succeed<PartAnswer>('Unread'),
    onSome: (singles) => {
      if (!singles.some((each) => passageReference(each) === passageReference(range)))
        return Effect.succeed<PartAnswer>('Absent');
      return Effect.map(
        writeSingles(singles.filter((each) => passageReference(each) !== passageReference(range))),
        (landed): PartAnswer => {
          if (landed) return 'Removed';
          return 'Failed';
        },
      );
    },
  });
