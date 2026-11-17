/** A shown word and where it stands in its verse's text. */
export interface ShownWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** `text`'s shown words, in order, each with its UTF-16 `start` and `end`. */
export const shownWords = (text: string): ReadonlyArray<ShownWord> => {
  const words: Array<ShownWord> = [];
  let start = 0;
  for (const word of text.split(' ')) {
    words.push({ text: word, start, end: start + word.length });
    start += word.length + 1;
  }
  return words;
};

/** A word by its letters alone, lower case: how the tagged text is lined up with the shown. */
export const lettersOf = (word: string): string => word.toLowerCase().replace(/[^\p{L}]/gu, '');

/** A word as a rendering counts it: lower case, its letters and apostrophes. */
export const renderOf = (word: string): string =>
  word
    .toLowerCase()
    .replace(/[\u2019\u02bc]/gu, "'")
    .replace(/[^\p{L}']/gu, '');
