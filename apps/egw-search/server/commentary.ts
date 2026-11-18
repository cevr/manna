/**
 * The commentary pack's rule: link rows in, the pack and its version out.
 *
 * Pure, so a generated property can hold it over any rows. The bytes depend
 * on the rows' content alone, never on their order, so an unchanged corpus
 * gives the same version and a phone pays one `304` for it.
 */

import { Array as Arr, Option, Order, Schema as S } from 'effect';

import { COMMENTARY_FORMAT, type CommentaryPack, CommentaryPackSchema } from './api.js';

/** The Bible Commentary's volumes, the only books the pack holds. */
export const COMMENTARY_BOOKS: readonly string[] = [
  '1BC',
  '2BC',
  '3BC',
  '4BC',
  '5BC',
  '6BC',
  '7BC',
];

const BIBLE_BOOKS = 66;

/** One link from a paragraph to a Bible verse, with the paragraph it names.
 *  `bibleVerse` is none for a link to a whole chapter. */
export interface CommentaryLink {
  readonly bookCode: string;
  readonly puborder: number;
  readonly reference: string;
  readonly text: string;
  readonly bibleBook: number;
  readonly bibleChapter: number;
  readonly bibleVerse: Option.Option<number>;
}

/** The pack as served: its version and its JSON body. */
export interface BuiltPack {
  readonly version: string;
  readonly body: string;
}

/** FNV-1a's 32-bit hash of `text`'s UTF-16 code units, unsigned: the same
 *  function as Heartseed's `sumOf` (`apps/heartseed-exact/src/text/sum.ts`),
 *  held to it by the shared vector in both sides' tests. */
export const sumOf = (text: string): number => {
  let hash = 0x81_1c_9d_c5;
  for (let at = 0; at < text.length; at++)
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01_00_01_93);
  return hash >>> 0;
};

/** One chapter of the verse map as text: its key, then each verse as
 *  `<verse>:<indexes joined by ,>`, space-separated. */
const chapterText = ([key, verses]: readonly [string, CommentaryPack['verses'][string]]): string =>
  [key, ...verses.map(([verse, indexes]) => `${String(verse)}:${indexes.join(',')}`)].join(' ');

/** The texts a pack's sum covers, in order: every note's reference and text,
 *  then each chapter of the verse map as `chapterText` writes it, in the
 *  map's order. The same list as Heartseed's `packTexts`
 *  (`apps/heartseed-exact/src/commentary/pack.ts`), held to it by the shared
 *  vector in both sides' tests. */
const packTexts = (
  notes: CommentaryPack['notes'],
  verses: CommentaryPack['verses'],
): readonly string[] => [
  ...notes.flatMap(([reference, text]) => [reference, text]),
  ...Object.entries(verses).map(chapterText),
];

/** The sum over the whole pack: `packTexts` joined by `\n`, so a changed note
 *  or a changed link gives another version. */
export const packSum = (notes: CommentaryPack['notes'], verses: CommentaryPack['verses']): number =>
  sumOf(packTexts(notes, verses).join('\n'));

/** `<count>-<sum as 8 hex digits>`. */
export const versionOf = (count: number, sum: number): string =>
  `${String(count)}-${sum.toString(16).padStart(8, '0')}`;

const isCommentary = (link: CommentaryLink): boolean =>
  COMMENTARY_BOOKS.includes(link.bookCode) &&
  Number.isInteger(link.bibleBook) &&
  link.bibleBook >= 1 &&
  link.bibleBook <= BIBLE_BOOKS;

const noteKey = (link: CommentaryLink): string => `${link.bookCode} ${String(link.puborder)}`;

const byNote: Order.Order<CommentaryLink> = Order.combine(
  Order.mapInput(Order.String, (link: CommentaryLink) => link.bookCode),
  Order.mapInput(Order.Number, (link: CommentaryLink) => link.puborder),
);

interface Chapter {
  readonly book: number;
  readonly chapter: number;
  readonly verses: Map<number, Set<number>>;
}

const byChapter: Order.Order<Chapter> = Order.combine(
  Order.mapInput(Order.Number, (chapter: Chapter) => chapter.book),
  Order.mapInput(Order.Number, (chapter: Chapter) => chapter.chapter),
);

const byVerse: Order.Order<readonly [number, Set<number>]> = Order.mapInput(
  Order.Number,
  ([verse]: readonly [number, Set<number>]) => verse,
);

/** Get the entry under `key`, creating it on first sight. */
const entry = <K, V>(into: Map<K, V>, key: K, fresh: () => V): V =>
  Option.getOrElse(Option.fromUndefinedOr(into.get(key)), () => {
    const made = fresh();
    into.set(key, made);
    return made;
  });

/** The pack the links make: the commentary's linked paragraphs, once each, by
 *  book code then publication order, and each verse's notes. */
export const packOf = (links: Iterable<CommentaryLink>): CommentaryPack => {
  const kept = [...links].filter(isCommentary);
  const firsts = new Map<string, CommentaryLink>();
  for (const link of kept) entry(firsts, noteKey(link), () => link);
  const ordered = Arr.sort([...firsts.values()], byNote);
  const indexOf = new Map(ordered.map((link, index) => [noteKey(link), index]));

  const chapters = new Map<string, Chapter>();
  for (const link of kept) {
    const key = `${String(link.bibleBook)}.${String(link.bibleChapter)}`;
    const chapter = entry(chapters, key, () => ({
      book: link.bibleBook,
      chapter: link.bibleChapter,
      verses: new Map<number, Set<number>>(),
    }));
    const verse = Option.getOrElse(link.bibleVerse, () => 0);
    const indexes = entry(chapter.verses, verse, () => new Set<number>());
    for (const index of Option.toArray(Option.fromUndefinedOr(indexOf.get(noteKey(link)))))
      indexes.add(index);
  }

  const verses: Record<string, (readonly [number, readonly number[]])[]> = {};
  for (const chapter of Arr.sort(chapters.values(), byChapter)) {
    verses[`${String(chapter.book)}.${String(chapter.chapter)}`] = Arr.sort(
      chapter.verses.entries(),
      byVerse,
    ).map(([verse, indexes]) => [verse, Arr.sort(indexes, Order.Number)] as const);
  }

  const notes = ordered.map((link) => [link.reference, link.text] as const);
  const sum = packSum(notes, verses);
  return {
    format: COMMENTARY_FORMAT,
    version: versionOf(notes.length, sum),
    count: notes.length,
    sum,
    notes,
    verses,
  };
};

const encodePack = S.encodeSync(S.fromJsonString(CommentaryPackSchema));

/** The pack as its version and JSON body, the bytes the server sends. */
export const builtPack = (links: Iterable<CommentaryLink>): BuiltPack => {
  const pack = packOf(links);
  return { version: pack.version, body: encodePack(pack) };
};
