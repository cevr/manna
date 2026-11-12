/**
 * The reader's passages and lists: the ranges of the KJV the reader chose
 * to learn, kept in the app's store under one key in the order chosen, and
 * the Handbook lists the reader planted whole, kept by id under another.
 *
 * A passage is a range of whole verses in one chapter of the canon. Held
 * passages and lists count together: a reader may add a passage of at most
 * 20 verses, or plant a list whole, while fewer than 3 are held; the caps
 * are a change's alone, so a stored value past them (a later tier's) reads
 * whole. Both keys are read once, as the service starts, each tried three
 * times as the garden's read is: no key reads as none, and a value that
 * does not decode, or three failed reads, of either key read the whole view
 * as `Unread`, which claims nothing and is never written over. A stored
 * list id this build does not know is neither shown nor counted, and every
 * write keeps it in place. Each add, remove, plant and uproot runs in call
 * order, one at a time under one lock, writes its own key alone, and
 * changes the view only once its write has landed. No change touches a
 * recall: a removed passage's or list's plants stay in the garden. The
 * session plans over the app's own pieces, then each passage's verses,
 * then each list's, then the taught collections' verses (`piecesOf`), each
 * verse one piece, whole, however long.
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

import { HANDBOOK_LISTS, handbookListOf, handbookTitle } from './handbook';
import { versesOf } from './kjv';
import { sourceWords } from './matcher/words';
import type { Collection } from './promises';
import type { TextPiece } from './session';

/** The store key of the passages; its text is a JSON array of ranges, in the order chosen. */
export const PASSAGES_KEY = 'heartseed/passages';

/** The store key of the lists planted; its text is a JSON array of list ids, in the order planted. */
export const LISTS_KEY = 'heartseed/lists';

/** The most passages and lists a reader may hold together when adding either. */
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

/** The passages and lists held, or `Unread` when either stored key could not be read; `lists` holds each stored id this build knows, once, in stored order. */
export type PassagesView =
  | {
      readonly _tag: 'Read';
      readonly passages: ReadonlyArray<Range>;
      readonly lists: ReadonlyArray<string>;
    }
  | { readonly _tag: 'Unread' };

/** How many passages and lists `view` holds together; none when unread. */
export const heldCount = (view: PassagesView): number => {
  if (view._tag === 'Unread') return 0;
  return view.passages.length + view.lists.length;
};

/** An add's answer, in the order an add judges them: `Unread`, `Invalid`, `Full`, then `Added` or `Failed` by its write. */
export type AddAnswer = 'Added' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** A remove's answer, in the order a remove judges them: `Unread`, `Absent`, then `Removed` or `Failed` by its write. */
export type RemoveAnswer = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** A plant's answer, in the order a plant judges them: `Unread`, `Invalid`, `Held`, `Full`, then `Added` or `Failed` by its write. */
export type PlantAnswer = 'Added' | 'Held' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** A verse as a piece, whole: its reference, text and words, and its group. */
const verseAsPiece = (reference: string, text: string, group: string): TextPiece => ({
  reference,
  text,
  words: sourceWords(text).length,
  group,
});

/** A passage's verses as pieces: each its verse's reference and corpus text, whole, its words counted as the matcher counts them, and `group` (the passage's reference by default). */
const piecesIn = (range: Range, group = passageReference(range)): readonly TextPiece[] =>
  versesOf(range.book, range.chapter)
    .slice(range.first - 1, range.last)
    .map((text, index) =>
      verseAsPiece(verseReference(range.book, range.chapter, range.first + index), text, group),
    );

/** The verses of the passages held, in passage order and verse order; none when unread. */
const heldPieces = (view: PassagesView): readonly TextPiece[] => {
  if (view._tag === 'Unread') return [];
  return view.passages.flatMap((range) => piecesIn(range));
};

/** The verses of `collection` as pieces, promise by promise and verse by verse, each grouped by `title`. */
const piecesOfCollection = (collection: Collection, title: string): readonly TextPiece[] =>
  collection.promises.flatMap((range) => piecesIn(range, title));

/** The verses of `collections` as pieces, collection by collection, promise by promise and verse by verse, each grouped by its collection's title. */
export const collectionPieces = (collections: readonly Collection[]): readonly TextPiece[] =>
  collections.flatMap((collection) => piecesOfCollection(collection, collection.title));

/** Each Handbook list's pieces, kept once made: the corpus and the Handbook never change. */
const listPieces = new Map<string, readonly TextPiece[]>();

