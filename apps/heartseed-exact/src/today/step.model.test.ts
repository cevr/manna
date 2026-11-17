/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/preferMatchTagsExhaustive, effect/preferPredicateIsTagged -- the model is one plain switch over every input, as a reader checks it against the spec, it reads the view's nulls, and a broken rule throws naming its seed and history as JSON. */

/**
 * `step` against a reference model of Today written here, over seeded
 * histories of every input: events of the current, a past and a never-seen
 * utterance or recognition, voice ranges of every form, transcripts of the
 * verse's words with drops and noise, cues and Show-all caps, peeks at
 * words in and out of the verse (whole, fractional, negative, past its end)
 * and their endings, stale or not, Show all at any instant, grades in and
 * out of FSRS's four, Next, Say it again, leaving, and saved results loaded
 * at any time. After each step the view must agree with the model, and the
 * spec's invariants hold on the view itself: a word's text shows exactly
 * when the cue, a peek now, Show all, the matcher's mark or the voice's
 * light shows it; a try peeked at can take and be offered nothing above
 * Hard, one shown whole nothing above its cap; `next` alone yields a result,
 * one per try, the recall and help the try saw; `again` and `leave` yield
 * none; a refused input changes nothing.
 */

import { describe, expect, it } from 'bun:test';
import { createMatcher, matcherView, updateMatcher } from '@manna/heartseed/matcher';
import type { Cue, MatcherState } from '@manna/heartseed/matcher';
import { readPassage } from '@manna/heartseed/passage';
import { Option } from 'effect';

import { seeded, type Random } from '../test/random';
import {
  handedBy,
  initial,
  step,
  type Grade,
  type TodayInput,
  type TodayResult,
  type TodayState,
} from './step';
import { view, type TodayView } from './view';

const HISTORIES = 200;
const STEPS = 40;
const passage = readPassage();
const text = passage.text;
const NAMES = ['Again', 'Hard', 'Good', 'Easy'];
const LETTER = /[\p{L}\p{N}]/u;

/** The model's words: the verse split at spaces, each with where it starts and ends. */
const words = text.split(' ').reduce<{ start: number; end: number }[]>((spans, word) => {
  const start = spans.length === 0 ? 0 : (spans.at(-1)?.end ?? 0) + 1;
  spans.push({ start, end: start + word.length });
  return spans;
}, []);
const wordText = (index: number) => text.slice(words[index]!.start, words[index]!.end);

type Phase = 'resting' | 'reading' | 'listening' | 'graded';

interface Help {
  readonly peeked: readonly number[];
  readonly shownAt: number | null;
  readonly cap: number;
}

interface Model {
  readonly phase: Phase;
  readonly utterance: string;
  readonly recognition: string;
  readonly lit: number;
  readonly finals: string;
  readonly heard: number;
  readonly matcher: MatcherState;
  readonly refused: boolean;
  readonly cue: Cue;
  readonly allCap: number;
  readonly help: Help | null;
  readonly peeking: number | null;
  readonly startedAt: number;
  readonly offset: number;
  readonly choice: number | null;
  readonly last: unknown;
}

const start: Model = {
  phase: 'resting',
  utterance: '',
  recognition: '',
  lit: 0,
  finals: '',
  heard: 0,
  matcher: createMatcher(text),
  refused: false,
  cue: 'none',
  allCap: 2,
  help: null,
  peeking: null,
  startedAt: 0,
  offset: 0,
  choice: null,
  last: null,
};

const timed = (said: string, from: number) =>
  said
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word, index) => ({ text: word, start: from + index, end: from + index + 1 }));

/** The try let go: at rest, nothing heard, no grade; the help stays. */
const unsaid = (model: Model): Model => ({
  ...model,
  phase: 'resting',
  recognition: '',
  finals: '',
  heard: 0,
  matcher: createMatcher(text, model.cue),
  choice: null,
});

const capOf = (model: Model) => model.help?.cap ?? 4;

