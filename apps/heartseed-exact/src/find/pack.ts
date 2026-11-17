/* oxlint-disable effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): the varint digits pick an alphabet by a plain branch. */

/**
 * The word index's pack (`find.json`, written by `tools/find.ts`) and
 * the codes it is written in, which the writer and the reader share. Every
 * number is text in an alphabet of the 93 printable ASCII characters but
 * the quote and the backslash, so the JSON holds it unescaped:
 *
 * - a count or a gap is a varint: digits of 46 values end it, digits of
 *   47 more values come before them (`varint`, `readVarint`);
 * - a set of verses is a bitmap of six verses a character (`bitmapOf`,
 *   `hasBit`);
 * - a letter's words are sorted and front-coded: each word is the count of
 *   letters it shares with the word before (one of `SHARED`), then the
 *   rest of its letters.
 *
 * What the pack holds, per verse in canon order (`verses` of them):
 *
 * - `letters`: per first letter, its words (`words`), each word's list's
 *   length in characters (`lens`, a varint each), and the lists one after
 *   another (`lists`): a word's every place in the corpus as the index of
 *   its token among all the corpus's tokens, the first whole and each next
 *   as the gap after the one before less one. A tabled word's list is
 *   empty;
 * - `stops`: the stop words, the words in more than a quarter of all
 *   verses. They carry no list and never drive a search;
 * - `tabled`: the words in more than one verse in `TABLED_SHARE`, the stop
 *   words among them, by id: their places are in the verse table, not in
 *   lists, and `marks` holds the verses each is in;
 * - `sizes`: per verse its count of tokens and the length in characters of
 *   its row of `table`, so the reader finds every verse's row without
 *   reading the rows;
 * - `table`: per verse its tabled words, each as the gap from the one
 *   before (from -1) times the count of tabled words, plus its id;
 * - `classes`: per prefix whose untabled words have more than `BIG_CLASS`
 *   tokens, the verses one of its words (any) is in;
 * - `chapters`: per chapter in canon order its count of verses.
 *
 * `FIND_FORMAT` is the pack's format; a reader refuses another.
 */
export const FIND_FORMAT = 2;

/** A stop word is in more than one verse in this many. */
export const STOP_SHARE = 4;

/** A tabled word is in more than one verse in this many. */
export const TABLED_SHARE = 8;

/** A prefix whose untabled words have more tokens than this is a class with its own bitmap, never decoded whole. */
export const BIG_CLASS = 6000;

/** A letter's words and lists. */
export interface FindLetter {
  readonly words: string;
  readonly lens: string;
  readonly lists: string;
}

/** The word index as the data module imports it. */
export interface FindPack {
  readonly format: number;
  readonly verses: number;
  readonly chapters: string;
  readonly sizes: string;
  readonly table: string;
  readonly stops: ReadonlyArray<string>;
  readonly tabled: ReadonlyArray<string>;
  readonly marks: ReadonlyArray<string>;
  readonly classes: Readonly<Record<string, string>>;
  readonly letters: Readonly<Record<string, FindLetter>>;
}

/** The varint's ending digits; the digits before them have the alphabet's other 47 values. */
export const ENDS = 46;
export const GOES_ON = 47;

/** The shared-length marks of a front-coded word, none a letter or an apostrophe. */
export const SHARED = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The character of a digit's value, 0 to 92. */
export const symbol = (value: number): string => {
  let code = value + 32;
  if (code >= 34) code += 1;
  if (code >= 92) code += 1;
  return String.fromCharCode(code);
};

/** The value of the digit at `at` in `text`. */
export const digitAt = (text: string, at: number): number => {
  const code = text.charCodeAt(at);
  return code - 32 - (code > 34 ? 1 : 0) - (code > 92 ? 1 : 0);
};

