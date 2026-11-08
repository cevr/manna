/**
 * The matcher's hearings against the independent model
 * (`test/matcher-model.ts`), which reads the sounds-alike table's JSON
 * itself and takes each hearing as a directed pair. Every hearing of every
 * word is heard in its word's place, in varied dress, verse shape, delivery
 * and cue; none is heard the other way, at another word, or as a modern
 * form or a pronoun, over the whole table. Seeded histories mixing
 * hearings, modern forms, pronouns, drops and extra words follow the model
 * after every command, and the table never earns a recital more than one
 * hit per spoken word that is a word of some hearing.
 */

import { describe, expect, it } from 'bun:test';
import { Formatter } from 'effect';

import {
  createMatcher,
  matcherView,
  updateMatcher,
  type Command,
  type Cue,
  type MatcherView,
} from '../matcher';
import {
  bestMatching,
  equalities,
  HEARING_PAIRS,
  MatcherModel,
  MODERN_FORMS,
  PRONOUNS,
  said,
  SPELLING_PAIRS,
  type ModelCommand,
  type ModelView,
} from '../test/matcher-model';

const fold = (text: string) => text.toLocaleLowerCase('und').replace(/[^\p{L}\p{N}]/gu, '');
const wordsOf = (text: string) => text.split(/\s+/u).filter((run) => /[\p{L}\p{N}]/u.test(run));

const HEARINGS = new Map<string, string[]>();
for (const [word, hearing] of HEARING_PAIRS)
  HEARINGS.set(word, [...(HEARINGS.get(word) ?? []), hearing]);
const ARCHAIC = [...MODERN_FORMS.keys()];
const HEARING_WORDS = new Set(HEARING_PAIRS.flatMap(([, hearing]) => hearing.split(' ')));

