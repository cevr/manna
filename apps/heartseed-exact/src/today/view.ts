/**
 * What Today's screen shows of a state, in the shapes `features/today.contract`
 * declares: every word as the cue draws it (its text, or its hidden form and
 * what the screen reader reads instead), its light and its mark, the help
 * taken and its cost, the grades a graded try may take, which controls are
 * enabled, what `next` would hand on and the result kept last. Exact's
 * option is `null` on the wire, so an absent value is `null` here and
 * nowhere else.
 */

import { matcherView } from '@manna/heartseed/matcher';
import type { Mark } from '@manna/heartseed/matcher';
import { cappedBy, GRADE_NAMES, GRADES } from '@manna/heartseed/sayit';
import { lettersOf } from '@manna/heartseed/sayit/letters';
import { Option } from 'effect';

import {
  canPeek,
  isResting,
  pendingOf,
  shownAll,
  type Grade,
  type Help,
  type Phase,
  type Recall,
  type TodayResult,
  type TodayState,
} from './step';

/**
 * How a word is drawn, as the current Heartseed's `Word` and `Unsaid` draw
 * it: its text, its first letter with the rest laid out unseen, an empty
 * slot its width, or a missed word's mark.
 */
export type WordFace = 'text' | 'letters' | 'slot' | 'mark';

interface WordView {
  readonly index: number;
  readonly text: string;
  readonly shown: string;
  readonly face: WordFace;
  readonly head: string;
  readonly letter: string;
  readonly tail: string;
  readonly label: string;
  readonly silent: boolean;
  readonly lit: boolean;
  readonly mark: string;
  readonly peekable: boolean;
  readonly peeked: boolean;
  readonly held: boolean;
}

/** A phrase the recognizer is told to expect, as `@exact/speech-recognition` takes it. */
interface Phrase {
  readonly phrase: string;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<number> is null on the wire.
  readonly boost: null;
}

interface GradeView {
  readonly grade: number;
  readonly name: string;
  readonly enabled: boolean;
  readonly chosen: boolean;
}

/** Help as the wire carries it: its peeks a fresh array, its Show all instant null before one. */
interface HelpView {
  readonly reference: string;
  readonly peeked: number[];
  // oxlint-disable-next-line effect/noNullish -- Exact's option<number> is null on the wire.
  readonly shownAt: number | null;
  readonly cap: Grade;
}

/** A recall as the wire carries it: the current Heartseed's, its zone's offset always there. */
type RecallView = Required<Recall>;

interface ResultView {
  readonly reference: string;
  readonly recall: RecallView;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<TodayHelp> is null on the wire.
  readonly help: HelpView | null;
}

export interface TodayView {
  readonly reference: string;
  readonly passage: string;
  readonly phrases: Phrase[];
  readonly phase: Phase;
  readonly cue: string;
  readonly words: WordView[];
  readonly lit: number;
  readonly canHear: boolean;
  readonly canSay: boolean;
  readonly canStop: boolean;
  readonly canFinish: boolean;
  readonly canShowAll: boolean;
  readonly canNext: boolean;
  readonly shownAll: boolean;
  readonly peeking: number;
  readonly peekKey: string;
  readonly cap: number;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<TodayHelp> is null on the wire.
  readonly help: HelpView | null;
  readonly helpLine: string;
  readonly moveBack: boolean;
  readonly summary: string;
  readonly suggested: string;
  readonly grades: GradeView[];
  // oxlint-disable-next-line effect/noNullish -- Exact's option<TodayResult> is null on the wire.
  readonly pending: ResultView | null;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<TodayResult> is null on the wire.
  readonly last: ResultView | null;
  readonly refused: boolean;
  /** The still press's timer key while a press waits for the hold's time; 0 else. */
  readonly holdKey: number;
  /** Whether a finger holds a word: the words keep it from the scroll (`touch-action`). */
  readonly holding: boolean;
  /** The held word, -1 with none. */
  readonly heldWord: number;
  /** What the hold last asked of the voice, and how many asks it made, so each is acted on once. */
  readonly ask: string;
  readonly askKey: number;
  /** Whether a read on from a held word waits for its utterance. */
  readonly seeking: boolean;
  /** The text a read on from the held word speaks: the passage from its start. */
  readonly seekText: string;
}