/** `value`, a whole number of 0 or more, as a varint. */
export const varint = (value: number): string => {
  let rest = Math.floor(value / ENDS);
  let head = '';
  while (rest > 0) {
    head = symbol(ENDS + (rest % GOES_ON)) + head;
    rest = Math.floor(rest / GOES_ON);
  }
  return head + symbol(value % ENDS);
};

/** A reader's place in a text of varints. */
export interface Cursor {
  at: number;
}

/** The varint at `cursor` in `text`, the cursor moved past it. */
export const readVarint = (text: string, cursor: Cursor): number => {
  let value = 0;
  let digit = digitAt(text, cursor.at);
  cursor.at += 1;
  while (digit >= ENDS) {
    value = value * GOES_ON + (digit - ENDS);
    digit = digitAt(text, cursor.at);
    cursor.at += 1;
  }
  return value * ENDS + digit;
};

/** The bitmap of `members` among `size` verses. */
export const bitmapOf = (members: Iterable<number>, size: number): string => {
  const sixes: Array<number> = Array.from({ length: Math.ceil(size / 6) }, () => 0);
  for (const member of members) {
    const at = Math.floor(member / 6);
    sixes[at] = (sixes[at] ?? 0) | (1 << (member % 6));
  }
  return sixes.map(symbol).join('');
};

/** Whether `verse` is in the bitmap. */
export const hasBit = (bitmap: string, verse: number): boolean =>
  ((digitAt(bitmap, Math.floor(verse / 6)) >> (verse % 6)) & 1) === 1;

/** The verses of the bitmap among `size`, in order. */
export const bitsOf = (bitmap: string, size: number): Int32Array => {
  const verses: Array<number> = [];
  for (let six = 0; six < bitmap.length; six += 1) {
    const digit = digitAt(bitmap, six);
    if (digit === 0) continue;
    for (let bit = 0; bit < 6; bit += 1)
      if (((digit >> bit) & 1) === 1 && six * 6 + bit < size) verses.push(six * 6 + bit);
  }
  return Int32Array.from(verses);
};

/** The verses among `size` in every one of the bitmaps (all verses for none), in order. */
export const versesInAll = (bitmaps: ReadonlyArray<string>, size: number): Array<number> => {
  const verses: Array<number> = [];
  for (let six = 0; six * 6 < size; six += 1) {
    let digit = 63;
    for (let each = 0; each < bitmaps.length && digit !== 0; each += 1) {
      const code = (bitmaps[each] ?? '').charCodeAt(six);
      digit &= code - 32 - (code > 34 ? 1 : 0) - (code > 92 ? 1 : 0);
    }
    if (digit === 0) continue;
    for (let bit = 0; bit < 6; bit += 1)
      if (((digit >> bit) & 1) === 1 && six * 6 + bit < size) verses.push(six * 6 + bit);
  }
  return verses;
};

/** The front-coded text of `words`, sorted. */
export const frontCoded = (words: ReadonlyArray<string>): string => {
  let before = '';
  let text = '';
  for (const word of words) {
    let shared = 0;
    while (
      shared < SHARED.length - 1 &&
      shared < before.length &&
      shared < word.length &&
      before[shared] === word[shared]
    )
      shared += 1;
    text += SHARED.charAt(shared) + word.slice(shared);
    before = word;
  }
  return text;
};

/** The shared length a mark of `SHARED` stands for; -1 for a letter or an apostrophe. */
const sharedOf = (code: number) => {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return code - 55;
  return -1;
};

/** The words of a front-coded text, in order. */
export const frontDecoded = (text: string): Array<string> => {
  const words: Array<string> = [];
  let before = '';
  let at = 0;
  while (at < text.length) {
    const shared = sharedOf(text.charCodeAt(at));
    let end = at + 1;
    while (end < text.length && sharedOf(text.charCodeAt(end)) < 0) end += 1;
    before = before.slice(0, shared) + text.slice(at + 1, end);
    words.push(before);
    at = end;
  }
  return words;
};