const DRESS: ReadonlyArray<(word: string) => string> = [
  (word) => word,
  (word) => word.toUpperCase(),
  (word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}:`,
  (word) => `(${word}`,
];

const view = (verse: string, cue: Cue, commands: readonly ModelCommand[]): MatcherView =>
  matcherView(
    commands.reduce(
      (state, command) => updateMatcher(state, command as Command),
      createMatcher(verse, cue),
    ),
  );

const modelView = (verse: string, cue: Cue, commands: readonly ModelCommand[]): ModelView => {
  const model = new MatcherModel(verse, cue, SPELLING_PAIRS, HEARING_PAIRS);
  for (const command of commands) model.step(command);
  return model.view();
};

const atOnce = (spoken: string): ModelCommand[] => [
  { type: 'recognition', revision: 0, finalWords: said(spoken), tentativeWords: [] },
  { type: 'finish' },
];

/** The first `cut` words final and the rest tentative, then every word final, then finish. */
const inTwo = (spoken: string, cut: number): ModelCommand[] => {
  const all = said(spoken);
  return [
    {
      type: 'recognition',
      revision: 3,
      finalWords: all.slice(0, cut),
      tentativeWords: all.slice(cut),
    },
    { type: 'recognition', revision: 4, finalWords: all, tentativeWords: [] },
    { type: 'finish' },
  ];
};

/** The verse said with each word whose key is `word` said as `as`, every other word as its key. */
const sayingAs = (verse: string, word: string, as: string) =>
  wordsOf(verse)
    .map((run) => {
      if (fold(run) === word) return as;
      return fold(run);
    })
    .join(' ');

/** A clean recital's grade under each cue: Good, or Hard under letters. */
const CLEAN = { none: 3, initials: 2 } as const;

describe('a hearing in its word’s place', () => {
  it('is heard as its word: every hearing, in every verse layout, dress, delivery and cue', () => {
    let cases = 0;
    for (const [n, [word, hearing]] of HEARING_PAIRS.entries()) {
      const dressed = DRESS[n % DRESS.length]?.(word) ?? word;
      const layouts = [
        [dressed],
        ['Alpha', dressed, 'beta;'],
        ['delta', dressed, 'and', dressed, 'the'],
      ];
      for (const layout of layouts) {
        const verse = layout.join(' ');
        const spoken = sayingAs(verse, word, hearing);
        for (const cue of ['none', 'initials'] as const) {
          for (const commands of [atOnce(spoken), inTwo(spoken, (n + layout.length) % 4)]) {
            const got = view(verse, cue, commands);
            expect(got, `${verse} / ${spoken} / ${cue}`).toEqual(modelView(verse, cue, commands));
            expect(
              got.marks.map((mark) => mark.status),
              `${verse} / ${spoken}`,
            ).toEqual(layout.map(() => 'matched'));
            expect(got.extraWordCount, `${verse} / ${spoken}`).toBe(0);
            expect(got.suggestedGrade, `${verse} / ${spoken}`).toBe(CLEAN[cue]);
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(HEARING_PAIRS.length * 12);
  });

  it('times its word from the hearing’s first word to its last', () => {
    for (const [word, hearing] of HEARING_PAIRS) {
      const spoken = said(`alpha ${hearing} beta`);
      const got = view(`alpha ${word} beta`, 'none', atOnce(`alpha ${hearing} beta`));
      const last = spoken.at(-2)?.end ?? -1;
      expect(got.marks[1]?.time, `${word} / ${hearing}`).toEqual({ start: 100, end: last });
    }
  });
});

describe('a hearing nowhere else', () => {
  it('never hears the word said where its hearing stands in the verse', () => {
    for (const [word, hearing] of HEARING_PAIRS) {
      const verse = `alpha ${hearing} beta`;
      const got = view(verse, 'none', atOnce(`alpha ${word} beta`));
      expect(got, `${verse} / ${word}`).toEqual(
        modelView(verse, 'none', atOnce(`alpha ${word} beta`)),
      );
      const held = got.marks.slice(1, -1).map((mark) => mark.status);
      expect(held, `${verse} / ${word}`).toEqual(hearing.split(' ').map(() => 'miss'));
      expect(got.extraWordCount, `${verse} / ${word}`).toBe(1);
    }
  });

  it('never hears a hearing at another archaic word or a word outside the table', () => {
    let cases = 0;
    for (const [word, hearing] of HEARING_PAIRS) {
      const parts = hearing.split(' ');
      for (const other of [...ARCHAIC, 'the', 'thigh', 'gamma']) {
        const theirs = HEARINGS.get(other) ?? [];
        if (other === word || [hearing, ...parts].some((p) => p === other || theirs.includes(p)))
          continue;
        const got = view(`alpha ${other} beta`, 'none', atOnce(`alpha ${hearing} beta`));
        expect(got.marks[1]?.status, `${other} / ${hearing}`).toBe('miss');
        expect(got.extraWordCount, `${other} / ${hearing}`).toBe(parts.length);
        cases += 1;
      }
    }
    expect(cases).toBeGreaterThan(1_000);
  });

  it('never hears a word in one of its modern forms or a pronoun, so a modernized recital is Again', () => {
    let cases = 0;
    for (const [word, modern] of MODERN_FORMS) {
      for (const instead of [...modern, ...PRONOUNS]) {
        const verse = `${word} alpha beta gamma delta epsilon zeta ${word}`;
        const got = view(verse, 'none', atOnce(sayingAs(verse, word, instead)));
        expect([got.marks[0]?.status, got.marks[7]?.status], `${word} / ${instead}`).toEqual([
          'miss',
          'miss',
        ]);
        expect(got.suggestedGrade, `${word} / ${instead}`).toBe(1);
        cases += 1;
      }
    }
    expect(cases).toBe(ARCHAIC.length * PRONOUNS.length + [...MODERN_FORMS.values()].flat().length);
  });
});

const random = (seed: number) => {
  let state = seed >>> 0;
  return (n: number) => {
    state = (Math.imul(state, 22_695_477) + 1) >>> 0;
    return (state >>> 8) % n;
  };
};

const HEARD_WORDS = ARCHAIC.filter((word) => (HEARINGS.get(word) ?? []).length > 0);
const FILLERS = ['fear', 'not', 'the', 'thigh', 'low', 'air', 'where', 'and'];
const POOL = [...HEARD_WORDS, ...HEARD_WORDS, 'thou', 'hath', 'unto', 'ye', ...FILLERS];
const CUES: readonly Cue[] = ['none', 'initials', 'full'];

type History = { verse: string; cue: Cue; spoken: string[]; commands: ModelCommand[] };

/** A verse of one to five words, said with hearings, modern forms, pronouns, drops and extra words, delivered in growing finals. */
const history = (seed: number): History => {
  const pick = random(seed);
  const cue = CUES[seed % CUES.length] ?? 'none';
  const keys = Array.from({ length: 1 + pick(5) }, () => POOL[pick(POOL.length)] ?? 'fear');
  const verse = keys.map((key) => DRESS[pick(DRESS.length)]?.(key) ?? key).join(' ');
  const spoken = keys.flatMap((key) => {
    const how = pick(10);
    const hearings = HEARINGS.get(key) ?? [];
    const modern = MODERN_FORMS.get(key) ?? [];
    if (how < 4 && hearings.length > 0) return (hearings[pick(hearings.length)] ?? key).split(' ');
    if (how === 4 && modern.length > 0) return (modern[pick(modern.length)] ?? key).split(' ');
    if (how === 5) return [PRONOUNS[pick(PRONOUNS.length)] ?? 'you'];
    if (how === 6) return [];
    if (how === 7) return [key, FILLERS[pick(FILLERS.length)] ?? 'and'];
    return [key];
  });
  const commands: ModelCommand[] = [];
  let revision = 1 + pick(2);
  let final = 0;
  const tail = (from: number, count: number) =>
    said(spoken.slice(from, from + count).join(' '), from * 100);
  while (final < spoken.length) {
    const kind = pick(5);
    if (kind === 0) commands.push({ type: 'peek', index: pick(keys.length) });
    if (kind === 1) {
      commands.push({
        type: 'recognition',
        revision: revision - 1,
        finalWords: said(spoken.slice(0, final).join(' ')),
        tentativeWords: tail(final, 3),
      });
    }
    final = Math.min(spoken.length, final + 1 + pick(2));
    revision += 1;
    commands.push({
      type: 'recognition',
      revision,
      finalWords: said(spoken.slice(0, final).join(' ')),
      tentativeWords: tail(final, pick(3)),
    });
  }
  commands.push({ type: 'finish' }, { type: 'peek', index: pick(keys.length) });
  return { verse, cue, spoken, commands };
};

const HISTORIES = Array.from({ length: 240 }, (_, i) => history(52_001 + i));

/** What a finished history reached: words matched by a hearing, by a two-word hearing, and words left missed though a modern form was said. */
const endReach = (keys: readonly string[], spoken: readonly string[], end: MatcherView) => {
  const saidKeys = new Set(spoken);
  const reach = { heard: 0, twoWord: 0, modernMissed: 0 };
  for (const [at, key] of keys.entries()) {
    const matched = end.marks[at]?.status === 'matched';
    const byHearing = matched && HEARINGS.has(key) && !saidKeys.has(key);
    const twoSaid = (HEARINGS.get(key) ?? []).some(
      (h) => h.includes(' ') && h.split(' ').every((p) => saidKeys.has(p)),
    );
    const modernSaid = (MODERN_FORMS.get(key) ?? []).some((m) => saidKeys.has(m));
    reach.heard += Number(byHearing);
    reach.twoWord += Number(byHearing && twoSaid);
    reach.modernMissed += Number(!matched && modernSaid);
  }
  return reach;
};

describe('seeded histories with hearings', () => {
  it(`follow the model after every command of ${HISTORIES.length} histories, reaching every kind of hearing`, () => {
    const reached = { heard: 0, twoWord: 0, modernMissed: 0, tentative: 0, peeks: 0 };
    for (const { verse, cue, spoken, commands } of HISTORIES) {
      const model = new MatcherModel(verse, cue, SPELLING_PAIRS, HEARING_PAIRS);
      let state = createMatcher(verse, cue);
      const keys = wordsOf(verse).map(fold);
      for (const [i, command] of commands.entries()) {
        state = updateMatcher(state, command as Command);
        const expected = model.step(command);
        expect(
          matcherView(state),
          `${verse} / ${spoken.join(' ')} ${cue} #${i} ${Formatter.format(command)}`,
        ).toEqual(expected);
        if (
          expected.marks.some(
            (mark, at) => mark.status === 'tentative' && HEARINGS.has(keys[at] ?? ''),
          )
        )
          reached.tentative += 1;
        if (command.type === 'peek' && expected.peekCount > 0) reached.peeks += 1;
      }
      const end = endReach(keys, spoken, matcherView(state));
      reached.heard += end.heard;
      reached.twoWord += end.twoWord;
      reached.modernMissed += end.modernMissed;
    }
    expect(reached.heard).toBeGreaterThan(100);
    expect(reached.twoWord).toBeGreaterThan(3);
    expect(reached.modernMissed).toBeGreaterThan(20);
    expect(reached.tentative).toBeGreaterThan(20);
    expect(reached.peeks).toBeGreaterThan(10);
  });

  it('never earn a recital more than one hit per spoken hearing word, nor cost it one', () => {
    const withTable = equalities(SPELLING_PAIRS, HEARING_PAIRS);
    const without = equalities(SPELLING_PAIRS, []);
    for (const { verse, spoken } of HISTORIES) {
      const source = wordsOf(verse);
      const gained =
        bestMatching(source, spoken, withTable).hits - bestMatching(source, spoken, without).hits;
      const words = spoken.filter((word) => HEARING_WORDS.has(word)).length;
      expect(gained, `${verse} / ${spoken.join(' ')}`).toBeGreaterThanOrEqual(0);
      expect(gained, `${verse} / ${spoken.join(' ')}`).toBeLessThanOrEqual(words);
    }
  });
});
