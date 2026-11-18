/* oxlint-disable effect/noNullish, effect/noTernary, effect/noRuntimeTypeof, effect/noTryCatch, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md), so no Schema codec: the pack arrives as text from a server, `JSON.parse` reads it, each field is checked by its runtime type, and a body that does not parse is an answer to name, not a defect. */

/**
 * Ellen White's Bible Commentary as the phone keeps it: the pack egw.cvr.im
 * serves (`GET /api/commentary/pack`, the reader's plan, "The commentary
 * pack"), checked whole before it is kept, and read a chapter at a time.
 * `notes` holds each paragraph once, by book code then publication order;
 * `verses` holds, per `book.chapter`, each verse with the indexes of its
 * notes (verse 0 for a note on the whole chapter). `sum` is `packSum`, over
 * every note's reference and text and every chapter of `verses`, and
 * `version` is `<count>-<sum as 8 hex digits>`, so the same pack gives the
 * same version and a changed note or link another.
 */

import { atOnce, sumPaced, type Paced } from '../packs/paced';
import { sumOf } from '../text/sum';

/** The pack's format this app reads. */
export const PACK_FORMAT = 1;

/** One paragraph of the commentary: its reference code and its plain text. */
export type CommentaryNote = readonly [string, string];

/** A verse of a chapter and the indexes of its notes in `notes`. */
export type CommentaryVerseNotes = readonly [number, ReadonlyArray<number>];

/** The pack as served and kept. */
export interface CommentaryPack {
  readonly format: number;
  readonly version: string;
  readonly count: number;
  readonly sum: number;
  readonly notes: ReadonlyArray<CommentaryNote>;
  readonly verses: Readonly<Record<string, ReadonlyArray<CommentaryVerseNotes>>>;
}

/** Why a body is not a pack to keep, the first check it fails, in the order they run. */
export type PackFault = 'json' | 'fields' | 'format' | 'count' | 'index' | 'sum' | 'version';

/** A body checked: the pack it holds, or the check it failed. */
export type PackCheck =
  | { readonly _tag: 'Good'; readonly pack: CommentaryPack }
  | { readonly _tag: 'Bad'; readonly fault: PackFault };

/** One chapter of the verse map as text: its key, then each verse as `<verse>:<indexes joined by ,>`, space-separated. */
const chapterText = ([key, verses]: readonly [string, ReadonlyArray<CommentaryVerseNotes>]) =>
  [key, ...verses.map(([verse, indexes]) => `${verse}:${indexes.join(',')}`)].join(' ');

/** The texts a pack's sum covers, in order: every note's reference and text, then each chapter of `verses` as `chapterText` writes it, in the map's order; the same list as egw-search's `packTexts` (`apps/egw-search/server/commentary.ts`), held to it by the shared vector in both sides' tests. */
const packTexts = (
  notes: ReadonlyArray<CommentaryNote>,
  verses: CommentaryPack['verses'],
): ReadonlyArray<string> => [
  ...notes.flatMap(([reference, text]) => [reference, text]),
  ...Object.entries(verses).map(chapterText),
];

/** The sum over the whole pack, its notes and its verse map: `packTexts` joined by `\n`, so a changed note or link gives another version. */
export const packSum = (
  notes: ReadonlyArray<CommentaryNote>,
  verses: CommentaryPack['verses'],
): number => sumOf(packTexts(notes, verses).join('\n'));

/** A pack's version: `<count>-<sum as 8 hex digits>`. */
export const versionOf = (count: number, sum: number): string =>
  `${count}-${sum.toString(16).padStart(8, '0')}`;

/** A parsed object, its pack's fields not yet checked. */
interface Unchecked {
  readonly format?: unknown;
  readonly version?: unknown;
  readonly count?: unknown;
  readonly sum?: unknown;
  readonly notes?: unknown;
  readonly verses?: unknown;
}

const isRecord = (value: unknown): value is Unchecked =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWhole = (value: unknown): value is number => Number.isInteger(value);

const isNote = (value: unknown): value is CommentaryNote =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string';

const isVerseNotes = (value: unknown): value is CommentaryVerseNotes =>
  Array.isArray(value) &&
  value.length === 2 &&
  isWhole(value[0]) &&
  value[0] >= 0 &&
  Array.isArray(value[1]) &&
  value[1].every(isWhole);

const isChapterKey = (key: string) => /^[1-9]\d*\.[1-9]\d*$/u.test(key);

