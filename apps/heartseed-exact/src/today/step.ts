/**
 * Today's screen as one pure reducer: the reader hears the passage read
 * with each word lit as the voice reaches it, recites it under a cue while
 * the matcher marks each word heard, and grades the try. Before a try, at
 * rest, a word the cue hides may be peeked at (`peek`, shown until its
 * `peekEnded`) and the verse shown whole (`showAll`), each at the current
 * Heartseed's cost: the help (`Help`) caps the try's grade (`cappedBy`, a
 * peek at `PEEK_CAP`, Show all at the cap the caller gives), and stays with
 * the verse through every try until `next` hands the try on or `leave` lets
 * it go. Nothing is recorded until `next`: it alone yields a result
 * (`handedBy`), one per try, which is kept as the last one. Every native event
 * is an input naming its utterance or recognition, and an input for any
 * other id changes nothing. `step` is the only rule; the view (`view.ts`)
 * and the Contract screen only show it.
 */

import { createMatcher, matcherView, updateMatcher } from '@manna/heartseed/matcher';
import type { Cue, MatcherState, SpokenWord, SuggestedGrade } from '@manna/heartseed/matcher';
import {
  cappedBy,
  GRADES,
  PEEK_CAP,
  recallOf,
  restPeeks,
  type Grade,
  type Help,
  type Recall,
} from '@manna/heartseed/sayit';
import { PEEK_SHOWN_MS } from '@manna/heartseed/sayit/letters';
import { Match, Option } from 'effect';

import { holdStep, idleHold, type Ask, type ContactInput, type Hold } from './hold';

export type { Cue } from '@manna/heartseed/matcher';
export type { Grade, Help, Recall } from '@manna/heartseed/sayit';

/** Today's passage: its reference and the verse as Heartseed shows it. */
export interface Passage {
  readonly reference: string;
  readonly text: string;
}

/** What `next` hands on: the try's recall and the help taken on it, in the current Heartseed's shapes. */
export interface TodayResult {
  readonly reference: string;
  readonly recall: Recall;
  readonly help: Option.Option<Help>;
}

export type Phase = 'resting' | 'reading' | 'listening' | 'graded';

/** What the hold last asked of the voice: pause at its start, read on from a word at a lift, resume at a cancel; none before any. */
export type VoiceAsk = 'none' | 'pause' | 'seek' | 'resume';

/** How long a word peeked at rest shows, in milliseconds: the current Heartseed's own `PEEK_SHOWN_MS`. */
export const TODAY_PEEK_MS = PEEK_SHOWN_MS;

/** The best grade a try after Show all may take when the caller names none: Hard, a peek's cap. */
export const SHOWN_ALL_CAP: Grade = PEEK_CAP;

/** A word's UTF-16 span `[start, end)` in the passage's text. */
interface WordSpan {
  readonly from: number;
  readonly to: number;
}

export interface TodayState {
  readonly passage: Passage;
  readonly spans: readonly WordSpan[];
  readonly phase: Phase;
  readonly utterance: string;
  /** Where the utterance's text starts in the passage: 0 for Listen, the held word's start for a read on from it. */
  readonly from: number;
  readonly hold: Hold;
  readonly ask: VoiceAsk;
  /** How many asks the hold made, so each is acted on once. */
  readonly asks: number;
  readonly recognition: string;
  readonly reached: number;
  readonly finals: string;
  readonly tentative: string;
  readonly revision: number;
  readonly matcher: MatcherState;
  readonly refused: boolean;
  readonly cue: Cue;
  readonly shownAllCap: Grade;
  readonly help: Option.Option<Help>;
  readonly peeking: Option.Option<number>;
  readonly peeks: number;
  readonly startedAt: number;
  readonly offset: number;
  readonly choice: Option.Option<Grade>;
  readonly last: Option.Option<TodayResult>;
}

export type Outcome = 'end' | 'error';