/** The pieces of the Handbook list `id`, grouped by its title as the reader sees it (`handbookTitle`), made once per id; none for an id the Handbook does not hold. */
const piecesOfList = (id: string): readonly TextPiece[] =>
  Option.getOrElse(Option.fromUndefinedOr(listPieces.get(id)), () => {
    const pieces = Option.match(handbookListOf(id), {
      onNone: () => [],
      onSome: (list) => piecesOfCollection(list, handbookTitle(list)),
    });
    listPieces.set(id, pieces);
    return pieces;
  });

/**
 * The pieces the session plans over: the app's own first, then each held
 * passage's verses, then each held Handbook list's verses in stored order,
 * then `taught`, the taught collections' verses, each reference kept once,
 * at its first place, so a passage or list over one of the app's own
 * verses or a taught one shares its plant. With the view unread, the app's
 * own alone.
 */
export const piecesOf = (
  own: readonly TextPiece[],
  view: PassagesView,
  taught: readonly TextPiece[] = [],
): readonly TextPiece[] => {
  const seen = new Set<string>();
  const after = [...heldPieces(view)];
  if (view._tag === 'Read') after.push(...view.lists.flatMap(piecesOfList), ...taught);
  return [...own, ...after].filter((piece) => {
    if (seen.has(piece.reference)) return false;
    seen.add(piece.reference);
    return true;
  });
};

/** The reader's passages and lists, and each change of them (a new subscriber starts at the current view). */
export class Passages extends Context.Service<
  Passages,
  {
    readonly view: Effect.Effect<PassagesView>;
    readonly changes: Stream.Stream<PassagesView>;
    /** Adds `range` at the end, when the view is read, `range` is choosable and fewer than 3 passages and lists are held; the view changes once the write lands. */
    readonly add: (range: Range) => Effect.Effect<AddAnswer>;
    /** Removes the first passage equal to `range`; the view changes once the write lands. */
    readonly remove: (range: Range) => Effect.Effect<RemoveAnswer>;
    /** Plants the Handbook list `id` whole, stored at the end, when the view is read, the id is known and not held, and fewer than 3 passages and lists are held; the view changes once the write lands. */
    readonly plant: (id: string) => Effect.Effect<PlantAnswer>;
    /** Uproots the held list `id`: every stored entry equal to it goes, every other stays in place; the view changes once the write lands. */
    readonly uproot: (id: string) => Effect.Effect<RemoveAnswer>;
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

/** The passages' stored text: a JSON array of ranges. */
const Stored = Schema.fromJsonString(Schema.Array(StoredRange));

/** The lists' stored text: a JSON array of ids, unknown and repeated ones kept as stored. */
const StoredLists = Schema.fromJsonString(Schema.Array(Schema.String));

/** The ids of the lists this build knows: every Handbook list. */
const KNOWN_LISTS: ReadonlySet<string> = new Set(HANDBOOK_LISTS.map((list) => list.id));

/** The lists held of the `stored` ids: each this build knows, once, in stored order. */
const listsHeld = (stored: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(stored.filter((id) => KNOWN_LISTS.has(id))),
];

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

/** One key's stored value as a launch reads it: one `get`, tried three times in all; no key is `none`, and a value that does not decode or three failed reads are no value at all. */
const readKey = <A>(
  store: KeyValueStore.KeyValueStore,
  key: string,
  schema: Schema.Codec<A, string>,
  none: A,
): Effect.Effect<Option.Option<A>> =>
  store.get(key).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('passages.read.retry').pipe(
        Effect.annotateLogs({ key, method: error.method }),
      ),
    ),
    Effect.retry({ times: READ_ATTEMPTS - 1, schedule: READ_WAITS }),
    Effect.flatMap((raw) =>
      Option.match(Option.fromUndefinedOr(raw), {
        onNone: () => Effect.succeed(none),
        onSome: (text) => Schema.decodeEffect(schema)(text),
      }),
    ),
    Effect.asSome,
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning('passages.read.failed').pipe(
          Effect.annotateLogs({ key, reason: error._tag }),
        ),
        Option.none<A>(),
      ),
    ),
  );

/** Writes `value` under `key`: true once the write lands; a failed write is logged and answers false. */
const writeKey = <A>(
  store: KeyValueStore.KeyValueStore,
  key: string,
  schema: Schema.Codec<A, string>,
  value: A,
) =>
  Schema.encodeEffect(schema)(value).pipe(
    Effect.flatMap((text) => store.set(key, text)),
    Effect.as(true),
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning('passages.write.failed').pipe(
          Effect.annotateLogs({ key, reason: error._tag }),
        ),
        false,
      ),
    ),
  );

/** What the service holds: the view, and the lists' stored ids as stored (unknown and repeated ones kept), none when unread. */
interface Holding {
  readonly view: PassagesView;
  readonly stored: ReadonlyArray<string>;
}

/** The holding of `passages` and the stored ids `stored`. */
const holdingOf = (passages: ReadonlyArray<Range>, stored: ReadonlyArray<string>): Holding => ({
  view: { _tag: 'Read', passages, lists: listsHeld(stored) },
  stored,
});

