/**
 * The rules Today's words follow under a cue, kept apart from the drawing
 * (`draw.tsx`) so every reader of them shares one: a word's first letter or
 * number as written under first letters, and how long a word peeked at rest
 * shows.
 */

const LETTER = /[\p{L}\p{N}]/u;

/** The first letter or number of `word` as written, and the parts before and after it. */
export const lettersOf = (word: string) => {
  const at = Math.max(0, word.search(LETTER));
  return { before: word.slice(0, at), cue: word.slice(at, at + 1), after: word.slice(at + 1) };
};

/** How long a word peeked at rest shows, in milliseconds. */
export const PEEK_SHOWN_MS = 1500;
