/**
 * The one fold of the hymnal's words: the app's search folds a query and
 * each hymn's lines with it, and the meaning table's build folds its words
 * with it, so a word the table knows is a word a folded query holds.
 */

/** Lower case, accents dropped, apostrophes joined, other punctuation a space. */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
