/**
 * Bible Books Data
 *
 * Static data for all 66 books of the Bible.
 * Renderer-agnostic - shared by application and command-line hosts.
 */

import { Option } from 'effect';

import { Book, type Reference as BibleReference, bookNumber, chapterNumber } from './model.js';

/**
 * Book name aliases for reference parsing
 * Maps lowercase aliases to book numbers (1-66). A Map, not an object, so a
 * lookup by user input never reaches an inherited key such as `constructor`.
 */
export const BIBLE_BOOK_ALIASES: ReadonlyMap<string, number> = new Map(
  Object.entries({
    gen: 1,
    genesis: 1,
    exod: 2,
    exo: 2,
    exodus: 2,
    ex: 2,
    lev: 3,
    leviticus: 3,
    num: 4,
    numbers: 4,
    deut: 5,
    deuteronomy: 5,
    josh: 6,
    joshua: 6,
    judg: 7,
    judges: 7,
    ruth: 8,
    '1sam': 9,
    '1samuel': 9,
    '1 sam': 9,
    '1 samuel': 9,
    '2sam': 10,
    '2samuel': 10,
    '2 sam': 10,
    '2 samuel': 10,
    '1kgs': 11,
    '1kings': 11,
    '1 kgs': 11,
    '1 kings': 11,
    '2kgs': 12,
    '2kings': 12,
    '2 kgs': 12,
    '2 kings': 12,
    '1chr': 13,
    '1chronicles': 13,
    '1 chr': 13,
    '1 chronicles': 13,
    '1 chron': 13,
    '2chr': 14,
    '2chronicles': 14,
    '2 chr': 14,
    '2 chronicles': 14,
    '2 chron': 14,
    ezra: 15,
    neh: 16,
    nehemiah: 16,
    esth: 17,
    esther: 17,
    job: 18,
    ps: 19,
    psalm: 19,
    psalms: 19,
    psa: 19,
    prov: 20,
    proverbs: 20,
    eccl: 21,
    ecclesiastes: 21,
    ecc: 21,
    song: 22,
    'song of solomon': 22,
    sos: 22,
    'song of songs': 22,
    isa: 23,
    isaiah: 23,
    jer: 24,
    jeremiah: 24,
    lam: 25,
    lamentations: 25,
    ezek: 26,
    eze: 26,
    ezekiel: 26,
    dan: 27,
    daniel: 27,
    hos: 28,
    hosea: 28,
    joel: 29,
    amos: 30,
    obad: 31,
    obadiah: 31,
    jonah: 32,
    mic: 33,
    micah: 33,
    nah: 34,
    nahum: 34,
    hab: 35,
    habakkuk: 35,
    zeph: 36,
    zephaniah: 36,
    hag: 37,
    haggai: 37,
    zech: 38,
    zechariah: 38,
    mal: 39,
    malachi: 39,
    matt: 40,
    matthew: 40,
    mt: 40,
    mark: 41,
    mk: 41,
    luke: 42,
    lk: 42,
    john: 43,
    jn: 43,
    acts: 44,
    rom: 45,
    romans: 45,
    '1cor': 46,
    '1corinthians': 46,
    '1 cor': 46,
    '1 corinthians': 46,
    '2cor': 47,
    '2corinthians': 47,
    '2 cor': 47,
    '2 corinthians': 47,
    gal: 48,
    galatians: 48,
    eph: 49,
    ephesians: 49,
    phil: 50,
    philippians: 50,
    col: 51,
    colossians: 51,
    '1thess': 52,
    '1th': 52,
    '1thessalonians': 52,
    '1 th': 52,
    '1 thess': 52,
    '1 thessalonians': 52,
    '2thess': 53,
    '2th': 53,
    '2thessalonians': 53,
    '2 th': 53,
    '2 thess': 53,
    '2 thessalonians': 53,
    '1tim': 54,
    '1timothy': 54,
    '1 tim': 54,
    '1 timothy': 54,
    '2tim': 55,
    '2timothy': 55,
    '2 tim': 55,
    '2 timothy': 55,
    titus: 56,
    tit: 56,
    phlm: 57,
    philemon: 57,
    heb: 58,
    hebrews: 58,
    jas: 59,
    james: 59,
    '1pet': 60,
    '1peter': 60,
    '1 pet': 60,
    '1 peter': 60,
    '2pet': 61,
    '2peter': 61,
    '2 pet': 61,
    '2 peter': 61,
    '1jn': 62,
    '1john': 62,
    '1 jn': 62,
    '1 john': 62,
    '2jn': 63,
    '2john': 63,
    '2 jn': 63,
    '2 john': 63,
    '3jn': 64,
    '3john': 64,
    '3 jn': 64,
    '3 john': 64,
    jude: 65,
    rev: 66,
    revelation: 66,
    'the revelation': 66,
  }),
);

