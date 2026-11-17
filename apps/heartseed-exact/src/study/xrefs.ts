/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a pack's strings written and read by plain splits. */

/** One reference as the pack keeps it: `last` is `verse` for one verse. */
export interface XrefPlace {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly last: number;
}

/** How many of a verse's references the pack keeps: the first 6, in the source's order. */
export const XREFS_KEPT = 6;

const placeText = (place: XrefPlace): string =>
  place.last === place.verse
    ? `${place.book}.${place.chapter}.${place.verse}`
    : `${place.book}.${place.chapter}.${place.verse}-${place.last}`;

/** A chapter's string from each verse's references, verse 1 first; a verse past `XREFS_KEPT` keeps its first. */
export const xrefsChapterText = (verses: ReadonlyArray<ReadonlyArray<XrefPlace>>): string => {
  const texts = verses.map((places) => places.slice(0, XREFS_KEPT).map(placeText).join(';'));
  while (texts.length > 0 && texts.at(-1) === '') texts.pop();
  return texts.join('|');
};

const placeOf = (text: string): XrefPlace => {
  const [book = '', chapter = '', verses = ''] = text.split('.');
  const [first = '', last] = verses.split('-');
  return {
    book: Number(book),
    chapter: Number(chapter),
    verse: Number(first),
    last: Number(last ?? first),
  };
};

/** A chapter's string split into its verses' strings, verse 1 first. */
export const xrefsVerses = (chapter: string): ReadonlyArray<string> =>
  chapter === '' ? [] : chapter.split('|');

/** A verse's string read as its references. */
export const xrefsOfVerse = (verse: string): ReadonlyArray<XrefPlace> =>
  verse === '' ? [] : verse.split(';').map(placeOf);