/** Whether `value` has the pack's fields, each of its type. */
const hasFields = (value: unknown): value is CommentaryPack =>
  isRecord(value) &&
  typeof value.format === 'number' &&
  typeof value.version === 'string' &&
  isWhole(value.count) &&
  isWhole(value.sum) &&
  Array.isArray(value.notes) &&
  value.notes.every(isNote) &&
  isRecord(value.verses) &&
  Object.entries(value.verses).every(
    ([key, verses]) => isChapterKey(key) && Array.isArray(verses) && verses.every(isVerseNotes),
  );

/** A body parsed, or not: whether it parsed, and what it held. */
interface Parsed {
  readonly ok: boolean;
  readonly value: unknown;
}

const parsed = (body: string): Parsed => {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, value: undefined };
  }
};

/** The first check `pack` fails, after its fields, before its sum: format, count, every index inside `notes`. */
const faultOf = (pack: CommentaryPack): PackFault | undefined => {
  if (pack.format !== PACK_FORMAT) return 'format';
  if (pack.count !== pack.notes.length) return 'count';
  const inside = Object.values(pack.verses).every((verses) =>
    verses.every(([, indexes]) => indexes.every((index) => index >= 0 && index < pack.count)),
  );
  if (!inside) return 'index';
  return undefined;
};

/** `checkPack` in steps (`src/packs/paced.ts`): the parse, the fields, then the sum `SLICE` code units a step, so the downloader holds no turn of the data host past its budget. */
export function* checkPackPaced(body: string): Paced<PackCheck> {
  const read = parsed(body);
  if (!read.ok) return { _tag: 'Bad', fault: 'json' };
  yield undefined;
  if (!hasFields(read.value)) return { _tag: 'Bad', fault: 'fields' };
  const pack = read.value;
  const fault = faultOf(pack);
  if (fault !== undefined) return { _tag: 'Bad', fault };
  yield undefined;
  const sum = yield* sumPaced(packTexts(pack.notes, pack.verses));
  if (pack.sum !== sum) return { _tag: 'Bad', fault: 'sum' };
  if (pack.version !== versionOf(pack.count, sum)) return { _tag: 'Bad', fault: 'version' };
  return { _tag: 'Good', pack };
}

/** `body` checked whole: it parses, has every field, `format` is 1, `count` is `notes.length`, every index is inside `notes`, the sum and the version are the whole pack's (`packSum`). */
export const checkPack = (body: string): PackCheck => atOnce(checkPackPaced(body));

/** One note as a chapter's reader shows it. */
export interface CommentaryNoteShown {
  ref: string;
  text: string;
}

/** A verse's notes, as a chapter's reader shows them. */
export interface CommentaryVerseShown {
  verse: number;
  notes: Array<CommentaryNoteShown>;
}

/** A chapter's commentary: whether a pack is on the phone, and each verse with notes, ascending. */
export interface CommentaryRead {
  have: boolean;
  verses: Array<CommentaryVerseShown>;
}

/** A verse and how many notes it has. */
export interface CommentaryVerseCount {
  verse: number;
  notes: number;
}

/** A chapter's counts: whether a pack is on the phone, and each verse with notes, ascending. */
export interface CommentaryCounts {
  have: boolean;
  verses: Array<CommentaryVerseCount>;
}

/** The chapter's verses with notes in `pack`, ascending, verse 0 (the whole chapter) first. */
const chapterOf = (pack: CommentaryPack, book: number, chapter: number) =>
  [...(pack.verses[`${book}.${chapter}`] ?? [])].sort(([a], [b]) => a - b);

/** The notes `pack` holds for `book` `chapter`; `have` false with no pack. */
export const readOf = (
  pack: CommentaryPack | undefined,
  book: number,
  chapter: number,
): CommentaryRead => {
  if (pack === undefined) return { have: false, verses: [] };
  return {
    have: true,
    verses: chapterOf(pack, book, chapter).map(([verse, indexes]) => ({
      verse,
      notes: indexes.flatMap((index) => {
        const note = pack.notes[index];
        return note === undefined ? [] : [{ ref: note[0], text: note[1] }];
      }),
    })),
  };
};

/** How many notes each verse of `book` `chapter` has in `pack`; `have` false with no pack. */
export const countsOf = (
  pack: CommentaryPack | undefined,
  book: number,
  chapter: number,
): CommentaryCounts => {
  if (pack === undefined) return { have: false, verses: [] };
  return {
    have: true,
    verses: chapterOf(pack, book, chapter).map(([verse, indexes]) => ({
      verse,
      notes: indexes.length,
    })),
  };
};