const hidesWords = (model: Model) =>
  model.phase === 'resting' && model.cue !== 'full' && model.help?.shownAt == null;

/** The result Next hands on, in the wire's form: the recall's counts by the model's own reading of the marks. */
const resultOf = (model: Model) => {
  const shown = matcherView(model.matcher);
  const grade = Math.min(model.choice ?? 1, capOf(model));
  return {
    reference: passage.reference,
    recall: {
      reference: passage.reference,
      startedAt: model.startedAt,
      offset: model.offset,
      grade,
      suggested: shown.suggestedGrade,
      words: shown.marks.length,
      missed: shown.marks.filter((mark) => mark.status === 'miss').length,
      peeked: model.help?.peeked.length ?? 0,
      extra: shown.extraWordCount,
    },
    help:
      model.help === null
        ? null
        : {
            reference: passage.reference,
            peeked: [...model.help.peeked],
            shownAt: model.help.shownAt,
            cap: model.help.cap,
          },
  };
};

const modelStep = (model: Model, input: TodayInput): Model => {
  switch (input._tag) {
    case 'hear':
      return model.phase === 'resting' && input.utterance !== ''
        ? {
            ...model,
            phase: 'reading',
            utterance: input.utterance,
            lit: 0,
            refused: false,
            peeking: null,
          }
        : model;
    case 'voice': {
      const { charIndex: from, charLength: length } = input;
      const fits =
        Number.isInteger(from) &&
        Number.isInteger(length) &&
        from >= 0 &&
        length > 0 &&
        from + length <= text.length;
      if (model.phase !== 'reading' || input.utterance !== model.utterance || !fits) return model;
      const touched = words.filter((word) => word.start < from + length && from < word.end);
      const reached = touched.length === 0 ? 0 : words.indexOf(touched.at(-1) ?? words[0]!) + 1;
      return { ...model, lit: Math.max(model.lit, reached) };
    }
    case 'voiceEnded':
      if (model.phase !== 'reading' || input.utterance !== model.utterance) return model;
      return {
        ...model,
        phase: 'resting',
        utterance: '',
        lit: input.outcome === 'end' ? words.length : model.lit,
      };
    case 'stop':
      if (model.phase === 'reading') return { ...model, phase: 'resting', utterance: '' };
      return model.phase === 'listening' ? unsaid(model) : model;
    case 'say': {
      if (model.phase !== 'resting' || input.recognition === '' || !Number.isFinite(input.at))
        return model;
      const help =
        model.help === null || model.help.shownAt === null || model.help.shownAt < input.at
          ? model.help
          : { ...model.help, shownAt: input.at - 1 };
      return {
        ...unsaid(model),
        phase: 'listening',
        recognition: input.recognition,
        lit: 0,
        refused: false,
        peeking: null,
        startedAt: input.at,
        offset: input.offset,
        help,
      };
    }
    case 'heard': {
      if (model.phase !== 'listening' || input.recognition !== model.recognition) return model;
      const finals = input.final ? input.transcript : model.finals;
      const finalWords = timed(finals, 0);
      const heard = model.heard + 1;
      const matcher = updateMatcher(model.matcher, {
        type: 'recognition',
        revision: heard,
        finalWords,
        tentativeWords: timed(input.final ? '' : input.transcript, finalWords.length),
      });
      return { ...model, finals, heard, matcher };
    }
    case 'finish': {
      if (model.phase !== 'listening') return model;
      const matcher = updateMatcher(model.matcher, { type: 'finish' });
      const suggested = matcherView(matcher).suggestedGrade ?? 1;
      return {
        ...model,
        phase: 'graded',
        recognition: '',
        matcher,
        choice: Math.min(suggested, capOf(model)),
      };
    }
    case 'denied':
      if (model.phase === 'reading') return model;
      return { ...(model.phase === 'listening' ? unsaid(model) : model), refused: true };
    case 'loaded':
      return { ...model, last: Option.getOrNull(Option.map(input.last, wireOf)) };
    case 'cue':
      return model.phase === 'resting'
        ? { ...model, cue: input.cue, allCap: input.cap, peeking: null }
        : model;
    case 'peek': {
      const { index } = input;
      if (!hidesWords(model) || !Number.isInteger(index) || index < 0 || index >= words.length)
        return model;
      const was = model.help ?? { peeked: [], shownAt: null, cap: 4 };
      return {
        ...model,
        peeking: index,
        help: {
          ...was,
          peeked: was.peeked.includes(index) ? was.peeked : [...was.peeked, index],
          cap: Math.min(was.cap, 2),
        },
      };
    }
    case 'peekEnded':
      return model.peeking === input.index ? { ...model, peeking: null } : model;
    case 'showAll': {
      if (!hidesWords(model) || !Number.isFinite(input.at)) return model;
      const was = model.help ?? { peeked: [], shownAt: null, cap: 4 };
      return {
        ...model,
        peeking: null,
        help: {
          peeked: words.map((_, index) => index),
          shownAt: input.at,
          cap: Math.min(was.cap, model.allCap),
        },
      };
    }
    case 'grade':
      return model.phase === 'graded' &&
        [1, 2, 3, 4].includes(input.grade) &&
        input.grade <= capOf(model)
        ? { ...model, choice: input.grade }
        : model;
    case 'next':
      if (model.phase !== 'graded') return model;
      return { ...unsaid(model), help: null, last: resultOf(model) };
    case 'again':
      return model.phase === 'graded' ? unsaid(model) : model;
    case 'leave':
      return model.phase === 'resting' || model.phase === 'graded'
        ? { ...unsaid(model), help: null, peeking: null }
        : model;
  }
};