// oxlint-disable-next-line effect/noNullish -- Exact's option is null on the wire.
const ABSENT: null = Option.getOrNull(Option.none());

/** A word drawn in first letters: its first letter or number as written, the current Heartseed's own rule (`lettersOf`). */
export const initialOf = (word: string): string => lettersOf(word).cue;

/** The longest slot, in rules: a long word's slot fits a phone's line at the largest text size. */
const SLOT_MOST = 8;

/** A word the cue hides drawn with no cue: a slot of one rule per character, at most `SLOT_MOST`, nothing of its letters. */
const slotOf = (word: string): string => '_'.repeat(Math.min(SLOT_MOST, [...word].length));

/** The word as `cue` draws it while hidden. */
export const hiddenOf = (word: string, cue: string): string => {
  if (cue === 'full') return word;
  if (cue === 'initials') return initialOf(word);
  return slotOf(word);
};

const helpWire = (help: Help): HelpView => ({
  reference: help.reference,
  peeked: [...help.peeked],
  shownAt: help.shownAt,
  cap: help.cap,
});

const recallWire = (recall: Recall): RecallView => ({
  ...recall,
  offset: Option.getOrElse(Option.fromNullishOr(recall.offset), () => 0),
});

/** A result as the wire and the kept file carry it. */
export const resultWire = (result: TodayResult): ResultView => ({
  reference: result.reference,
  recall: recallWire(result.recall),
  help: Option.getOrNull(Option.map(result.help, helpWire)),
});

