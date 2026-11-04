/**
 * Heartseed's word matcher: it holds what a reader says against a verse's
 * words and lights each word as it is said. A recognizer reports each
 * attempt as cumulative snapshots: a finalized prefix that only grows and
 * the whole tentative tail after it, in order of revision. The view marks
 * every source word, hides a missed word until a peek reveals it, and,
 * once the attempt is finished, suggests an FSRS grade. Every function is
 * pure and synchronous; a state is never changed, only replaced.
 */

import { Option } from 'effect';

import { align, sourceSpans, spokenSpans, type Alignment, type SourceSpans } from './matcher/align';
import { isSpokenText, sourceWords, wordKey } from './matcher/words';

/** The help shown while reciting: none, each word's initial, or the whole verse. */
export type Cue = 'none' | 'initials' | 'full';

/** A recognized word and its time in milliseconds from the attempt's start. */
export type SpokenWord = Readonly<{ text: string; start: number; end: number }>;

export type RecognitionCommand = Readonly<{
  type: 'recognition';
  revision: number;
  finalWords: readonly SpokenWord[];
  tentativeWords: readonly SpokenWord[];
}>;

export type PeekCommand = Readonly<{ type: 'peek'; index: number }>;

export type FinishCommand = Readonly<{ type: 'finish' }>;

export type Command = RecognitionCommand | PeekCommand | FinishCommand;

export type MarkStatus = 'pending' | 'tentative' | 'matched' | 'miss' | 'peek';

// oxlint-disable-next-line effect/noNullish -- the view contract (hsmatch spec A1) gives the screen and the scheduler an absent time, reveal or grade as null.
export type OrNull<A> = A | null;

/** A word's time in milliseconds from the attempt's start. */
export type Time = Readonly<{ start: number; end: number }>;

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

const inner = Symbol('matcher state');

type Attempt = Readonly<{
  words: readonly string[];
  source: SourceSpans;
  cue: Cue;
  revision: number;
  final: readonly SpokenWord[];
  finalAlignment: Alignment;
  tentative: readonly SpokenWord[];
  tentativeAlignment: Alignment;
  finished: boolean;
  peeked: ReadonlySet<number>;
}>;

/** One attempt at a verse; opaque to callers, who read it through `matcherView`. */
export type MatcherState = Readonly<{
  [inner]: Readonly<{ attempt: Attempt; view: MatcherView }>;
}>;

const NOTHING: Alignment = { groups: [], hits: 0, used: 0 };

const alignWords = (attempt: Attempt, from: number, spoken: readonly SpokenWord[]) => {
  if (spoken.length === 0) return NOTHING;
  return align(
    attempt.source,
    attempt.words.length,
    from,
    spokenSpans(spoken.map((word) => wordKey(word.text))),
    spoken.length,
  );
};

/** One past the last source word the finalized words match. */
const frontier = (attempt: Attempt) => attempt.finalAlignment.groups.at(-1)?.source.end ?? 0;

/** Each source word's spoken time under `alignment`, by source index. */
const times = (alignment: Alignment, spoken: readonly SpokenWord[]) => {
  const found = new Map<number, Time>();
  for (const { source, spoken: said } of alignment.groups) {
    const start = spoken[said.start]?.start ?? 0;
    const end = spoken[said.end - 1]?.end ?? 0;
    for (let index = source.start; index < source.end; index += 1) {
      found.set(index, { start, end });
    }
  }
  return found;
};

const grade = (attempt: Attempt): SuggestedGrade => {
  const count = attempt.words.length;
  const hits = attempt.finalAlignment.hits;
  const missing = count - hits;
  if (count === 0 || hits === 0 || missing * 10 > count) return 1;
  const extras = attempt.final.length - attempt.finalAlignment.used;
  const helped = attempt.peeked.size > 0 || attempt.cue !== 'none';
  if (missing > 0 || extras > 0 || helped) return 2;
  return 3;
};

/** The grade once the attempt is finished; none while it is still being said. */
const suggestion = (attempt: Attempt): Option.Option<SuggestedGrade> => {
  if (!attempt.finished) return Option.none();
  return Option.some(grade(attempt));
};

/** The view's absent value. */
const ABSENT: OrNull<never> = Option.getOrNull(Option.none());

const heard = (index: number, status: 'matched' | 'tentative', time: Time): Mark => ({
  index,
  status,
  time,
  revealed: ABSENT,
});

const unheard = (
  index: number,
  status: 'pending' | 'miss' | 'peek',
  revealed: Option.Option<string>,
): Mark => ({
  index,
  status,
  time: ABSENT,
  revealed: Option.getOrNull(revealed),
});