/**
 * All 66 books of the Bible with metadata
 */
interface BookSeed {
  readonly number: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly chapters: number;
  readonly testament: 'old' | 'new';
}

const BOOK_DATA: readonly BookSeed[] = [
  { number: 1, name: 'Genesis', abbreviation: 'Gen', chapters: 50, testament: 'old' },
  { number: 2, name: 'Exodus', abbreviation: 'Exod', chapters: 40, testament: 'old' },
  { number: 3, name: 'Leviticus', abbreviation: 'Lev', chapters: 27, testament: 'old' },
  { number: 4, name: 'Numbers', abbreviation: 'Num', chapters: 36, testament: 'old' },
  { number: 5, name: 'Deuteronomy', abbreviation: 'Deut', chapters: 34, testament: 'old' },
  { number: 6, name: 'Joshua', abbreviation: 'Josh', chapters: 24, testament: 'old' },
  { number: 7, name: 'Judges', abbreviation: 'Judg', chapters: 21, testament: 'old' },
  { number: 8, name: 'Ruth', abbreviation: 'Ruth', chapters: 4, testament: 'old' },
  { number: 9, name: '1 Samuel', abbreviation: '1Sam', chapters: 31, testament: 'old' },
  { number: 10, name: '2 Samuel', abbreviation: '2Sam', chapters: 24, testament: 'old' },
  { number: 11, name: '1 Kings', abbreviation: '1Kgs', chapters: 22, testament: 'old' },
  { number: 12, name: '2 Kings', abbreviation: '2Kgs', chapters: 25, testament: 'old' },
  { number: 13, name: '1 Chronicles', abbreviation: '1Chr', chapters: 29, testament: 'old' },
  { number: 14, name: '2 Chronicles', abbreviation: '2Chr', chapters: 36, testament: 'old' },
  { number: 15, name: 'Ezra', abbreviation: 'Ezra', chapters: 10, testament: 'old' },
  { number: 16, name: 'Nehemiah', abbreviation: 'Neh', chapters: 13, testament: 'old' },
  { number: 17, name: 'Esther', abbreviation: 'Esth', chapters: 10, testament: 'old' },
  { number: 18, name: 'Job', abbreviation: 'Job', chapters: 42, testament: 'old' },
  { number: 19, name: 'Psalms', abbreviation: 'Ps', chapters: 150, testament: 'old' },
  { number: 20, name: 'Proverbs', abbreviation: 'Prov', chapters: 31, testament: 'old' },
  { number: 21, name: 'Ecclesiastes', abbreviation: 'Eccl', chapters: 12, testament: 'old' },
  { number: 22, name: 'Song of Solomon', abbreviation: 'Song', chapters: 8, testament: 'old' },
  { number: 23, name: 'Isaiah', abbreviation: 'Isa', chapters: 66, testament: 'old' },
  { number: 24, name: 'Jeremiah', abbreviation: 'Jer', chapters: 52, testament: 'old' },
  { number: 25, name: 'Lamentations', abbreviation: 'Lam', chapters: 5, testament: 'old' },
  { number: 26, name: 'Ezekiel', abbreviation: 'Ezek', chapters: 48, testament: 'old' },
  { number: 27, name: 'Daniel', abbreviation: 'Dan', chapters: 12, testament: 'old' },
  { number: 28, name: 'Hosea', abbreviation: 'Hos', chapters: 14, testament: 'old' },
  { number: 29, name: 'Joel', abbreviation: 'Joel', chapters: 3, testament: 'old' },
  { number: 30, name: 'Amos', abbreviation: 'Amos', chapters: 9, testament: 'old' },
  { number: 31, name: 'Obadiah', abbreviation: 'Obad', chapters: 1, testament: 'old' },
  { number: 32, name: 'Jonah', abbreviation: 'Jonah', chapters: 4, testament: 'old' },
  { number: 33, name: 'Micah', abbreviation: 'Mic', chapters: 7, testament: 'old' },
  { number: 34, name: 'Nahum', abbreviation: 'Nah', chapters: 3, testament: 'old' },
  { number: 35, name: 'Habakkuk', abbreviation: 'Hab', chapters: 3, testament: 'old' },
  { number: 36, name: 'Zephaniah', abbreviation: 'Zeph', chapters: 3, testament: 'old' },
  { number: 37, name: 'Haggai', abbreviation: 'Hag', chapters: 2, testament: 'old' },
  { number: 38, name: 'Zechariah', abbreviation: 'Zech', chapters: 14, testament: 'old' },
  { number: 39, name: 'Malachi', abbreviation: 'Mal', chapters: 4, testament: 'old' },
  { number: 40, name: 'Matthew', abbreviation: 'Matt', chapters: 28, testament: 'new' },
  { number: 41, name: 'Mark', abbreviation: 'Mark', chapters: 16, testament: 'new' },
  { number: 42, name: 'Luke', abbreviation: 'Luke', chapters: 24, testament: 'new' },
  { number: 43, name: 'John', abbreviation: 'John', chapters: 21, testament: 'new' },
  { number: 44, name: 'Acts', abbreviation: 'Acts', chapters: 28, testament: 'new' },
  { number: 45, name: 'Romans', abbreviation: 'Rom', chapters: 16, testament: 'new' },
  { number: 46, name: '1 Corinthians', abbreviation: '1Cor', chapters: 16, testament: 'new' },
  { number: 47, name: '2 Corinthians', abbreviation: '2Cor', chapters: 13, testament: 'new' },
  { number: 48, name: 'Galatians', abbreviation: 'Gal', chapters: 6, testament: 'new' },
  { number: 49, name: 'Ephesians', abbreviation: 'Eph', chapters: 6, testament: 'new' },
  { number: 50, name: 'Philippians', abbreviation: 'Phil', chapters: 4, testament: 'new' },
  { number: 51, name: 'Colossians', abbreviation: 'Col', chapters: 4, testament: 'new' },
  { number: 52, name: '1 Thessalonians', abbreviation: '1Thess', chapters: 5, testament: 'new' },
  { number: 53, name: '2 Thessalonians', abbreviation: '2Thess', chapters: 3, testament: 'new' },
  { number: 54, name: '1 Timothy', abbreviation: '1Tim', chapters: 6, testament: 'new' },
  { number: 55, name: '2 Timothy', abbreviation: '2Tim', chapters: 4, testament: 'new' },
  { number: 56, name: 'Titus', abbreviation: 'Titus', chapters: 3, testament: 'new' },
  { number: 57, name: 'Philemon', abbreviation: 'Phlm', chapters: 1, testament: 'new' },
  { number: 58, name: 'Hebrews', abbreviation: 'Heb', chapters: 13, testament: 'new' },
  { number: 59, name: 'James', abbreviation: 'Jas', chapters: 5, testament: 'new' },
  { number: 60, name: '1 Peter', abbreviation: '1Pet', chapters: 5, testament: 'new' },
  { number: 61, name: '2 Peter', abbreviation: '2Pet', chapters: 3, testament: 'new' },
  { number: 62, name: '1 John', abbreviation: '1John', chapters: 5, testament: 'new' },
  { number: 63, name: '2 John', abbreviation: '2John', chapters: 1, testament: 'new' },
  { number: 64, name: '3 John', abbreviation: '3John', chapters: 1, testament: 'new' },
  { number: 65, name: 'Jude', abbreviation: 'Jude', chapters: 1, testament: 'new' },
  { number: 66, name: 'Revelation', abbreviation: 'Rev', chapters: 22, testament: 'new' },
];

