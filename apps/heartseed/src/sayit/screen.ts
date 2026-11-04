/**
 * Today's Say it as the screen draws it, read from Say it's view: whether
 * the button takes a press and what it says, the recital's marks (while one
 * is heard, and after one that finished) or the verse whole, how each word
 * of a recital shows and what the screen reader reads of it, the result of a
 * finished recital, and the alert after one that could not be heard. A
 * cancelled recital shows the verse whole and says nothing.
 */

import { Option } from 'effect';

import type { Mark, MatcherView } from '../matcher';
import { GRADE_NAMES, type DictationView, type Grade, type SayItView } from '../sayit';

/** The count, the suggestion and the grade chosen, after a recital that finished. */
export interface Result {
  /** `<lit> of <total> words`, and `, <n> peeked` once a word was peeked. */
  readonly summary: string;
  /** `Suggested: <name>`. */
  readonly suggested: string;
  readonly choice: Grade;
}

export interface Screen {
  readonly button: 'Say it' | 'Listening';
  /** The button takes a press: Say it is ready, and no recital is finishing. */
  readonly pressable: boolean;
  readonly listening: boolean;
  /** The recital's marks, or none for the verse whole. */
  readonly marks: Option.Option<readonly Mark[]>;
  readonly result: Option.Option<Result>;
  readonly alert: Option.Option<string>;
}

/** What a recital that could not be heard says, by how it ended. */
const ALERTS: Partial<Record<NonNullable<DictationView['ended']>, string>> = {
  denied: 'Heartseed can’t hear you yet. Allow the microphone and speech recognition in Settings.',
  unavailable: 'Speech recognition isn’t available on this iPhone right now.',
  interrupted: 'The recital was interrupted. Say it again when you’re ready.',
  failed: 'That recital didn’t come through. Say it again.',
};

/** How a word's text is drawn: lit, softly while it is being heard, in the mark's colour once peeked, or laid out unseen so that only its slot shows. */
export type Ink = 'lit' | 'hearing' | 'peeked' | 'unseen';

/**
 * One source word as a recital shows it: its text in an ink, or the mark of
 * a missed word to peek at. `hidden` keeps it from the screen reader;
 * `label` names it where its text does not.
 */
export type ShownWord =
  | {
      readonly _tag: 'Text';
      readonly index: number;
      readonly text: string;
      readonly ink: Ink;
      readonly hidden: boolean;
      readonly label: Option.Option<string>;
    }
  | { readonly _tag: 'Mark'; readonly index: number; readonly label: string };

const text = (mark: Mark, word: string, ink: Ink, hidden: boolean, label = Option.none<string>()) =>
  ({ _tag: 'Text', index: mark.index, text: word, ink, hidden, label }) as const;

/**
 * How the word at a mark shows: a lit word by its name, a word being heard
 * softly and an unsaid one unseen (each hidden from the screen reader), a
 * missed word as a numbered mark, and a peeked word by its name and `peeked`.
 */
export const wordOf = (mark: Mark, word: string): ShownWord => {
  switch (mark.status) {
    case 'matched':
      return text(mark, word, 'lit', false);
    case 'tentative':
      return text(mark, word, 'hearing', true);
    case 'pending':
      return text(mark, word, 'unseen', true);
    case 'peek':
      return text(mark, word, 'peeked', false, Option.some(`${word}, peeked`));
    case 'miss':
      return { _tag: 'Mark', index: mark.index, label: `Missed word ${mark.index + 1}` };
  }
};

const NOT_READY: Screen = {
  button: 'Say it',
  pressable: false,
  listening: false,
  marks: Option.none(),
  result: Option.none(),
  alert: Option.none(),
};

/** A recital's marks show while it is heard and after it finished. */
const marksOf = (view: DictationView): Option.Option<readonly Mark[]> => {
  const shown = view.status !== 'idle' || view.ended === 'finished';
  if (!shown) return Option.none();
  return Option.map(Option.fromNullishOr(view.matcher), (matcher) => matcher.marks);
};

/** The words lit of the words, and the peeks once there is one. */
const summaryOf = (heard: MatcherView) => {
  const lit = heard.marks.filter((mark) => mark.status === 'matched').length;
  const words = `${lit} of ${heard.marks.length} words`;
  if (heard.peekCount === 0) return words;
  return `${words}, ${heard.peekCount} peeked`;
};

const buttonOf = (listening: boolean): Screen['button'] => {
  if (listening) return 'Listening';
  return 'Say it';
};

const resultOf = (view: SayItView): Option.Option<Result> => {
  const { matcher, ended } = view.dictation;
  if (ended !== 'finished') return Option.none();
  return Option.flatMap(Option.fromNullishOr(matcher), (heard) =>
    Option.flatMap(Option.fromNullishOr(view.choice), (choice) =>
      Option.map(Option.fromNullishOr(heard.suggestedGrade), (suggested) => {
        const summary = summaryOf(heard);
        return { summary, suggested: `Suggested: ${GRADE_NAMES[suggested]}`, choice };
      }),
    ),
  );
};

const alertOf = (view: DictationView): Option.Option<string> => {
  if (view.status !== 'idle') return Option.none();
  return Option.flatMap(Option.fromNullishOr(view.ended), (ended) =>
    Option.fromNullishOr(ALERTS[ended]),
  );
};

export const screenOf = (view: Option.Option<SayItView>): Screen =>
  Option.match(view, {
    onNone: () => NOT_READY,
    onSome: (now) => {
      const listening = now.dictation.status !== 'idle';
      return {
        button: buttonOf(listening),
        pressable: now.dictation.status !== 'finishing',
        listening,
        marks: marksOf(now.dictation),
        result: resultOf(now),
        alert: alertOf(now.dictation),
      };
    },
  });