export type TodayInput =
  | { readonly _tag: 'hear'; readonly utterance: string }
  | {
      readonly _tag: 'voice';
      readonly utterance: string;
      readonly charIndex: number;
      readonly charLength: number;
    }
  | { readonly _tag: 'voiceEnded'; readonly utterance: string; readonly outcome: Outcome }
  | { readonly _tag: 'stop' }
  | { readonly _tag: 'contact'; readonly contact: ContactInput }
  | { readonly _tag: 'sought'; readonly utterance: string }
  | {
      readonly _tag: 'say';
      readonly recognition: string;
      readonly at: number;
      readonly offset: number;
    }
  | {
      readonly _tag: 'heard';
      readonly recognition: string;
      readonly transcript: string;
      readonly final: boolean;
    }
  | { readonly _tag: 'finish' }
  | { readonly _tag: 'denied' }
  | { readonly _tag: 'loaded'; readonly last: Option.Option<TodayResult> }
  | { readonly _tag: 'cue'; readonly cue: Cue; readonly cap: Grade }
  | { readonly _tag: 'peek'; readonly index: number }
  | { readonly _tag: 'peekEnded'; readonly index: number }
  | { readonly _tag: 'showAll'; readonly at: number }
  | { readonly _tag: 'grade'; readonly grade: number }
  | { readonly _tag: 'next' }
  | { readonly _tag: 'again' }
  | { readonly _tag: 'leave' };

const LETTER = /[\p{L}\p{N}]/u;

/** The passage's words as the matcher counts them (whitespace runs holding a letter or number), each as its span. */
const spansOf = (text: string): readonly WordSpan[] =>
  [...text.matchAll(/\S+/gu)]
    .filter((run) => LETTER.test(run[0]))
    .map((run): WordSpan => ({ from: run.index, to: run.index + run[0].length }));

/** Today at rest before anything is heard or said, under no cue: no try yet, nothing kept. */
export const initial = (passage: Passage): TodayState => ({
  passage,
  spans: spansOf(passage.text),
  phase: 'resting',
  utterance: '',
  from: 0,
  hold: idleHold,
  ask: 'none',
  asks: 0,
  recognition: '',
  reached: 0,
  finals: '',
  tentative: '',
  revision: 0,
  matcher: createMatcher(passage.text),
  refused: false,
  cue: 'none',
  shownAllCap: SHOWN_ALL_CAP,
  help: Option.none(),
  peeking: Option.none(),
  peeks: 0,
  startedAt: 0,
  offset: 0,
  choice: Option.none(),
  last: Option.none(),
});

/** Whether a reading or a try may begin: nothing under way and no try waiting for its grade. */
export const isResting = (state: TodayState): boolean => state.phase === 'resting';

/** Whether a grade is one of FSRS's four. */
export const isGrade = (grade: number): grade is Grade => GRADES.some((each) => each === grade);

/** Whether `Show all` was taken on the verse. */
export const shownAll = (state: TodayState): boolean =>
  Option.exists(state.help, (help) => Option.isSome(Option.fromNullishOr(help.shownAt)));

/** Whether at rest the words the cue hides are buttons to peek at, and Show all is offered: under a cue that hides words, before Show all. */
export const canPeek = (state: TodayState): boolean =>
  isResting(state) && state.cue !== 'full' && !shownAll(state);

/** The recognizer's text as the matcher's spoken words (each whitespace run's text), timed by their place from `from` on. */
const spoken = (text: string, from: number): readonly SpokenWord[] =>
  text
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word, index) => ({ text: word, start: from + index, end: from + index + 1 }));

/**
 * The words the voice's range `[charIndex, charIndex + charLength)` overlaps
 * lit, with every word before them. The range is in the text the utterance
 * speaks, the passage from `from` on, so it fits within that text and lights
 * the passage's words over `[from + charIndex, from + charIndex + charLength)`.
 */