/** A result as the wire carries it. */
const wireOf = (result: TodayResult) => ({
  reference: result.reference,
  recall: { ...result.recall, offset: result.recall.offset ?? 0 },
  help: Option.getOrNull(
    Option.map(result.help, (help) => ({ ...help, peeked: [...help.peeked] })),
  ),
});

const said = (random: Random) =>
  words
    .map((word) =>
      text
        .slice(word.start, word.end)
        .toLowerCase()
        .replace(/[^a-z]/g, ''),
    )
    .filter(() => random.chance(0.85))
    .map((word) => (random.chance(0.05) ? random.pick(['the', 'thigh', 'yeah', 'xq', '']) : word))
    .slice(0, random.below(words.length + 1))
    .join(' ');

const anId = (random: Random, prefix: string, current: string) =>
  random.chance(0.6) && current !== ''
    ? current
    : random.pick(['', `${prefix}1`, `${prefix}2`, `${prefix}3`]);

const anIndex = (random: Random, current: number | null) =>
  random.chance(0.3) && current !== null
    ? current
    : random.pick([random.below(words.length), -1, words.length, 0.5, Number.NaN]);

const aResult = (random: Random): TodayResult => {
  const total = random.below(50);
  const peeked = random.chance(0.5) ? [random.below(total + 1)] : [];
  return {
    reference: passage.reference,
    recall: {
      reference: passage.reference,
      startedAt: random.below(1e9),
      offset: -300,
      grade: random.pick([1, 2, 3, 4] as const),
      suggested: random.pick([1, 2, 3] as const),
      words: total,
      missed: random.below(total + 1),
      peeked: peeked.length,
      extra: random.below(3),
    },
    help: random.chance(0.5)
      ? Option.some({ reference: passage.reference, peeked, shownAt: null, cap: 2 as const })
      : Option.none(),
  };
};

