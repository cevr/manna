/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity -- Exact's app folder cannot import effect (docs/exact.md): the model is one plain switch over every input, as a reader checks it against the spec, it reads the view's nulls, and a broken rule throws naming its seed and history as JSON. */

/**
 * `step` against a reference model of Today written here, over seeded
 * histories of every input: events of the current, a past and a never-seen
 * utterance or recognition, voice ranges of every form (in the verse, past
 * its end, empty, negative, fractional), transcripts of the verse's words
 * with drops and noise, and saved recalls loaded at any time. After each
 * step the view must agree with the model, and the spec's invariants hold
 * on the view itself.
 */

import { describe, expect, it } from 'bun:test';
import { createMatcher, matcherView, updateMatcher } from '@manna/heartseed/matcher';
import type { MatcherState } from '@manna/heartseed/matcher';
import { readPassage } from '@manna/heartseed/passage';

import { seeded, type Random } from '../test/random';
import { initial, none, some, step, type TodayInput, type Recall, type TodayState } from './step';
import { view, type TodayView } from './view';

const HISTORIES = 240;
const STEPS = 40;
const passage = readPassage();
const text = passage.text;

/** The model's words: the verse split at spaces, each with where it starts and ends. */
const words = text.split(' ').reduce<{ start: number; end: number }[]>((spans, word) => {
  const start = spans.length === 0 ? 0 : (spans.at(-1)?.end ?? 0) + 1;
  return [...spans, { start, end: start + word.length }];
}, []);

type Phase = 'resting' | 'reading' | 'listening' | 'graded';

interface Model {
  readonly phase: Phase;
  readonly utterance: string;
  readonly recognition: string;
  readonly lit: number;
  readonly finals: string;
  readonly heard: number;
  readonly matcher: MatcherState;
  readonly result: Recall | null;
  readonly last: Recall | null;
  readonly refused: boolean;
}

const start: Model = {
  phase: 'resting',
  utterance: '',
  recognition: '',
  lit: 0,
  finals: '',
  heard: 0,
  matcher: createMatcher(text),
  result: null,
  last: null,
  refused: false,
};

const idle = (model: Model) => model.phase === 'resting' || model.phase === 'graded';

const timed = (said: string, from: number) =>
  said
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word, index) => ({ text: word, start: from + index, end: from + index + 1 }));

const unsaid = (model: Model): Model => ({
  ...model,
  phase: 'resting',
  recognition: '',
  finals: '',
  heard: 0,
  matcher: createMatcher(text),
});

const modelStep = (model: Model, input: TodayInput): Model => {
  switch (input._tag) {
    case 'hear':
      return idle(model) && input.utterance !== ''
        ? { ...model, phase: 'reading', utterance: input.utterance, lit: 0, refused: false }
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
    case 'say':
      return idle(model) && input.recognition !== ''
        ? {
            ...unsaid(model),
            phase: 'listening',
            recognition: input.recognition,
            lit: 0,
            result: null,
            refused: false,
          }
        : model;
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
      const marks = matcherView(matcher).marks;
      const recall = {
        right: marks.filter((m) => m.status === 'matched').length,
        total: marks.length,
      };
      return { ...model, phase: 'graded', recognition: '', matcher, result: recall, last: recall };
    }
    case 'denied':
      if (model.phase === 'reading') return model;
      return { ...(model.phase === 'listening' ? unsaid(model) : model), refused: true };
    case 'loaded':
      return { ...model, last: input.recall._tag === 'Some' ? input.recall.value : null };
  }
};

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

const anInput = (random: Random, state: TodayState): TodayInput => {
  const word = random.pick(words);
  switch (random.below(10)) {
    case 0:
      return { _tag: 'hear', utterance: anId(random, 'u', '') };
    case 1:
    case 2: {
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
    case 3:
      return {
        _tag: 'voiceEnded',
        utterance: anId(random, 'u', state.utterance),
        outcome: random.chance(0.7) ? 'end' : 'error',
      };
    case 4:
      return random.chance(0.5) ? { _tag: 'stop' } : { _tag: 'denied' };
    case 5:
      return { _tag: 'say', recognition: anId(random, 'r', '') };
    case 6:
    case 7:
      return {
        _tag: 'heard',
        recognition: anId(random, 'r', state.recognition),
        transcript: said(random),
        final: random.chance(0.5),
      };
    case 8:
      return { _tag: 'finish' };
    default: {
      const total = random.below(50);
      return {
        _tag: 'loaded',
        recall: random.chance(0.3) ? none : some({ right: random.below(total + 1), total }),
      };
    }
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

/** The first rule the history breaks after `input`, or ''. */
const broken = (before: TodayView, after: TodayView, model: Model, input: TodayInput): string => {
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
  if (JSON.stringify(after.result) !== JSON.stringify(model.result)) return 'result differs';
  if (JSON.stringify(after.last) !== JSON.stringify(model.last)) return 'last differs';
  if (after.refused !== model.refused) return 'refused differs';
  if (
    input._tag === 'finish' &&
    before.phase === 'listening' &&
    JSON.stringify(after.last) !== JSON.stringify(after.result)
  )
    return 'a finished recall is not shown as last';
  if (input._tag === 'denied' && before.phase === 'listening') {
    if (after.phase !== 'resting' || !after.refused || after.result !== null)
      return 'denied left listening or wrote a recall';
    if (JSON.stringify(after.last) !== JSON.stringify(before.last))
      return 'denied changed the last recall';
  }
  return '';
};

describe('Today, against its model', () => {
  it(`agrees over ${HISTORIES} seeded histories of up to ${STEPS} inputs`, () => {
    for (let seed = 1; seed <= HISTORIES; seed++) {
      const random = seeded(seed);
      let state = initial(passage);
      let model = start;
      let loaded: Recall | null | undefined;
      const history: TodayInput[] = [];
      for (let n = random.below(STEPS) + 1; n > 0; n--) {
        const input = anInput(random, state);
        history.push(input);
        const next = step(state, input);
        if (stale(state, input)) expect(next).toBe(state);
        model = modelStep(model, input);
        const rule = broken(view(state), view(next), model, input);
        if (rule !== '') throw new Error(`seed ${seed}: ${rule} after ${JSON.stringify(history)}`);
        if (input._tag === 'loaded') loaded = view(next).last;
        if (input._tag === 'finish' && state.phase === 'listening') loaded = undefined;
        if (loaded !== undefined) expect(view(next).last).toEqual(loaded);
        state = next;
      }
    }
  });
});