const onVoice = (state: TodayState, charIndex: number, charLength: number): TodayState => {
  const fits =
    Number.isInteger(charIndex) &&
    Number.isInteger(charLength) &&
    charIndex >= 0 &&
    charLength >= 1 &&
    charIndex + charLength <= state.passage.text.length - state.from;
  if (!fits) return state;
  const start = state.from + charIndex;
  const end = start + charLength;
  const touched = state.spans
    .map((span, index) => ({ overlaps: span.from < end && start < span.to, count: index + 1 }))
    .filter((word) => word.overlaps)
    .map((word) => word.count);
  return { ...state, reached: Math.max(state.reached, ...touched) };
};

const onVoiceEnded = (state: TodayState, outcome: Outcome): TodayState => {
  const rested = { ...state, phase: 'resting' as const, utterance: '' };
  if (outcome === 'end') return { ...rested, reached: state.spans.length };
  return rested;
};

/** The recognizer's report: a final result replaces the final text so far and empties the tail; any other is the tail. */
const saidOf = (state: TodayState, transcript: string, final: boolean) => {
  if (final) return { finals: transcript, tentative: '' };
  return { finals: state.finals, tentative: transcript };
};

const onHeard = (state: TodayState, transcript: string, final: boolean): TodayState => {
  const said = saidOf(state, transcript, final);
  const finalWords = spoken(said.finals, 0);
  const revision = state.revision + 1;
  const matcher = updateMatcher(state.matcher, {
    type: 'recognition',
    revision,
    finalWords,
    tentativeWords: spoken(said.tentative, finalWords.length),
  });
  return { ...state, ...said, revision, matcher };
};

/** A finished try: graded, the matcher's suggestion taken as the choice, no better than the help allows. */
const onFinish = (state: TodayState): TodayState => {
  const matcher = updateMatcher(state.matcher, { type: 'finish' });
  return {
    ...state,
    phase: 'graded',
    recognition: '',
    matcher,
    choice: Option.some(cappedBy(suggestionOf(matcher), state.help)),
  };
};

/** A finished attempt's suggested grade; Again for one that has none, which a finished attempt never is. */
const suggestionOf = (matcher: MatcherState): SuggestedGrade =>
  Option.getOrElse(
    Option.fromNullishOr(matcherView(matcher).suggestedGrade),
    (): SuggestedGrade => 1,
  );

/**
 * The recall the graded try would hand on under `choice`: the current
 * Heartseed's `recallOf` over the matcher's view at the try's start, the
 * grade no better than the help's cap, and the words peeked at rest that the
 * try did not peek again counted among its peeks.
 */
export const recallUnder = (state: TodayState, choice: Grade): Recall => {
  const heard = matcherView(state.matcher);
  const recall = recallOf(
    state.passage.reference,
    state.startedAt,
    state.offset,
    cappedBy(choice, state.help),
    suggestionOf(state.matcher),
    heard,
  );
  return { ...recall, peeked: recall.peeked + restPeeks(state.help, heard) };
};

/** What `next` would hand on now: the graded try's result, none before a try is graded. */
export const pendingOf = (state: TodayState): Option.Option<TodayResult> => {
  if (state.phase !== 'graded') return Option.none();
  return Option.map(state.choice, (choice) => ({
    reference: state.passage.reference,
    recall: recallUnder(state, choice),
    help: state.help,
  }));
};

const reading = (state: TodayState, utterance: string): boolean =>
  state.phase === 'reading' && utterance === state.utterance;

const listening = (state: TodayState, recognition: string): boolean =>
  state.phase === 'listening' && recognition === state.recognition;

/** A try that ends unrecorded: back at rest, its words unheard and its grade gone; the help taken stays with the verse. */
const unsaid = (state: TodayState): TodayState => ({
  ...state,
  phase: 'resting',
  recognition: '',
  finals: '',
  tentative: '',
  revision: 0,
  matcher: createMatcher(state.passage.text, state.cue),
  choice: Option.none(),
});

const onStop = (state: TodayState): TodayState => {
  if (state.phase === 'reading') return { ...state, phase: 'resting', utterance: '' };
  if (state.phase === 'listening') return unsaid(state);
  return state;
};

