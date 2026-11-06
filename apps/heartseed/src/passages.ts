/**
 * The reader's passages: the ranges of the KJV the reader chose to learn,
 * kept in the app's store under one key, in the order chosen.
 *
 * A passage is a range of whole verses in one chapter of the canon. A
 * reader may add one of at most 20 verses while fewer than 3 are held; the
 * caps are an add's alone, so a stored list past them (a later tier's)
 * reads whole. The list is read once, as the service starts, tried three
 * times as the garden's read is: no key reads as no passages, and a value
 * that does not decode, or three failed reads, read as `Unread`, which
 * claims no list and is never written over. Each add and each remove runs
 * in call order, one at a time, and changes the view only once its write
 * has landed. A remove never touches a recall: a removed passage's plants
 * stay in the garden.
 */

import { formatBibleReference, Reference } from '@manna/core/bible';
import {
  Context,
  Effect,
  Layer,
  MutableRef,
  Option,
  PubSub,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Semaphore from 'effect/Semaphore';

import { versesOf } from './kjv';

/** The store key of the passages; its text is a JSON array of ranges, in the order chosen. */
export const PASSAGES_KEY = 'heartseed/passages';

/** The most passages a reader may hold when adding one. */
export const MOST_PASSAGES = 3;

/** The most verses a passage may span when it is added. */
export const MOST_VERSES = 20;

/** A range of verses in one chapter: book and chapter as the canon numbers them, and the first and last verse. */
export interface Range {
  readonly book: number;
  readonly chapter: number;
  readonly first: number;
  readonly last: number;
}

/** Whether `range` lies in one chapter of the canon: whole numbers, with 1 ≤ first ≤ last ≤ the chapter's verse count. */
export const inChapter = (range: Range): boolean =>
  [range.book, range.chapter, range.first, range.last].every(Number.isInteger) &&
  range.first >= 1 &&
  range.first <= range.last &&
  range.last <= versesOf(range.book, range.chapter).length;

/** Whether a reader may add `range`: in one chapter, of at most 20 verses (a whole chapter of 20 or fewer counts). */
export const choosable = (range: Range): boolean =>
  inChapter(range) && range.last - range.first + 1 <= MOST_VERSES;

/** A verse's reference as the canon writes it (`Psalms 23:1`). */
export const verseReference = (book: number, chapter: number, verse: number): string =>
  formatBibleReference(Reference.verse(book, chapter, verse));

/** A passage's reference as the canon writes it: `John 15:1-5`, or its one verse's (`John 11:35`). */
export const passageReference = (range: Range): string => {
  if (range.first === range.last) return verseReference(range.book, range.chapter, range.first);
  return formatBibleReference(
    Reference.range(
      Reference.verse(range.book, range.chapter, range.first),
      Reference.verse(range.book, range.chapter, range.last),
    ),
  );
};

/** The passages held, or `Unread` when the stored list could not be read. */
export type PassagesView =
  | { readonly _tag: 'Read'; readonly passages: ReadonlyArray<Range> }
  | { readonly _tag: 'Unread' };

/** An add's answer, in the order an add judges them: `Unread`, `Invalid`, `Full`, then `Added` or `Failed` by its write. */
export type AddAnswer = 'Added' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** A remove's answer, in the order a remove judges them: `Unread`, `Absent`, then `Removed` or `Failed` by its write. */
export type RemoveAnswer = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** The reader's passages, and each change of them (a new subscriber starts at the current view). */
export class Passages extends Context.Service<
  Passages,
  {
    readonly view: Effect.Effect<PassagesView>;
    readonly changes: Stream.Stream<PassagesView>;
    /** Adds `range` at the end, when the passages are read, `range` is choosable and fewer than 3 are held; the view changes once the write lands. */
    readonly add: (range: Range) => Effect.Effect<AddAnswer>;
    /** Removes the first passage equal to `range`; the view changes once the write lands. */
    readonly remove: (range: Range) => Effect.Effect<RemoveAnswer>;
  }
>()('heartseed/passages/Passages') {}

/** One stored range: four whole numbers, in one chapter of the canon, of any length. */
const StoredRange = Schema.Struct({
  book: Schema.Int,
  chapter: Schema.Int,
  first: Schema.Int,
  last: Schema.Int,
}).check(
  Schema.makeFilter<Range>((range) => {
    if (inChapter(range)) return true;
    return 'a range outside its chapter';
  }),
);

/** The stored text: a JSON array of ranges. */
const Stored = Schema.fromJsonString(Schema.Array(StoredRange));

/** How many attempts in all the read makes, as the garden's. */
const READ_ATTEMPTS = 3;

/** The waits between attempts: 10 ms, then 20 ms. */
const READ_WAITS = Schedule.exponential('10 millis');

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out. */
const WINDOW = 16;

const UNREAD: PassagesView = { _tag: 'Unread' };

/** The four fields of `range` alone, so nothing else is stored. */
const rangeOf = (range: Range): Range => ({
  book: range.book,
  chapter: range.chapter,
  first: range.first,
  last: range.last,
});

const sameRange = (a: Range, b: Range) =>
  a.book === b.book && a.chapter === b.chapter && a.first === b.first && a.last === b.last;

/** The view a launch starts at: one `get` of the key, tried three times in all; no key is no passages, and a value that does not decode or three failed reads are `Unread`. */
const readPassages = (store: KeyValueStore.KeyValueStore) =>
  store.get(PASSAGES_KEY).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('passages.read.retry').pipe(
        Effect.annotateLogs({ key: PASSAGES_KEY, method: error.method }),
      ),
    ),
    Effect.retry({ times: READ_ATTEMPTS - 1, schedule: READ_WAITS }),
    Effect.flatMap((raw) =>
      Option.match(Option.fromUndefinedOr(raw), {
        onNone: () => Effect.succeed<ReadonlyArray<Range>>([]),
        onSome: (text) => Schema.decodeEffect(Stored)(text),
      }),
    ),
    Effect.map((passages): PassagesView => ({ _tag: 'Read', passages })),
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning('passages.read.failed').pipe(
          Effect.annotateLogs({ key: PASSAGES_KEY, reason: error._tag }),
        ),
        UNREAD,
      ),
    ),
  );