const viewOf = (attempt: Attempt): MatcherView => {
  const matched = times(attempt.finalAlignment, attempt.final);
  const reached = frontier(attempt);
  const tentative = times(attempt.tentativeAlignment, attempt.tentative);
  const marks = attempt.words.map((text, index): Mark => {
    const final = Option.fromUndefinedOr(matched.get(index));
    if (Option.isSome(final)) return heard(index, 'matched', final.value);
    const guess = Option.fromUndefinedOr(tentative.get(index));
    if (Option.isSome(guess)) return heard(index, 'tentative', guess.value);
    if (!attempt.finished && index >= reached) return unheard(index, 'pending', Option.none());
    if (attempt.peeked.has(index)) return unheard(index, 'peek', Option.some(text));
    return unheard(index, 'miss', Option.none());
  });
  return {
    marks,
    extraWordCount: attempt.final.length - attempt.finalAlignment.used,
    peekCount: attempt.peeked.size,
    suggestedGrade: Option.getOrNull(suggestion(attempt)),
    finished: attempt.finished,
  };
};

const stateOf = (attempt: Attempt): MatcherState => ({
  [inner]: { attempt, view: viewOf(attempt) },
});

/** A fresh attempt at `verse`, recited under `cue`: every word pending, nothing heard. */
export const createMatcher = (verse: string, cue: Cue = 'none'): MatcherState => {
  const words = sourceWords(verse);
  return stateOf({
    words,
    source: sourceSpans(words.map(wordKey)),
    cue,
    revision: -1,
    final: [],
    finalAlignment: NOTHING,
    tentative: [],
    tentativeAlignment: NOTHING,
    finished: false,
    peeked: new Set(),
  });
};

/** The view of an attempt: every mark, the extra and peek counts, and the suggestion. */
export const matcherView = (state: MatcherState): MatcherView => state[inner].view;

const validWords = (words: readonly SpokenWord[]) =>
  words.every(
    (word, index) =>
      isSpokenText(word.text) &&
      Number.isFinite(word.start) &&
      Number.isFinite(word.end) &&
      word.start >= 0 &&
      word.end >= word.start &&
      (index === 0 || word.start >= (words[index - 1]?.start ?? 0)),
  );

const sameWord = (a: SpokenWord, b: SpokenWord) =>
  a.text === b.text && a.start === b.start && a.end === b.end;

/** Whether `next` holds `prior` word for word, text and times alike, then perhaps more. */
const extendsFinal = (prior: readonly SpokenWord[], next: readonly SpokenWord[]) =>
  next.length >= prior.length &&
  prior.every((word, index) =>
    Option.exists(Option.fromUndefinedOr(next[index]), (other) => sameWord(word, other)),
  );

const copy = (words: readonly SpokenWord[]): readonly SpokenWord[] =>
  words.map(({ text, start, end }) => ({ text, start, end }));

/** The attempt under a new revision, its finalized words realigned only when they grew. */
const settle = (attempt: Attempt, revision: number, finalWords: readonly SpokenWord[]): Attempt => {
  if (finalWords.length === attempt.final.length) return { ...attempt, revision };
  const final = copy(finalWords);
  return { ...attempt, revision, final, finalAlignment: alignWords(attempt, 0, final) };
};

const recognize = (state: MatcherState, command: RecognitionCommand): MatcherState => {
  const { attempt } = state[inner];
  const { revision, finalWords, tentativeWords } = command;
  const accepted =
    !attempt.finished &&
    Number.isSafeInteger(revision) &&
    revision >= 0 &&
    revision > attempt.revision &&
    extendsFinal(attempt.final, finalWords) &&
    validWords([...finalWords, ...tentativeWords]);
  if (!accepted) return state;
  const settled = settle(attempt, revision, finalWords);
  const tentative = copy(tentativeWords);
  return stateOf({
    ...settled,
    tentative,
    tentativeAlignment: alignWords(settled, frontier(settled), tentative),
  });
};

const peek = (state: MatcherState, index: number): MatcherState => {
  const { attempt, view } = state[inner];
  if (!Number.isInteger(index) || view.marks[index]?.status !== 'miss') return state;
  return stateOf({ ...attempt, peeked: new Set([...attempt.peeked, index]) });
};

const finish = (state: MatcherState): MatcherState => {
  const { attempt } = state[inner];
  if (attempt.finished) return state;
  return stateOf({ ...attempt, finished: true, tentative: [], tentativeAlignment: NOTHING });
};

/**
 * The attempt after `command`. A recognition snapshot replaces the
 * tentative tail and may only extend the finalized words exactly, under a
 * revision above the last accepted one, with valid words and times; any
 * other snapshot, and any snapshot after finish, changes nothing. A peek
 * reveals one missed word and is remembered as help. Finish drops the
 * tentative tail, makes every unmatched word a miss and suggests a grade.
 */
export const updateMatcher = (state: MatcherState, command: Command): MatcherState => {
  switch (command.type) {
    case 'recognition':
      return recognize(state, command);
    case 'peek':
      return peek(state, command.index);
    case 'finish':
      return finish(state);
  }
};
