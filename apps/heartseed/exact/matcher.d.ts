/** The help shown while reciting: none, each word's initial, or the whole verse. */
export type Cue = 'none' | 'initials' | 'full';
/** A recognized word and its time in milliseconds from the attempt's start. */
export type SpokenWord = Readonly<{
  text: string;
  start: number;
  end: number;
}>;
export type RecognitionCommand = Readonly<{
  type: 'recognition';
  revision: number;
  finalWords: readonly SpokenWord[];
  tentativeWords: readonly SpokenWord[];
}>;
export type PeekCommand = Readonly<{
  type: 'peek';
  index: number;
}>;
export type FinishCommand = Readonly<{
  type: 'finish';
}>;
export type Command = RecognitionCommand | PeekCommand | FinishCommand;
export type MarkStatus = 'pending' | 'tentative' | 'matched' | 'miss' | 'peek';
// oxlint-disable-next-line effect/noNullish -- the matcher's view contract gives an absent time, reveal or grade as null, as src/matcher.ts does.
export type OrNull<A> = A | null;
/** A word's time in milliseconds from the attempt's start. */
export type Time = Readonly<{
  start: number;
  end: number;
}>;
/** One source word's light: its time when said, its text only once peeked. */
export type Mark = Readonly<{
  index: number;
  status: MarkStatus;
  time: OrNull<Time>;
  revealed: OrNull<string>;
}>;
/** FSRS's Again, Hard and Good; Easy stays the reader's own choice. */
export type SuggestedGrade = 1 | 2 | 3;
export type MatcherView = Readonly<{
  marks: readonly Mark[];
  extraWordCount: number;
  peekCount: number;
  suggestedGrade: OrNull<SuggestedGrade>;
  finished: boolean;
}>;
declare const opaque: unique symbol;
/** One attempt at a verse; opaque to callers, who read it through `matcherView`. */
export type MatcherState = Readonly<{
  [opaque]: true;
}>;
/** A fresh attempt at `verse`, recited under `cue`: every word pending, nothing heard. */
export declare const createMatcher: (verse: string, cue?: Cue) => MatcherState;
/** The view of an attempt: every mark, the extra and peek counts, and the suggestion. */
export declare const matcherView: (state: MatcherState) => MatcherView;
/** The attempt after `command`; see `src/matcher.ts`. */
export declare const updateMatcher: (state: MatcherState, command: Command) => MatcherState;