/** The verse's distinct words, lowercase, letters and numbers alone, in first-seen order: the recognizer's hints. */
const phrasesOf = (words: readonly string[]): Phrase[] =>
  [...new Set(words.map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')))]
    .filter((phrase) => phrase.length > 0)
    .map((phrase) => ({ phrase, boost: ABSENT }));

/** The `index`th word's mark, shown only while saying and once graded; '' when none is shown. */
const markOf = (state: TodayState, marks: readonly Mark[], index: number): string => {
  if (state.phase !== 'listening' && state.phase !== 'graded') return '';
  return marks
    .slice(index, index + 1)
    .map((mark) => mark.status)
    .join('');
};

/** How far the words read: up to the held word while one is held, as the current app's reading view reads to it, else as far as the voice reached. */
const readTo = (state: TodayState): number =>
  Option.getOrElse(state.hold.held, () => state.reached);

/** Whether a word shows its text: the cue shows it, it is peeked now, Show all was used, the matcher marked it, the voice lights it while reading, or a finger holds it. */
const showsText = (state: TodayState, index: number, mark: string): boolean =>
  state.cue === 'full' ||
  shownAll(state) ||
  Option.contains(state.peeking, index) ||
  (mark !== '' && mark !== 'pending') ||
  (state.phase === 'reading' && index < readTo(state)) ||
  Option.contains(state.hold.held, index);

/** What the screen reader reads of a hidden word: its letter in first letters, else its place. */
const hiddenLabel = (word: string, index: number, cue: string): string => {
  if (cue === 'initials') return initialOf(word);
  return `Word ${index + 1}`;
};

/** What a word draws and what the screen reader reads of it. */
const faceOf = (state: TodayState, text: string, index: number, shows: boolean) => {
  if (shows) return { shown: text, label: text };
  return { shown: hiddenOf(text, state.cue), label: hiddenLabel(text, index, state.cue) };
};

/** How a word is drawn: a missed word as its mark, a word shown as its text, else as the cue hides it. */
const drawnAs = (state: TodayState, shows: boolean, mark: string): WordFace => {
  if (mark === 'miss') return 'mark';
  if (shows) return 'text';
  if (state.cue === 'initials') return 'letters';
  return 'slot';
};

const wordOf = (
  state: TodayState,
  marks: readonly Mark[],
  text: string,
  index: number,
): WordView => {
  const mark = markOf(state, marks, index);
  const shows = showsText(state, index, mark);
  const peekable = canPeek(state);
  const letters = lettersOf(text);
  return {
    index,
    text,
    ...faceOf(state, text, index, shows),
    face: drawnAs(state, shows, mark),
    head: letters.before,
    letter: letters.cue,
    tail: letters.after,
    silent: !shows && !peekable && state.cue === 'none',
    lit: index < readTo(state),
    mark,
    peekable,
    peeked: Option.contains(state.peeking, index),
    held: Option.contains(state.hold.held, index),
  };
};

/** The cost the help puts on the try, in words; '' with none taken. */
const helpLineOf = (help: Option.Option<Help>): string =>
  Option.match(help, {
    onNone: () => '',
    onSome: (taken) => {
      const best = GRADE_NAMES[taken.cap];
      if (Option.isSome(Option.fromNullishOr(taken.shownAt)))
        return `Shown whole: this try counts as ${best} at best, and the verse moves back a stage.`;
      if (taken.peeked.length === 1) return `1 word peeked: this try counts as ${best} at best.`;
      return `${taken.peeked.length} words peeked: this try counts as ${best} at best.`;
    },
  });

const gradesOf = (state: TodayState): GradeView[] => {
  if (state.phase !== 'graded') return [];
  return GRADES.map((grade: Grade) => ({
    grade,
    name: GRADE_NAMES[grade],
    enabled: cappedBy(grade, state.help) === grade,
    chosen: Option.contains(state.choice, grade),
  }));
};

const summaryOf = (pending: Option.Option<TodayResult>): string =>
  Option.match(pending, {
    onNone: () => '',
    onSome: ({ recall }) => {
      const words = `${recall.words - recall.missed} of ${recall.words} words`;
      if (recall.peeked === 0) return words;
      return `${words}, ${recall.peeked} peeked`;
    },
  });

const suggestedOf = (pending: Option.Option<TodayResult>, help: Option.Option<Help>): string =>
  Option.match(pending, {
    onNone: () => '',
    onSome: ({ recall }) => `Suggested: ${GRADE_NAMES[cappedBy(recall.suggested, help)]}`,
  });

/** The timer key of a press waiting for the hold's time; 0 else. */
const holdKeyOf = (state: TodayState): number => {
  const { contact } = state.hold;
  if (contact._tag !== 'pressing') return 0;
  return contact.key;
};

/** The screen of `state`. */
export const view = (state: TodayState): TodayView => {
  const marks = matcherView(state.matcher).marks;
  const words = state.spans.map((span, index) =>
    wordOf(state, marks, state.passage.text.slice(span.from, span.to), index),
  );
  const pending = pendingOf(state);
  return {
    reference: state.passage.reference,
    passage: state.passage.text,
    phrases: phrasesOf(words.map((word) => word.text)),
    phase: state.phase,
    cue: state.cue,
    words,
    lit: state.reached,
    canHear: isResting(state),
    canSay: isResting(state),
    canStop: state.phase === 'reading',
    canFinish: state.phase === 'listening',
    canShowAll: canPeek(state),
    canNext: Option.isSome(pending),
    shownAll: shownAll(state),
    peeking: Option.getOrElse(state.peeking, () => -1),
    peekKey: `${state.peeks}`,
    cap: cappedBy(4, state.help),
    help: Option.getOrNull(Option.map(state.help, helpWire)),
    helpLine: helpLineOf(state.help),
    moveBack: shownAll(state),
    summary: summaryOf(pending),
    suggested: suggestedOf(pending, state.help),
    grades: gradesOf(state),
    pending: Option.getOrNull(Option.map(pending, resultWire)),
    last: Option.getOrNull(Option.map(state.last, resultWire)),
    refused: state.refused,
    holdKey: holdKeyOf(state),
    holding: state.hold.contact._tag === 'held',
    heldWord: Option.getOrElse(state.hold.held, () => -1),
    ask: state.ask,
    askKey: state.asks,
    seeking: state.phase === 'reading' && state.utterance === '',
    seekText: state.passage.text.slice(state.from),
  };
};