const anInput = (random: Random, state: TodayState): TodayInput => {
  const word = random.pick(words);
  switch (random.below(19)) {
    case 16:
    case 17:
      return random.chance(0.5)
        ? { _tag: 'next' }
        : { _tag: 'say', recognition: 'r1', at: 2_000, offset: -300 };
    case 0:
      return { _tag: 'hear', utterance: anId(random, 'u', '') };
    case 1: {
      const from = random.below(text.length);
      const [charIndex, charLength] = random.pick([
        [word.start, word.end - word.start],
        [word.end, 1],
        [Math.max(0, word.start - 1), word.end - word.start + 1],
        [from, 1 + random.below(Math.min(20, text.length - from))],
        [random.pick([-1, 0.5, text.length, 3]), random.pick([0, -2, 1.5, 9999, 1])],
      ]);
      return {
        _tag: 'voice',
        utterance: anId(random, 'u', state.utterance),
        charIndex,
        charLength,
      };
    }
    case 2:
      return {
        _tag: 'voiceEnded',
        utterance: anId(random, 'u', state.utterance),
        outcome: random.chance(0.7) ? 'end' : 'error',
      };
    case 3:
      return random.chance(0.5) ? { _tag: 'stop' } : { _tag: 'denied' };
    case 4:
      return {
        _tag: 'say',
        recognition: anId(random, 'r', ''),
        at: random.pick([1_000 + random.below(1_000), 1_500, Number.NaN]),
        offset: random.pick([-300, -240, 330]),
      };
    case 5:
    case 6:
      return {
        _tag: 'heard',
        recognition: anId(random, 'r', state.recognition),
        transcript: said(random),
        final: random.chance(0.5),
      };
    case 7:
      return { _tag: 'finish' };
    case 8:
      return {
        _tag: 'loaded',
        last: random.chance(0.3) ? Option.none() : Option.some(aResult(random)),
      };
    case 9:
      return {
        _tag: 'cue',
        cue: random.pick(['none', 'initials', 'full'] as const),
        cap: random.pick([1, 2] as const),
      };
    case 10:
    case 11:
      return { _tag: 'peek', index: anIndex(random, Option.getOrNull(state.peeking)) };
    case 12:
      return { _tag: 'peekEnded', index: anIndex(random, Option.getOrNull(state.peeking)) };
    case 13:
      return random.chance(0.5)
        ? { _tag: 'showAll', at: random.pick([1_500, 2_500, Number.NaN]) }
        : { _tag: 'grade', grade: random.pick([0, 1, 2, 3, 4, 5, 2.5]) };
    case 14:
      return random.chance(0.6) ? { _tag: 'next' } : { _tag: 'again' };
    default:
      return random.chance(0.5) ? { _tag: 'leave' } : { _tag: 'finish' };
  }
};

const stale = (state: TodayState, input: TodayInput) =>
  ((input._tag === 'voice' || input._tag === 'voiceEnded') &&
    input.utterance !== state.utterance) ||
  (input._tag === 'heard' && input.recognition !== state.recognition);

const marksOf = (model: Model) =>
  model.phase === 'listening' || model.phase === 'graded'
    ? matcherView(model.matcher).marks.map((mark) => mark.status)
    : words.map(() => '');

/** Whether the model shows the word at `index` as its text. */
const showsText = (model: Model, index: number, mark: string) =>
  model.cue === 'full' ||
  (model.help !== null && model.help.shownAt !== null) ||
  model.peeking === index ||
  (mark !== '' && mark !== 'pending') ||
  (model.phase === 'reading' && index < model.lit);

/** The first rule a word of `after` breaks, or ''. */
const wordRule = (after: TodayView, model: Model): string => {
  const marks = marksOf(model);
  for (const word of after.words) {
    const own = wordText(word.index);
    if (word.text !== own) return `word ${word.index} is not the verse's`;
    if (showsText(model, word.index, marks[word.index] ?? '')) {
      if (word.shown !== own || word.label !== own) return `word ${word.index} hides its text`;
    } else if (model.cue === 'initials') {
      const letter = own.charAt(Math.max(0, own.search(LETTER)));
      if (word.shown !== letter || word.label !== letter)
        return `word ${word.index} is not its first letter`;
    } else if (LETTER.test(word.shown) || word.label.includes(own)) {
      return `word ${word.index} shows or reads its text while hidden`;
    }
    if (word.peekable !== hidesWords(model)) return `word ${word.index} peekable is wrong`;
  }
  return '';
};

