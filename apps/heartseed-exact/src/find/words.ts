/* oxlint-disable effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a word's apostrophes are trimmed by a plain branch. */

/**
 * Find's one normaliser, which the index's writer (`tools/find.ts`) and the
 * reader both use, so a verse's words in the index are the words a query
 * is held to: a word is a run of letters and apostrophes, lower case, with
 * the apostrophes at its ends taken off (`LORD's` is `lord's`, `fathers'`
 * is `fathers`); anything else, a hyphen too, stands between words.
 *
 * A `Token` is a word of a text and where it stands in it, in UTF-16 code
 * units.
 */
export interface Token {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

const APOSTROPHE = 39;

/** Whether the code unit is a letter or an apostrophe. */
const inWord = (code: number) =>
  code === APOSTROPHE || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

/** The words of `text` in order, each with its place. */
export const tokensOf = (text: string): Array<Token> => {
  const tokens: Array<Token> = [];
  let at = 0;
  while (at < text.length) {
    while (at < text.length && !inWord(text.charCodeAt(at))) at += 1;
    let start = at;
    while (at < text.length && inWord(text.charCodeAt(at))) at += 1;
    let end = at;
    while (start < end && text.charCodeAt(start) === APOSTROPHE) start += 1;
    while (end > start && text.charCodeAt(end - 1) === APOSTROPHE) end -= 1;
    if (end > start) tokens.push({ word: text.slice(start, end).toLowerCase(), start, end });
  }
  return tokens;
};

/** The words of `text` in order. */
export const wordsOf = (text: string): Array<string> => tokensOf(text).map((token) => token.word);

/** A query as find reads it: its words, and whether the last is still being typed (a prefix). */
export interface Query {
  readonly words: ReadonlyArray<string>;
  readonly typing: boolean;
}

/** A query's words; the last is a prefix while the text ends inside a word, and whole once a space or a mark follows it. */
export const queryOf = (text: string): Query => {
  const words = wordsOf(text);
  const last = text.length === 0 ? 0 : text.charCodeAt(text.length - 1);
  return { words, typing: words.length > 0 && inWord(last) };
};