/** Writes `passages` as the stored list: true once the write lands; a failed write is logged and answers false. */
const writePassages = (store: KeyValueStore.KeyValueStore, passages: ReadonlyArray<Range>) =>
  Schema.encodeEffect(Stored)(passages).pipe(
    Effect.flatMap((text) => store.set(PASSAGES_KEY, text)),
    Effect.as(true),
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning('passages.write.failed').pipe(
          Effect.annotateLogs({ key: PASSAGES_KEY, passages: passages.length, reason: error._tag }),
        ),
        false,
      ),
    ),
  );

/** The passages over the app's store. Its build includes the read, so its view is `Read` or `Unread` from the start. */
export const layer: Layer.Layer<Passages, never, KeyValueStore.KeyValueStore> = Layer.effect(
  Passages,
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore;
    const held = MutableRef.make(yield* readPassages(store));
    const views = yield* PubSub.sliding<PassagesView>({ capacity: WINDOW, replay: 1 });
    yield* PubSub.publish(views, MutableRef.get(held));
    const lock = yield* Semaphore.make(1);

    /** Writes `after`, and once it lands makes it the view: `landed` when it did, `failed` when not. */
    const settle = <A>(after: ReadonlyArray<Range>, landed: A, failed: A) =>
      Effect.flatMap(writePassages(store, after), (written) => {
        if (!written) return Effect.succeed(failed);
        const view: PassagesView = { _tag: 'Read', passages: after };
        MutableRef.set(held, view);
        return Effect.as(PubSub.publish(views, view), landed);
      });

    const add = (range: Range): Effect.Effect<AddAnswer> =>
      Effect.suspend(() => {
        const now = MutableRef.get(held);
        if (now._tag === 'Unread') return Effect.succeed<AddAnswer>('Unread');
        if (!choosable(range)) return Effect.succeed<AddAnswer>('Invalid');
        if (now.passages.length >= MOST_PASSAGES) return Effect.succeed<AddAnswer>('Full');
        return settle<AddAnswer>([...now.passages, rangeOf(range)], 'Added', 'Failed');
      });

    const remove = (range: Range): Effect.Effect<RemoveAnswer> =>
      Effect.suspend(() => {
        const now = MutableRef.get(held);
        if (now._tag === 'Unread') return Effect.succeed<RemoveAnswer>('Unread');
        const at = now.passages.findIndex((each) => sameRange(each, range));
        if (at < 0) return Effect.succeed<RemoveAnswer>('Absent');
        return settle<RemoveAnswer>(
          now.passages.filter((_, index) => index !== at),
          'Removed',
          'Failed',
        );
      });

    return Passages.of({
      view: Effect.sync(() => MutableRef.get(held)),
      changes: Stream.fromPubSub(views),
      add: (range) =>
        Semaphore.withPermits(lock, 1)(add(range)).pipe(Effect.withSpan('Passages.add')),
      remove: (range) =>
        Semaphore.withPermits(lock, 1)(remove(range)).pipe(Effect.withSpan('Passages.remove')),
    });
  }),
);
