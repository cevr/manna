/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a pack's strings written and read by plain splits. */

/** One shown word's tag: its numbers without their letter, and whether the translators added it. */
export interface WordTag {
  readonly numbers: ReadonlyArray<number>;
  readonly added: boolean;
}

/** The letter of a number in `book`: `H` in books 1-39, else `G`. */
export const letterOf = (book: number): 'H' | 'G' => (book <= 39 ? 'H' : 'G');

const tokenOf = (tag: WordTag): string =>
  `${tag.added ? '~' : ''}${tag.numbers.length === 0 ? '-' : tag.numbers.join('+')}`;

/** A verse's string from its words' tags; empty for a verse that carries none. */
export const tagsVerseText = (tags: ReadonlyArray<WordTag> | undefined): string =>
  tags === undefined ? '' : tags.map(tokenOf).join(' ');

/** A chapter's string from its verses' strings, verse 1 first. */
export const tagsChapterText = (verses: ReadonlyArray<string>): string => verses.join('|');

/** A chapter's string split into its verses' strings, verse 1 first. */
export const tagsVerses = (chapter: string): ReadonlyArray<string> => chapter.split('|');

const tagOf = (token: string): WordTag => {
  const added = token.startsWith('~');
  const body = added ? token.slice(1) : token;
  return { added, numbers: body === '-' ? [] : body.split('+').map(Number) };
};

/** A verse's string read as its words' tags; none for a verse that carries none. */
export const tagsOfVerse = (verse: string): ReadonlyArray<WordTag> | undefined =>
  verse === '' ? undefined : verse.split(' ').map(tagOf);
