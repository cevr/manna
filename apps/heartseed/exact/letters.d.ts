/** A word's first letter or number as written under first letters, and the parts before and after it. */
export declare const lettersOf: (word: string) => {
  before: string;
  cue: string;
  after: string;
};

/** How long a word peeked at rest shows, in milliseconds. */
export declare const PEEK_SHOWN_MS: 1500;
