/**
 * The words a verse and a recognizer give, as the matcher compares them.
 * A word is a whitespace-separated run holding a Unicode letter or number;
 * its key is its lowercase letters and numbers alone, so case, punctuation
 * and combining marks never separate two words, and nothing else joins them.
 */

const WORD = /[\p{L}\p{N}]/u;

/** The source's words, punctuation-only runs left out, each with its raw text. */
export const sourceWords = (verse: string): readonly string[] =>
  verse.split(/\s+/u).filter((run) => WORD.test(run));

/** Whether a recognizer's word is one whitespace-free run holding a letter or number. */
export const isSpokenText = (text: string): boolean =>
  text.length > 0 && WORD.test(text) && !/\s/u.test(text);

/** A word's key: its lowercase form with every character but a letter or number removed. */
export const wordKey = (text: string): string =>
  [...text.toLowerCase()].filter((char) => WORD.test(char)).join('');

/**
 * The closed table of spellings a reader and a recognizer may give for the
 * same words, each pair matching in both directions and nothing else: the
 * KJV's archaic spellings, `o`/`oh`, a recognizer's `ledeth`, and the
 * compounds `for ever`, `ever more` and `name's sake` (whose apostrophe
 * goes, leaving `names sake`).
 */
const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  ['shew', 'show'],
  ['shewed', 'showed'],
  ['sheweth', 'showeth'],
  ['shewing', 'showing'],
  ['alway', 'always'],
  ['throughly', 'thoroughly'],
  ['subtil', 'subtle'],
  ['subtilly', 'subtly'],
  ['publick', 'public'],
  ['musick', 'music'],
  ['astonied', 'astonished'],
  ['ensample', 'example'],
  ['ensamples', 'examples'],
  ['stablish', 'establish'],
  ['stablished', 'established'],
  ['intreat', 'entreat'],
  ['intreated', 'entreated'],
  ['o', 'oh'],
  ['leadeth', 'ledeth'],
  ['for ever', 'forever'],
  ['ever more', 'evermore'],
  ['names sake', 'namesake'],
];

/** The longest spelling in words, so spans past it need no lookup. */
export const LONGEST_SPELLING = Math.max(
  ...SPELLINGS.flat().map((spelling) => spelling.split(' ').length),
);

/** Each spelling's key to the keys it matches. */
export const SPELLING_MATCHES: ReadonlyMap<string, readonly string[]> = SPELLINGS.reduce(
  (table, [a, b]) =>
    table.set(a, [...(table.get(a) ?? []), b]).set(b, [...(table.get(b) ?? []), a]),
  new Map<string, string[]>(),
);
