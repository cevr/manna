/**
 * The word matcher against its independent model (`test/matcher-model.ts`)
 * over seeded command histories: every view after every command, in every
 * cue mode. The words mix exact words, the spelling table's pairs and the
 * forms of forty-two, with the verse's case and punctuation varied; the
 * commands mix growing finals, replaced tails, stale and corrupt
 * snapshots, peeks and finish. Built recalls beside them reach each help a
 * clean recall's grade turns on: none, either cue, and a peek the later
 * speech corrected. Numbers are held to their value over spellings
 * generated from known values, every coefficient one and every additive
 * `and` varied, against their near misses.
 */

import { describe, expect, it } from 'bun:test';
import { Formatter } from 'effect';

import { createMatcher, matcherView, updateMatcher, type Command, type Cue } from './matcher';
import {
  MatcherModel,
  said,
  SPELLING_PAIRS,
  spellVaried,
  type ModelCommand,
  type ModelView,
  type ModelWord,
  type NumberForm,
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

/** A source word and the ways it may be said, each in full. */
type Saying = readonly [string, readonly string[]];

const FEAR: Saying = ['Fear', ['fear']];
const SAYINGS: readonly Saying[] = [
  FEAR,
  ['thou;', ['thou']],
  ['not', ['not']],
  ['shew', ['shew', 'show']],
  ['O', ['o', 'oh']],
  ['evermore', ['evermore', 'ever more']],
  ['42', ['42', 'forty two', 'two and forty']],
];

/**
 * A recall said in full, its final words growing a few at a time under
 * changing tentative tails, then finished. When `peeked`, the verse holds
 * `forever` before a later `for`, and the speaker first stops after the
 * `for` of `for ever`: that lone `for` lights the later `for`, so `forever`
 * and the words between are misses. One of them is peeked, then the rest is
 * said, and the realigned recall is complete with no extra word, the peek
 * still on record.
 */
const recall = (seed: number, cue: Cue, peeked: boolean): History => {
  const pick = random(seed);
  const run = (most: number) =>
    Array.from({ length: pick(most + 1) }, () => SAYINGS[pick(SAYINGS.length)] ?? FEAR);
  const say = (sayings: readonly Saying[]) =>
    sayings.flatMap(([, ways]) => (ways[pick(ways.length)] ?? '').split(' '));
  const before = run(2);
  const between = run(1);
  const after = run(1);
  const words = (sayings: readonly Saying[]) => sayings.map(([w]) => w);
  let verse = words(run(5));
  if (peeked) verse = [...words(before), 'forever', ...words(between), 'for', ...words(after)];
  const commands: ModelCommand[] = [];
  let revision = pick(3);
  const deliver = (spoken: readonly string[], from: number) => {
    let final = from;
    while (final < spoken.length) {
      final = Math.min(spoken.length, final + 1 + pick(3));
      const tentative = spoken.slice(final, final + pick(3));
      revision += 1;
      commands.push({
        type: 'recognition',
        revision,
        finalWords: said(spoken.slice(0, final).join(' ')),
        tentativeWords: said(tentative.join(' '), final * 100),
      });
    }
  };
  if (peeked) {
    const stop = [...say(before), 'for'];
    const rest = ['ever', ...say(between), 'for', ...say(after)];
    deliver(stop, 0);
    const missed = before.length + pick(between.length + 1);
    commands.push({ type: 'peek', index: missed }, { type: 'peek', index: missed });
    deliver([...stop, ...rest], stop.length);
  } else {
    deliver(
      verse.flatMap((word) => say(SAYINGS.filter(([w]) => w === word))),
      0,
    );
  }
  commands.push({ type: 'finish' }, { type: 'finish' });
  return { verse: verse.join(' '), cue, commands };
};

const CUES: readonly Cue[] = ['none', 'initials', 'full'];
const MIXED = Array.from({ length: 150 }, (_, i) => history(7_001 + i, CUES[i % 3] ?? 'none'));
const RECALLS = Array.from({ length: 60 }, (_, i) =>
  recall(9_001 + i, CUES[i % 3] ?? 'none', i % 2 === 0),
);
const HISTORIES = [...MIXED, ...RECALLS];

/** How a finished view was earned: its cue, whether a peek helped, and its grade. */
const helpOf = (cue: Cue, view: ModelView) => {
  const clean =
    view.finished &&
    view.marks.length > 0 &&
    view.extraWordCount === 0 &&
    view.marks.every((mark) => mark.status === 'matched');
  if (!clean) return 'not a clean recall';
  if (view.peekCount > 0) return `${cue} peeked ${view.suggestedGrade}`;
  return `${cue} unpeeked ${view.suggestedGrade}`;
};

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

  it(`shows the model’s view after every command of ${HISTORIES.length} histories, reaching every help a clean recall's grade turns on`, () => {
    let peeks = 0;
    let numeric = 0;
    const helps = new Set<string>();
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
      helps.add(helpOf(cue, model.view()));
    }
    expect(peeks).toBeGreaterThan(20);
    expect(numeric).toBeGreaterThan(5);
    for (const help of [
      'none unpeeked 3',
      'initials unpeeked 2',
      'full unpeeked 2',
      'none peeked 2',
      'initials peeked 2',
      'full peeked 2',
    ]) {
      expect(helps, help).toContain(help);
    }
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

/**
 * A value's groups of three digits, highest first, leaning on ones and
 * hundreds so every coefficient one is common; never past nine quadrillion.
 */
const groupsOf = (pick: (n: number) => number) => {
  const count = 1 + pick(6);
  const any = () => [0, 1, 100 + pick(100), pick(1000), 1 + pick(99)][pick(5)] ?? 0;
  let top = [1, 100 + pick(100), 1 + pick(999)][pick(3)] ?? 1;
  if (count === 6) top = 1 + pick(8);
  return [top, ...Array.from({ length: count - 1 }, any)];
};

const COEFFICIENT = /^(?:two|three|four|five|six|seven|eight|nine)$/u;
const MULTIPLIER = /^(?:hundred|thousand|million|billion|trillion|quadrillion)$/u;
const DECADE = /^(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/u;

/**
 * Spellings one slip from a valid one, none of them that value: a doubled
 * `and`, an article before the phrase, a trailing article, an article
 * before a tens word, and an article in place of a coefficient above one.
 */
const nearMisses = (words: readonly string[]): readonly string[][] => {
  const and = words.indexOf('and');
  const decade = words.findIndex((word) => DECADE.test(word));
  const coefficient = words.findIndex(
    (word, i) => COEFFICIENT.test(word) && MULTIPLIER.test(words[i + 1] ?? ''),
  );
  const found = [
    ['a', ...words],
    [...words, 'a'],
  ];
  if (and !== -1) found.push(words.toSpliced(and, 0, 'and'));
  if (decade !== -1) found.push(words.toSpliced(decade, 0, 'a'));
  if (coefficient !== -1) found.push(words.toSpliced(coefficient, 1, 'a'));
  return found;
};

describe('numbers match by value over generated spellings', () => {
  const same = (verse: string, spoken: string) => {
    const commands = [
      { type: 'recognition', revision: 0, finalWords: said(spoken), tentativeWords: [] },
      { type: 'finish' },
    ] satisfies Command[];
    const view = matcherView(commands.reduce(updateMatcher, createMatcher(verse)));
    return view.suggestedGrade === 3 && view.extraWordCount === 0;
  };

  it('holds every spelling of a value, articles and ands varied, equal to its numeral and to another spelling, and none of its near misses', () => {
    const pick = random(4_242);
    const reached = new Set<NumberForm>();
    let misses = 0;
    for (let i = 0; i < 120; i++) {
      const groups = groupsOf(pick);
      const { numeral, text, forms } = spellVaried(groups, pick);
      const other = spellVaried(groups, pick);
      for (const form of forms) reached.add(form);
      expect(same(text, numeral), `${text} = ${numeral}`).toBe(true);
      expect(same(numeral, text), `${numeral} = ${text}`).toBe(true);
      expect(same(text, other.text), `${text} = ${other.text}`).toBe(true);
      for (const miss of nearMisses(text.split(' '))) {
        const near = miss.join(' ');
        expect(same(near, numeral), `${near} != ${numeral}`).toBe(false);
        expect(same(numeral, near), `${numeral} != ${near}`).toBe(false);
        misses += 1;
      }
    }
    const every: readonly NumberForm[] = [
      'and after hundred',
      'and between groups',
      'and in tens',
      'article first hundred',
      'article first scale',
      'article later hundred',
      'article later scale',
      'hyphen',
      'inverted',
    ];
    expect([...reached].toSorted()).toEqual(every.toSorted());
    expect(misses).toBeGreaterThan(400);
  });
});