export const BIBLE_BOOKS: readonly Book[] = BOOK_DATA.map((book) =>
  Book.make({
    ...book,
    number: bookNumber(book.number),
    chapters: chapterNumber(book.chapters),
  }),
);

const BOOK_BY_NUMBER = new Map<number, Book>(BIBLE_BOOKS.map((b) => [b.number, b]));

const BOOK_BY_NAME = new Map<string, Book>([
  ...BIBLE_BOOKS.map((b): readonly [string, Book] => [b.name.toLowerCase(), b]),
  ...[...BIBLE_BOOK_ALIASES].flatMap(([alias, num]): readonly (readonly [string, Book])[] => {
    const book = BOOK_BY_NUMBER.get(num);
    if (!book) return [];
    return [[alias, book]];
  }),
]);

export function getBibleBook(bookNumber: number): Option.Option<Book> {
  return Option.fromUndefinedOr(BOOK_BY_NUMBER.get(bookNumber));
}

export function getBibleBookByName(name: string): Option.Option<Book> {
  return Option.fromUndefinedOr(BOOK_BY_NAME.get(name.trim().toLowerCase()));
}

/**
 * Format a reference for display
 * Supports optional verse ranges (e.g., "John 3:16-18")
 */
export function formatBibleReference(ref: BibleReference): string {
  let startBook: number;
  if (ref._tag === 'range') {
    startBook = ref.start.book;
  } else {
    startBook = ref.book;
  }
  const found = getBibleBook(startBook);
  if (Option.isNone(found)) return '';
  const book = found.value;
  if (ref._tag === 'book') return book.name;
  if (ref._tag === 'range')
    return `${book.name} ${ref.start.chapter}:${ref.start.verse}-${ref.end.verse}`;
  if (ref._tag === 'verse') return `${book.name} ${ref.chapter}:${ref.verse}`;
  return `${book.name} ${ref.chapter}`;
}
