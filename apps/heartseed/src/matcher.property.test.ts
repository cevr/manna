/**
 * The word matcher against its independent model (`test/matcher-model.ts`)
 * over seeded command histories: every view after every command, in every
 * cue mode. The words mix exact words, the spelling table's pairs and the
 * forms of forty-two, with the verse's case and punctuation varied; the
 * commands mix growing finals, replaced tails, stale and corrupt
 * snapshots, peeks and finish.
 */

import { describe, expect, it } from 'bun:test';
import { Formatter } from 'effect';

import { createMatcher, matcherView, updateMatcher, type Command, type Cue } from './matcher';
import {
  MatcherModel,
  said,
  SPELLING_PAIRS,
  type ModelCommand,
  type ModelWord,
  type Pair,
} from './test/matcher-model';

/** Every spelled form of 42 the vocabulary below can build, each equal to each. */
const FORTY_TWO = ['42', 'forty two', 'forty and two', 'two and forty'];
const PAIRS: readonly Pair[] = [
  ...SPELLING_PAIRS,
  ...FORTY_TWO.flatMap((a) => FORTY_TWO.map((b): Pair => [a, b])),
];

const SOURCE = ['fear', 'thou', 'not', 'for', 'ever', 'more', 'forever', 'evermore', 'shew', 'o'];
const NUMBER = ['forty', 'two', 'and', '42'];
const SPOKEN = [...SOURCE, ...NUMBER, 'show', 'oh', 'thee'];
const DRESS = [
  (w: string) => w,
  (w: string) => w.toUpperCase(),
  (w: string) => `${w};`,
  (w: string) => `[${w}]`,
];

const random = (seed: number) => {
  let state = seed;
  return (n: number) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % n;
  };
};

type History = { verse: string; cue: Cue; commands: ModelCommand[] };

const history = (seed: number, cue: Cue): History => {
  const pick = random(seed);
  const vocabulary = [[...SOURCE, ...NUMBER], SOURCE.slice(0, 4)][pick(2)] ?? SOURCE;
  const verse = Array.from({ length: pick(7) }, () => {
    const word = vocabulary[pick(vocabulary.length)] ?? 'fear';
    const marked = pick(5) === 0;
    const dressed = DRESS[pick(DRESS.length)]?.(word) ?? word;
    if (marked) return `¶ ${dressed}`;
    return dressed;
  }).join(' ');
  const words = () => SPOKEN[pick(SPOKEN.length)] ?? 'fear';
  let final: ModelWord[] = [];
  let revision = 0;
  const tail = () => said(Array.from({ length: pick(4) }, words).join(' '), final.length * 100);
  const broken = () => {
    if (final.length > 0 && pick(2) === 0) return final.slice(1);
    return [...final, { text: words(), start: -5, end: 0 }];
  };
  const commands: ModelCommand[] = [];
  for (let i = 0; i < 14; i++) {
    const kind = pick(8);
    if (kind === 0) commands.push({ type: 'peek', index: pick(9) - 1 });
    else if (kind === 1) commands.push({ type: 'finish' });
    else if (kind === 2) {
      commands.push({
        type: 'recognition',
        revision: Math.max(0, revision - 1),
        finalWords: final,
        tentativeWords: tail(),
      });
    } else if (kind === 3) {
      commands.push({
        type: 'recognition',
        revision: revision + 1,
        finalWords: broken(),
        tentativeWords: [],
      });
    } else if (kind <= 5) {
      final = [...final, ...said(words(), final.length * 100)];
      revision += 1;
      commands.push({ type: 'recognition', revision, finalWords: final, tentativeWords: tail() });
    } else {
      revision += 1;
      commands.push({ type: 'recognition', revision, finalWords: final, tentativeWords: tail() });
    }
  }
  commands.push({ type: 'finish' }, { type: 'peek', index: pick(7) });
  return { verse, cue, commands };
};

const CUES: readonly Cue[] = ['none', 'initials', 'full'];
const HISTORIES = Array.from({ length: 150 }, (_, i) => history(7_001 + i, CUES[i % 3] ?? 'none'));

describe('the matcher follows its model', () => {
  it('generates histories that reach every command, cue and word family', () => {
    const commands = HISTORIES.flatMap((h) => h.commands);
    expect(new Set(commands.map((c) => c.type))).toEqual(
      new Set(['recognition', 'peek', 'finish']),
    );
    expect(new Set(HISTORIES.map((h) => h.cue))).toEqual(new Set(CUES));
    const spoken = commands.flatMap((c) => {
      if (c.type !== 'recognition') return [];
      return c.finalWords.map((w) => w.text);
    });
    for (const word of ['forty', '42', 'forever', 'evermore', 'show', 'oh', 'ever']) {
      expect(spoken).toContain(word);
    }
    expect(HISTORIES.some((h) => /[A-Z;[\]¶]/u.test(h.verse))).toBe(true);
  });

  it('shows the model’s view after every command of 150 histories', () => {
    let peeks = 0;
    let numeric = 0;
    for (const { verse, cue, commands } of HISTORIES) {
      const model = new MatcherModel(verse, cue, PAIRS);
      let state = createMatcher(verse, cue);
      expect(matcherView(state)).toEqual(model.view());
      for (const [i, command] of commands.entries()) {
        const before = structuredClone(matcherView(state));
        const previous = state;
        state = updateMatcher(state, command as Command);
        const expected = model.step(command);
        expect(
          matcherView(state),
          `${Formatter.format(verse)} ${cue} #${i} ${Formatter.format(command)}`,
        ).toEqual(expected);
        expect(matcherView(previous)).toEqual(before);
        if (expected.marks.some((m) => m.status === 'peek')) peeks += 1;
      }
      if (/42|forty/u.test(verse) && matcherView(state).marks.some((m) => m.status === 'matched'))
        numeric += 1;
    }
    expect(peeks).toBeGreaterThan(20);
    expect(numeric).toBeGreaterThan(5);
  });

  it('finishes a delivery the same however its words were batched', () => {
    const pick = random(91);
    for (let i = 0; i < 60; i++) {
      const verse = Array.from({ length: pick(6) }, () => SPOKEN[pick(SPOKEN.length)]).join(' ');
      const all = said(
        Array.from({ length: pick(7) }, () => SPOKEN[pick(SPOKEN.length)]).join(' '),
      );
      const whole = [
        { type: 'recognition', revision: 0, finalWords: all, tentativeWords: [] },
        { type: 'finish' },
      ] satisfies Command[];
      const cut = pick(all.length + 1);
      const split = [
        {
          type: 'recognition',
          revision: 0,
          finalWords: all.slice(0, cut),
          tentativeWords: all.slice(cut),
        },
        { type: 'recognition', revision: 1, finalWords: all, tentativeWords: [] },
        { type: 'finish' },
      ] satisfies Command[];
      const end = (commands: readonly Command[]) =>
        matcherView(commands.reduce(updateMatcher, createMatcher(verse)));
      const model = new MatcherModel(verse, 'none', PAIRS);
      for (const command of whole) model.step(command);
      expect(end(whole), verse).toEqual(model.view());
      expect(end(split), `${verse} / cut ${cut}`).toEqual(model.view());
    }
  });
});