/** The passages over the app's store. Its build includes the read, so its view is `Read` or `Unread` from the start. */
export const layer: Layer.Layer<Passages, never, KeyValueStore.KeyValueStore> = Layer.effect(
  Passages,
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore;
    const passages = yield* readKey<ReadonlyArray<Range>>(store, PASSAGES_KEY, Stored, []);
    const lists = yield* readKey<ReadonlyArray<string>>(store, LISTS_KEY, StoredLists, []);
    const start = Option.match(Option.all([passages, lists]), {
      onNone: (): Holding => ({ view: UNREAD, stored: [] }),
      onSome: ([read, stored]) => holdingOf(read, stored),
    });
    const held = MutableRef.make(start);
    const views = yield* PubSub.sliding<PassagesView>({ capacity: WINDOW, replay: 1 });
    yield* PubSub.publish(views, start.view);
    const lock = yield* Semaphore.make(1);

    /** Runs `write`, and once it lands makes `after` the holding: `landed` when it did, `failed` when not. */
    const settle = <A>(write: Effect.Effect<boolean>, after: Holding, landed: A, failed: A) =>
      Effect.flatMap(write, (written) => {
        if (!written) return Effect.succeed(failed);
        MutableRef.set(held, after);
        return Effect.as(PubSub.publish(views, after.view), landed);
      });

    const add = (range: Range): Effect.Effect<AddAnswer> =>
      Effect.suspend(() => {
        const { view, stored } = MutableRef.get(held);
        if (view._tag === 'Unread') return Effect.succeed<AddAnswer>('Unread');
        if (!choosable(range)) return Effect.succeed<AddAnswer>('Invalid');
        if (heldCount(view) >= MOST_PASSAGES) return Effect.succeed<AddAnswer>('Full');
        const after = [...view.passages, rangeOf(range)];
        return settle<AddAnswer>(
          writeKey(store, PASSAGES_KEY, Stored, after),
          holdingOf(after, stored),
          'Added',
          'Failed',
        );
      });

    const remove = (range: Range): Effect.Effect<RemoveAnswer> =>
      Effect.suspend(() => {
        const { view, stored } = MutableRef.get(held);
        if (view._tag === 'Unread') return Effect.succeed<RemoveAnswer>('Unread');
        const at = view.passages.findIndex((each) => sameRange(each, range));
        if (at < 0) return Effect.succeed<RemoveAnswer>('Absent');
        const after = view.passages.filter((_, index) => index !== at);
        return settle<RemoveAnswer>(
          writeKey(store, PASSAGES_KEY, Stored, after),
          holdingOf(after, stored),
          'Removed',
          'Failed',
        );
      });

    const plant = (id: string): Effect.Effect<PlantAnswer> =>
      Effect.suspend(() => {
        const { view, stored } = MutableRef.get(held);
        if (view._tag === 'Unread') return Effect.succeed<PlantAnswer>('Unread');
        if (!KNOWN_LISTS.has(id)) return Effect.succeed<PlantAnswer>('Invalid');
        if (view.lists.includes(id)) return Effect.succeed<PlantAnswer>('Held');
        if (heldCount(view) >= MOST_PASSAGES) return Effect.succeed<PlantAnswer>('Full');
        const after = [...stored, id];
        return settle<PlantAnswer>(
          writeKey(store, LISTS_KEY, StoredLists, after),
          holdingOf(view.passages, after),
          'Added',
          'Failed',
        );
      });

    const uproot = (id: string): Effect.Effect<RemoveAnswer> =>
      Effect.suspend(() => {
        const { view, stored } = MutableRef.get(held);
        if (view._tag === 'Unread') return Effect.succeed<RemoveAnswer>('Unread');
        if (!view.lists.includes(id)) return Effect.succeed<RemoveAnswer>('Absent');
        const after = stored.filter((each) => each !== id);
        return settle<RemoveAnswer>(
          writeKey(store, LISTS_KEY, StoredLists, after),
          holdingOf(view.passages, after),
          'Removed',
          'Failed',
        );
      });

    const one = Semaphore.withPermits(lock, 1);

    return Passages.of({
      view: Effect.sync(() => MutableRef.get(held).view),
      changes: Stream.fromPubSub(views),
      add: (range) => one(add(range)).pipe(Effect.withSpan('Passages.add')),
      remove: (range) => one(remove(range)).pipe(Effect.withSpan('Passages.remove')),
      plant: (id) => one(plant(id)).pipe(Effect.withSpan('Passages.plant')),
      uproot: (id) => one(uproot(id)).pipe(Effect.withSpan('Passages.uproot')),
    });
  }),
);