/** `help` with its Show all at least a millisecond before a try started at `at`, as the current Heartseed keeps it. */
const before = (help: Help, at: number): Help => {
  const shown = Option.fromNullishOr(help.shownAt);
  if (Option.isNone(shown) || shown.value < at) return help;
  return { ...help, shownAt: at - 1 };
};

const onSay = (state: TodayState, recognition: string, at: number, offset: number): TodayState => ({
  ...unsaid(state),
  phase: 'listening',
  recognition,
  reached: 0,
  refused: false,
  peeking: Option.none(),
  startedAt: at,
  offset,
  help: Option.map(state.help, (help) => before(help, at)),
});

/** A refusal while listening ends the try unrecorded; at rest it is shown; a reading goes on. */
const onDenied = (state: TodayState): TodayState => {
  if (state.phase === 'reading') return state;
  if (state.phase === 'listening') return { ...unsaid(state), refused: true };
  return { ...state, refused: true };
};

/** The help on the verse after `change`: a fresh one, capped at Easy, when none was taken. */
const helpWith = (state: TodayState, change: (was: Help) => Help): Option.Option<Help> => {
  const was = Option.getOrElse(state.help, (): Help => ({
    reference: state.passage.reference,
    peeked: [],
    shownAt: Option.getOrNull(Option.none()),
    cap: 4,
  }));
  return Option.some(change(was));
};

/** A peek at rest at a word the cue hides: shown until its `peekEnded`, and the try capped at Hard. */
const onPeek = (state: TodayState, index: number): TodayState => {
  if (!canPeek(state) || !Number.isInteger(index) || index < 0 || index >= state.spans.length)
    return state;
  return {
    ...state,
    peeking: Option.some(index),
    peeks: state.peeks + 1,
    help: helpWith(state, (was) => ({
      ...was,
      peeked: [...new Set([...was.peeked, index])],
      cap: cappedBy(PEEK_CAP, Option.some(was)),
    })),
  };
};

const onPeekEnded = (state: TodayState, index: number): TodayState => {
  if (!Option.contains(state.peeking, index)) return state;
  return { ...state, peeking: Option.none() };
};

/** Show all at rest: every word counted peeked, the instant kept for the step back the result owes, and the try capped at the caller's cap. */
const onShowAll = (state: TodayState, at: number): TodayState => {
  if (!canPeek(state) || !Number.isFinite(at)) return state;
  return {
    ...state,
    peeking: Option.none(),
    help: helpWith(state, (was) => ({
      ...was,
      peeked: state.spans.map((_, index) => index),
      shownAt: at,
      cap: cappedBy(state.shownAllCap, Option.some(was)),
    })),
  };
};

const onGrade = (state: TodayState, grade: number): TodayState => {
  if (state.phase !== 'graded' || !isGrade(grade)) return state;
  if (cappedBy(grade, state.help) !== grade) return state;
  return { ...state, choice: Option.some(grade) };
};

/** Next on a graded try: its result handed on and kept as the last; the help let go. */
const onNext = (state: TodayState): TodayState => {
  const result = pendingOf(state);
  if (Option.isNone(result)) return state;
  return {
    ...unsaid(state),
    help: Option.none(),
    last: result,
  };
};

const onCue = (state: TodayState, cue: Cue, cap: Grade): TodayState => {
  if (!isResting(state)) return state;
  return { ...state, cue, shownAllCap: cap, peeking: Option.none() };
};

/** Leaving Today at rest or graded: the try and the help let go, nothing handed on. */
const onLeave = (state: TodayState): TodayState => {
  if (state.phase !== 'resting' && state.phase !== 'graded') return state;
  return { ...unsaid(state), help: Option.none(), peeking: Option.none() };
};

/** Say it again on a graded try: the try let go unrecorded; the help taken stays with the verse. */
const onAgain = (state: TodayState): TodayState => {
  if (state.phase !== 'graded') return state;
  return unsaid(state);
};

const onHear = (state: TodayState, utterance: string): TodayState => {
  if (!isResting(state) || utterance === '') return state;
  return {
    ...state,
    phase: 'reading',
    utterance,
    from: 0,
    reached: 0,
    refused: false,
    peeking: Option.none(),
  };
};

