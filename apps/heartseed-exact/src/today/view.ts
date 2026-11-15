/**
 * What Today's screen shows of a state, in the shapes `features/today.contract`
 * declares: every word with its light and its mark, which controls are
 * enabled, the recall just made and the one kept. Exact's option is `null`
 * on the wire, so an absent recall is `null` here and nowhere else.
 */

import { matcherView } from '@manna/heartseed/matcher';
import type { Mark } from '@manna/heartseed/matcher';

import { isIdle, type Maybe, type Phase, type Recall, type TodayState } from './step';

interface WordView {
  readonly index: number;
  readonly text: string;
  readonly lit: boolean;
  readonly mark: string;
}

/** A phrase the recognizer is told to expect, as `@exact/speech-recognition` takes it. */
interface Phrase {
  readonly phrase: string;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<number> is null on the wire.
  readonly boost: null;
}

export interface TodayView {
  readonly reference: string;
  readonly passage: string;
  readonly phrases: Phrase[];
  readonly phase: Phase;
  readonly words: WordView[];
  readonly lit: number;
  readonly canHear: boolean;
  readonly canSay: boolean;
  readonly canStop: boolean;
  readonly canFinish: boolean;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<Recall> is null on the wire.
  readonly result: Recall | null;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<Recall> is null on the wire.
  readonly last: Recall | null;
  readonly refused: boolean;
}

// oxlint-disable-next-line effect/noNullish -- Exact's option is null on the wire.
const wire = (recall: Maybe<Recall>): Recall | null => {
  if (recall._tag === 'Some') return { right: recall.value.right, total: recall.value.total };
  // oxlint-disable-next-line effect/noNullish -- Exact's option is null on the wire.
  return null;
};

/** The verse's distinct words, lowercase, letters and numbers alone, in first-seen order: the recognizer's hints. */
const phrasesOf = (words: readonly string[]): Phrase[] =>
  [...new Set(words.map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')))]
    .filter((phrase) => phrase.length > 0)
    // oxlint-disable-next-line effect/noNullish -- Exact's option<number> is null on the wire.
    .map((phrase) => ({ phrase, boost: null }));

/** The `index`th word's mark, shown only while saying and once graded; '' when none is shown. */
const markOf = (state: TodayState, marks: readonly Mark[], index: number): string => {
  if (state.phase !== 'listening' && state.phase !== 'graded') return '';
  return marks
    .slice(index, index + 1)
    .map((mark) => mark.status)
    .join('');
};

/** The screen of `state`. */
export const view = (state: TodayState): TodayView => {
  const marks = matcherView(state.matcher).marks;
  const words = state.spans.map((span, index): WordView => ({
    index,
    text: state.passage.text.slice(span.from, span.to),
    lit: index < state.reached,
    mark: markOf(state, marks, index),
  }));
  return {
    reference: state.passage.reference,
    passage: state.passage.text,
    phrases: phrasesOf(words.map((word) => word.text)),
    phase: state.phase,
    words,
    lit: state.reached,
    canHear: isIdle(state),
    canSay: isIdle(state),
    canStop: state.phase === 'reading',
    canFinish: state.phase === 'listening',
    result: wire(state.result),
    last: wire(state.last),
    refused: state.refused,
  };
};