/** The first rule the grades and the help break, or ''. */
const gradeRule = (after: TodayView, model: Model): string => {
  const cap = capOf(model);
  if (after.cap !== cap) return `cap ${after.cap}, model ${cap}`;
  if (model.help !== null && model.help.peeked.length > 0 && after.cap > 2)
    return 'a peeked try may take more than Hard';
  if (model.help?.shownAt != null && after.cap > model.allCap && after.cap > model.help.cap)
    return 'a try shown whole may take more than its cap';
  if (model.phase !== 'graded') return after.grades.length === 0 ? '' : 'grades offered ungraded';
  if (after.grades.some((grade) => grade.enabled !== grade.grade <= cap))
    return 'a grade above the cap is offered, or one under it refused';
  const chosen = after.grades.filter((grade) => grade.chosen).map((grade) => grade.grade);
  if (JSON.stringify(chosen) !== JSON.stringify([model.choice])) return 'chosen grade differs';
  const suggested = matcherView(model.matcher).suggestedGrade ?? 1;
  if (after.suggested !== `Suggested: ${NAMES[Math.min(suggested, cap) - 1]}`)
    return `suggested ${after.suggested} above the cap`;
  return '';
};

/** The first rule the history breaks after `input`, or ''. */
const broken = (
  before: TodayView,
  after: TodayView,
  model: Model,
  input: TodayInput,
  handed: Option.Option<TodayResult>,
  expected: ReturnType<typeof resultOf> | null,
): string => {
  if (after.phase !== model.phase) return `phase ${after.phase}, model ${model.phase}`;
  if (after.canStop && after.canFinish) return 'reading and listening at once';
  if (after.lit !== model.lit) return `lit ${after.lit}, model ${model.lit}`;
  if (after.lit > after.words.length) return `lit ${after.lit} past the verse`;
  if (before.phase === 'reading' && after.phase === 'reading' && after.lit < before.lit)
    return 'lit fell';
  if (after.words.some((word) => word.lit !== word.index < after.lit))
    return 'lit words are not the first `lit`';
  if (JSON.stringify(after.words.map((word) => word.mark)) !== JSON.stringify(marksOf(model)))
    return 'marks differ from the matcher fed the transcripts heard';
  if (after.cue !== model.cue) return 'cue differs';
  if (after.peeking !== (model.peeking ?? -1)) return 'peeking differs';
  const words = wordRule(after, model);
  if (words !== '') return words;
  const grades = gradeRule(after, model);
  if (grades !== '') return grades;
  if (JSON.stringify(after.last) !== JSON.stringify(model.last)) return 'last differs';
  if (after.refused !== model.refused) return 'refused differs';
  const helpOf = model.help === null ? null : { reference: passage.reference, ...model.help };
  if (JSON.stringify(after.help) !== JSON.stringify(helpOf)) return 'help differs';
  if (input._tag !== 'next' && Option.isSome(handed)) return `${input._tag} yielded a result`;
  if (input._tag === 'next' && before.phase === 'graded') {
    if (Option.isNone(handed)) return 'next on a graded try yielded nothing';
    if (JSON.stringify(wireOf(handed.value)) !== JSON.stringify(expected))
      return 'next yielded another recall or help than the try saw';
    if (JSON.stringify(after.last) !== JSON.stringify(expected)) return 'next did not keep it';
  }
  if (input._tag === 'next' && before.phase !== 'graded' && Option.isSome(handed))
    return 'next yielded a second result for one try';
  if (input._tag === 'leave' && before.phase !== 'listening' && before.phase !== 'reading') {
    if (after.help !== null) return 'leave kept the help';
    if (after.pending !== null) return 'leave kept the try';
  }
  if (input._tag === 'denied' && before.phase === 'listening') {
    if (after.phase !== 'resting' || !after.refused || after.pending !== null)
      return 'denied left listening or kept a try';
    if (JSON.stringify(after.last) !== JSON.stringify(before.last))
      return 'denied changed the last result';
  }
  return '';
};

