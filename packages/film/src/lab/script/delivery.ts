import { Array as Arr, Option } from 'effect';
import {
  HOLD_DEFAULT,
  type Mark,
  inOrder,
  isPause,
  paceBand,
  wordsAMinute,
} from '../../core/delivery.ts';
import type { StagingTake } from '../../core/api.ts';
import type { TakeWord } from '../../core/schema.ts';

export const HOLD_CHOICES: ReadonlyArray<number> = [0.4, HOLD_DEFAULT, 1, 1.5, 2, 3];

export type Gap =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Breath' }
  | { readonly _tag: 'Hold'; readonly seconds: number };

export const stressed = (marks: ReadonlyArray<Mark>, at: number): boolean =>
  marks.some((m) => m._tag === 'Stress' && m.word === at);

export const gapBefore = (marks: ReadonlyArray<Mark>, at: number): Gap =>
  Option.getOrElse(
    Arr.findFirst(marks, (m): Option.Option<Gap> => {
      if (m._tag === 'Breath' && m.before === at) return Option.some({ _tag: 'Breath' });
      if (m._tag === 'Hold' && m.before === at)
        return Option.some({ _tag: 'Hold', seconds: m.seconds });
      return Option.none();
    }),
    (): Gap => ({ _tag: 'None' }),
  );

export const stressToggled = (
  marks: ReadonlyArray<Mark>,
  from: number,
  to: number,
): ReadonlyArray<Mark> => {
  const words = Arr.range(from, to);
  const unstressed = marks.filter((m) => m._tag !== 'Stress' || m.word < from || m.word > to);
  if (words.every((w) => stressed(marks, w))) return unstressed;
  return inOrder([...unstressed, ...words.map((word): Mark => ({ _tag: 'Stress', word }))]);
};

export const gapSet = (marks: ReadonlyArray<Mark>, at: number, gap: Gap): ReadonlyArray<Mark> => {
  const rest = marks.filter((m) => !isPause(m) || m.before !== at);
  if (gap._tag === 'None') return rest;
  if (gap._tag === 'Breath') return inOrder([...rest, { _tag: 'Breath', before: at }]);
  return inOrder([...rest, { _tag: 'Hold', before: at, seconds: gap.seconds }]);
};

export const gapOpen = (at: number, words: number): boolean => at > 0 && at < words;

interface Pace {
  readonly wpm: number;
  readonly band: 'slow' | 'in' | 'fast';
}

export const paceOf = (words: ReadonlyArray<TakeWord>): Option.Option<Pace> =>
  Option.flatMap(
    Option.zipWith(Arr.head(words), Arr.last(words), (first, last) =>
      wordsAMinute(words.length, last.voiced.end - first.voiced.start),
    ),
    (wpm) => Option.map(wpm, (n) => ({ wpm: Math.round(n), band: paceBand(n) })),
  );

export const heardAt = (words: ReadonlyArray<TakeWord>, t: number): Option.Option<number> =>
  Arr.findLastIndex(words, (w) => w.voiced.start <= t);

export const spanOf = (
  words: ReadonlyArray<TakeWord>,
  from: number,
  to: number,
): Option.Option<{ readonly start: number; readonly end: number }> =>
  Option.zipWith(Arr.get(words, from), Arr.get(words, to), (first, last) => ({
    start: first.start,
    end: last.end,
  }));

export const retaken = (
  before: ReadonlyMap<string, StagingTake>,
  now: ReadonlyMap<string, StagingTake>,
): boolean =>
  Arr.some([...before], ([beat, was]) => {
    if (was._tag !== 'Ready') return false;
    return Option.exists(
      Option.fromUndefinedOr(now.get(beat)),
      (is) => is._tag !== 'Ready' || is.file !== was.file,
    );
  });