/** What the hold's `ask` makes of the reading: a pause or a resume only asks; a seek to word `k` ends the utterance and lights the words before `k`, its read on from `k`'s start waiting for its id (`sought`). */
const onAsk = (state: TodayState, ask: Ask): TodayState => {
  const asked = { ...state, asks: state.asks + 1 };
  if (ask._tag === 'Hold') return { ...asked, ask: 'pause' };
  if (ask._tag === 'LetGo') return { ...asked, ask: 'resume' };
  return Option.match(Option.fromUndefinedOr(state.spans[ask.word]), {
    onNone: () => ({ ...asked, ask: 'resume' as const }),
    onSome: (span) => ({
      ...asked,
      ask: 'seek' as const,
      utterance: '',
      from: span.from,
      reached: ask.word,
    }),
  });
};

/** A contact on the words: the hold's step, while a reading is under way or not, and its ask made of the reading. */
const onContact = (state: TodayState, contact: ContactInput): TodayState => {
  const next = holdStep(state.hold, contact, state.phase === 'reading');
  const held = { ...state, hold: next.hold };
  return Option.match(next.ask, { onNone: () => held, onSome: (ask) => onAsk(held, ask) });
};

/** The read on from a held word took its id: the reading follows it. */
const onSought = (state: TodayState, utterance: string): TodayState => {
  if (state.phase !== 'reading' || state.utterance !== '' || utterance === '') return state;
  return { ...state, utterance };
};

/** Once no reading is under way, a hold or a press on the words is dropped, asking nothing. */
const settled = (state: TodayState): TodayState => {
  const { contact, held } = state.hold;
  const live = contact._tag === 'pressing' || contact._tag === 'held' || Option.isSome(held);
  if (state.phase === 'reading' || !live) return state;
  return { ...state, hold: holdStep(state.hold, { _tag: 'gone' }, false).hold };
};

/** Today after one input, before a hold is dropped with its reading. */
const stepped = (state: TodayState, input: TodayInput): TodayState =>
  Match.valueTags(input, {
    contact: ({ contact }) => onContact(state, contact),
    sought: ({ utterance }) => onSought(state, utterance),
    hear: ({ utterance }) => onHear(state, utterance),
    voice: ({ utterance, charIndex, charLength }) => {
      if (!reading(state, utterance)) return state;
      return onVoice(state, charIndex, charLength);
    },
    voiceEnded: ({ utterance, outcome }) => {
      if (!reading(state, utterance)) return state;
      return onVoiceEnded(state, outcome);
    },
    stop: () => onStop(state),
    say: ({ recognition, at, offset }) => {
      if (!isResting(state) || recognition === '' || !Number.isFinite(at)) return state;
      return onSay(state, recognition, at, offset);
    },
    heard: ({ recognition, transcript, final }) => {
      if (!listening(state, recognition)) return state;
      return onHeard(state, transcript, final);
    },
    finish: () => {
      if (state.phase !== 'listening') return state;
      return onFinish(state);
    },
    denied: () => onDenied(state),
    loaded: ({ last }) => ({ ...state, last }),
    cue: ({ cue, cap }) => onCue(state, cue, cap),
    peek: ({ index }) => onPeek(state, index),
    peekEnded: ({ index }) => onPeekEnded(state, index),
    showAll: ({ at }) => onShowAll(state, at),
    grade: ({ grade }) => onGrade(state, grade),
    next: () => onNext(state),
    again: () => onAgain(state),
    leave: () => onLeave(state),
  });

/** Today after one input. */
export const step = (state: TodayState, input: TodayInput): TodayState =>
  settled(stepped(state, input));

/** The result `input` handed on in going from `before` to `after`: the try's, for a `next` that took; none for every other step. */
export const handedBy = (
  before: TodayState,
  input: TodayInput,
  after: TodayState,
): Option.Option<TodayResult> => {
  if (input._tag !== 'next' || after === before) return Option.none();
  return after.last;
};
