/**
 * Today's screen as one pure reducer: the reader hears the passage read
 * with each word lit as the voice reaches it, recites it while the matcher
 * marks each word heard, and finishes into a recall that is kept as the
 * last one. Every native event is an input naming its utterance or
 * recognition, and an input for any other id changes nothing. `step` is
 * the only rule; the view (`view.ts`) and the Contract screen only show it.
 */

import { createMatcher, matcherView, updateMatcher } from '@manna/heartseed/matcher';
import type { MatcherState, SpokenWord } from '@manna/heartseed/matcher';

/** Today's passage: its reference and the verse as Heartseed shows it. */
export interface Passage {
  readonly reference: string;
  readonly text: string;
}

/** A recall: how many of the passage's words were said right, of how many. */
export interface Recall {
  readonly right: number;
  readonly total: number;
}

/** A value that may be absent. */
export type Maybe<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };

export const none: Maybe<never> = { _tag: 'None' };

export const some = <A>(value: A): Maybe<A> => ({ _tag: 'Some', value });

export type Phase = 'resting' | 'reading' | 'listening' | 'graded';

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
  readonly recognition: string;
  readonly reached: number;
  readonly finals: string;
  readonly tentative: string;
  readonly revision: number;
  readonly matcher: MatcherState;
  readonly result: Maybe<Recall>;
  readonly last: Maybe<Recall>;
  readonly refused: boolean;
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
  | { readonly _tag: 'say'; readonly recognition: string }
  | {
      readonly _tag: 'heard';
      readonly recognition: string;
      readonly transcript: string;
      readonly final: boolean;
    }
  | { readonly _tag: 'finish' }
  | { readonly _tag: 'denied' }
  | { readonly _tag: 'loaded'; readonly recall: Maybe<Recall> };

const LETTER = /[\p{L}\p{N}]/u;

/** The passage's words as the matcher counts them (whitespace runs holding a letter or number), each as its span. */
const spansOf = (text: string): readonly WordSpan[] =>
  [...text.matchAll(/\S+/gu)]
    .filter((run) => LETTER.test(run[0]))
    .map((run): WordSpan => ({ from: run.index, to: run.index + run[0].length }));

/** Today at rest before anything is heard or said: no recall yet, nothing kept. */
export const initial = (passage: Passage): TodayState => ({
  passage,
  spans: spansOf(passage.text),
  phase: 'resting',
  utterance: '',
  recognition: '',
  reached: 0,
  finals: '',
  tentative: '',
  revision: 0,
  matcher: createMatcher(passage.text),
  result: none,
  last: none,
  refused: false,
});

/** Whether a new reading or recital may begin: nothing is under way. */
export const isIdle = (state: TodayState): boolean =>
  state.phase === 'resting' || state.phase === 'graded';

/** The recognizer's text as the matcher's spoken words (each whitespace run's text), timed by their place from `from` on. */
const spoken = (text: string, from: number): readonly SpokenWord[] =>
  text
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word, index) => ({ text: word, start: from + index, end: from + index + 1 }));

/** The words the voice's range `[charIndex, charIndex + charLength)` overlaps lit, with every word before them. */
const onVoice = (state: TodayState, charIndex: number, charLength: number): TodayState => {
  const fits =
    Number.isInteger(charIndex) &&
    Number.isInteger(charLength) &&
    charIndex >= 0 &&
    charLength >= 1 &&
    charIndex + charLength <= state.passage.text.length;
  if (!fits) return state;
  const end = charIndex + charLength;
  const touched = state.spans
    .map((span, index) => ({ overlaps: span.from < end && charIndex < span.to, count: index + 1 }))
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

const onFinish = (state: TodayState): TodayState => {
  const matcher = updateMatcher(state.matcher, { type: 'finish' });
  const marks = matcherView(matcher).marks;
  const recall = some({
    right: marks.filter((mark) => mark.status === 'matched').length,
    total: marks.length,
  });
  return { ...state, phase: 'graded', recognition: '', matcher, result: recall, last: recall };
};

const reading = (state: TodayState, utterance: string): boolean =>
  state.phase === 'reading' && utterance === state.utterance;

const listening = (state: TodayState, recognition: string): boolean =>
  state.phase === 'listening' && recognition === state.recognition;

/** A recital that ends unfinished: the attempt is dropped and no recall is made. */
const unsaid = (state: TodayState): TodayState => ({
  ...state,
  phase: 'resting',
  recognition: '',
  finals: '',
  tentative: '',
  matcher: createMatcher(state.passage.text),
});

const onStop = (state: TodayState): TodayState => {
  if (state.phase === 'reading') return { ...state, phase: 'resting', utterance: '' };
  if (state.phase === 'listening') return unsaid(state);
  return state;
};

const onSay = (state: TodayState, recognition: string): TodayState => ({
  ...unsaid(state),
  phase: 'listening',
  recognition,
  reached: 0,
  revision: 0,
  result: none,
  refused: false,
});

/** A refusal while listening ends the recital unrecorded; at rest it is shown; a reading goes on. */
const onDenied = (state: TodayState): TodayState => {
  if (state.phase === 'reading') return state;
  if (state.phase === 'listening') return { ...unsaid(state), refused: true };
  return { ...state, refused: true };
};

/** Today after one input. */
export const step = (state: TodayState, input: TodayInput): TodayState => {
  switch (input._tag) {
    case 'hear':
      if (!isIdle(state) || input.utterance === '') return state;
      return { ...state, phase: 'reading', utterance: input.utterance, reached: 0, refused: false };
    case 'voice':
      if (!reading(state, input.utterance)) return state;
      return onVoice(state, input.charIndex, input.charLength);
    case 'voiceEnded':
      if (!reading(state, input.utterance)) return state;
      return onVoiceEnded(state, input.outcome);
    case 'stop':
      return onStop(state);
    case 'say':
      if (!isIdle(state) || input.recognition === '') return state;
      return onSay(state, input.recognition);
    case 'heard':
      if (!listening(state, input.recognition)) return state;
      return onHeard(state, input.transcript, input.final);
    case 'finish':
      if (state.phase !== 'listening') return state;
      return onFinish(state);
    case 'denied':
      return onDenied(state);
    case 'loaded':
      return { ...state, last: input.recall };
  }
};