/** A refused input whose `step` must hand back the same state: a stale id, or a peek of a word the matcher marked. */
const changesNothing = (state: TodayState, input: TodayInput) => {
  if (stale(state, input)) return true;
  if (input._tag !== 'peek') return false;
  const mark = view(state).words[input.index]?.mark ?? '';
  return mark !== '' && mark !== 'pending';
};

describe('Today, against its model', () => {
  it(`agrees over ${HISTORIES} seeded histories of up to ${STEPS} inputs`, () => {
    let yielded = 0;
    let peekedTries = 0;
    for (let seed = 1; seed <= HISTORIES; seed++) {
      const random = seeded(seed);
      let state = initial(passage);
      let model = start;
      const history: TodayInput[] = [];
      for (let n = random.below(STEPS) + 1; n > 0; n--) {
        const input = anInput(random, state);
        history.push(input);
        const next = step(state, input);
        if (changesNothing(state, input)) expect(next).toBe(state);
        const expected = model.phase === 'graded' ? resultOf(model) : null;
        model = modelStep(model, input);
        const handed = handedBy(state, input, next);
        if (Option.isSome(handed)) yielded++;
        if (Option.exists(handed, (result) => Option.isSome(result.help))) peekedTries++;
        const rule = broken(view(state), view(next), model, input, handed, expected);
        if (rule !== '') throw new Error(`seed ${seed}: ${rule} after ${JSON.stringify(history)}`);
        state = next;
      }
    }
    expect(yielded).toBeGreaterThan(20);
    expect(peekedTries).toBeGreaterThan(5);
  });

  it('refuses the orders of input that would dodge the cost', () => {
    const run = (inputs: readonly TodayInput[]) => inputs.reduce(step, initial(passage));
    const heard: TodayInput = {
      _tag: 'heard',
      recognition: 'r',
      transcript: text.toLowerCase().replace(/[^a-z ]/g, ''),
      final: true,
    };
    const say: TodayInput = { _tag: 'say', recognition: 'r', at: 2_000, offset: 0 };
    const initials: TodayInput = { _tag: 'cue', cue: 'initials', cap: 1 };
    const peeked = run([initials, { _tag: 'peek', index: 3 }, say, heard, { _tag: 'finish' }]);
    const cases: readonly { readonly name: string; readonly inputs: readonly TodayInput[] }[] = [
      {
        name: 'peek, Say it again, Done',
        inputs: [{ _tag: 'again' }, say, heard, { _tag: 'finish' }],
      },
      { name: 'a grade above the cap', inputs: [{ _tag: 'grade', grade: 4 }] },
      {
        name: 'Show all after Done',
        inputs: [
          { _tag: 'showAll', at: 3_000 },
          { _tag: 'grade', grade: 3 },
        ],
      },
      {
        name: 'the peek ended after Next',
        inputs: [{ _tag: 'next' }, { _tag: 'peekEnded', index: 3 }],
      },
    ];
    for (const { name, inputs } of cases) {
      const after = inputs.reduce(step, peeked);
      const shown = view(after);
      const kept = shown.pending ?? shown.last;
      expect({ name, grade: kept?.recall.grade }).toEqual({ name, grade: 2 });
      expect({ name, cap: shown.grades.filter((g) => g.enabled).length <= 2 }).toEqual({
        name,
        cap: true,
      });
    }
    const grade: Grade = 3;
    expect(view(step(peeked, { _tag: 'grade', grade })).pending?.recall.grade).toBe(2);
  });
});
