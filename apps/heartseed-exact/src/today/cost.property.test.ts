/* oxlint-disable effect/noNullish, effect/noTernary -- the generators branch plainly and read the view's nulls. */

/**
 * The cost of help, the hidden words and the recall are the current
 * Heartseed's, over their whole domain. For every grade, every set of words
 * peeked at rest and Show all taken or not (under each cap the caller may
 * give), the grade the slice keeps and offers equals `cappedBy` from
 * `@manna/heartseed/sayit` over the help the current app's rule builds (a
 * peek caps at `PEEK_CAP`, Show all counts every word peeked at its instant
 * and caps at the cap given), and the result's help is that help. For
 * seeded tries of a fixed sample of 50 KJV verses under each cue, every
 * word is the matcher's (`sourceWords`), its hidden form is its first
 * letter or number as written under first letters and holds none of its
 * letters under no cue, and `next`'s recall is `recallOf` over the
 * matcher's view, start and zone of the same try, its grade capped and the
 * words peeked at rest counted, as the current app keeps it.
 */

import { describe, expect, it } from 'bun:test';
import { offsetAt } from '@manna/heartseed/day';
import { createMatcher, matcherView, updateMatcher } from '@manna/heartseed/matcher';
import type { Cue } from '@manna/heartseed/matcher';
import { sourceWords } from '@manna/heartseed/matcher/words';
import { readPassage, readVerses } from '@manna/heartseed/passage';
import { cappedBy, PEEK_CAP, recallOf, restPeeks, type Help } from '@manna/heartseed/sayit';
import { Option } from 'effect';

import { seeded } from '../test/random';
import { handedBy, initial, step, type Grade, type TodayInput, type TodayState } from './step';
import { view } from './view';

const VERSES = 50;
const LETTER = /[\p{L}\p{N}]/u;
const GRADES: readonly Grade[] = [1, 2, 3, 4];
const CUES: readonly Cue[] = ['none', 'initials', 'full'];
const passage = readPassage();

/** The help a verse starts from in the current app: nothing peeked, no Show all, capped at Easy. */
const NO_HELP: Help = { reference: passage.reference, peeked: [], shownAt: null, cap: 4 };

/** The help the current app's rule builds from peeks at `peeked`, then Show all at `at` under `cap`. */
const helpBy = (peeked: readonly number[], shown: Option.Option<{ at: number; cap: Grade }>) => {
  const peeks = peeked.reduce<Option.Option<Help>>((was, index) => {
    const prior = Option.getOrElse(was, () => NO_HELP);
    return Option.some({
      ...prior,
      peeked: [...new Set([...prior.peeked, index])],
      cap: cappedBy(PEEK_CAP, Option.some(prior)),
    });
  }, Option.none());
  return Option.match(shown, {
    onNone: () => peeks,
    onSome: ({ at, cap }) => {
      const prior = Option.getOrElse(peeks, () => NO_HELP);
      return Option.some<Help>({
        ...prior,
        peeked: sourceWords(passage.text).map((_, index) => index),
        shownAt: at,
        cap: cappedBy(cap, Option.some(prior)),
      });
    },
  });
};

const said = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''))
    .filter((word) => word !== '')
    .join(' ');

const run = (state: TodayState, inputs: readonly TodayInput[]) => inputs.reduce(step, state);

/** A word at rest under `cue` drawn as the current app draws it: whole under the full text, its first letter or number as written under first letters (`Initial`), none of its letters under no cue. */
const expectHidden = (word: { readonly text: string; readonly shown: string }, cue: Cue) => {
  if (cue === 'full') expect(word.shown).toBe(word.text);
  if (cue === 'initials')
    expect(word.shown).toBe(word.text.charAt(Math.max(0, word.text.search(LETTER))));
  if (cue === 'none') expect(LETTER.test(word.shown)).toBe(false);
};

describe('the cost of help', () => {
  it('caps every grade as the current app does, for every peek set and Show all', () => {
    const count = sourceWords(passage.text).length;
    const random = seeded(7);
    for (let n = 0; n < 160; n++) {
      const peeked = Array.from({ length: random.below(4) }, () => random.below(count));
      const shown = random.chance(0.4)
        ? Option.some({ at: 1_000 + random.below(500), cap: random.pick([1, 2] as const) })
        : Option.none();
      const cue = random.pick(['none', 'initials'] as const);
      const atRest = run(initial(passage), [
        {
          _tag: 'cue',
          cue,
          cap: Option.match(shown, { onNone: () => 2 as const, onSome: (s) => s.cap }),
        },
        ...peeked.map((index): TodayInput => ({ _tag: 'peek', index })),
        ...Option.match(shown, {
          onNone: (): TodayInput[] => [],
          onSome: ({ at }): TodayInput[] => [{ _tag: 'showAll', at }],
        }),
      ]);
      const help = helpBy(peeked, shown);
      expect(atRest.help).toEqual(help);
      const graded = run(atRest, [
        { _tag: 'say', recognition: 'r', at: 2_000, offset: 0 },
        { _tag: 'heard', recognition: 'r', transcript: said(passage.text), final: true },
        { _tag: 'finish' },
      ]);
      for (const grade of GRADES) {
        const chosen = step(graded, { _tag: 'grade', grade });
        const shownView = view(chosen);
        if (cappedBy(grade, help) === grade) expect(chosen.choice).toEqual(Option.some(grade));
        expect(shownView.grades.find((g) => g.grade === grade)?.enabled).toBe(
          cappedBy(grade, help) === grade,
        );
        const kept = handedBy(chosen, { _tag: 'next' }, step(chosen, { _tag: 'next' }));
        expect(Option.map(kept, (result) => result.recall.grade)).toEqual(
          Option.some(
            cappedBy(
              Option.getOrElse(chosen.choice, () => grade),
              help,
            ),
          ),
        );
        expect(Option.map(kept, (result) => result.help)).toEqual(Option.some(help));
      }
    }
  });
});

describe('the hidden words and the recall', () => {
  it(`are the current app's for ${VERSES} KJV verses under each cue`, () => {
    const verses = readVerses();
    const random = seeded(4110);
    for (let n = 0; n < VERSES; n++) {
      const verse = random.pick(verses);
      const piece = {
        reference: `${verse.book}.${verse.chapter}.${verse.verse}`,
        text: verse.text,
      };
      for (const cue of CUES) {
        const resting = run(initial(piece), [{ _tag: 'cue', cue, cap: 2 }]);
        const words = view(resting).words;
        expect(words.map((word) => word.text)).toEqual([...sourceWords(piece.text)]);
        for (const word of words) expectHidden(word, cue);
        const count = words.length;
        const peeked = cue === 'full' ? [] : [random.below(count), random.below(count)];
        const at = 1_700_000_000_000 + random.below(1e9);
        const kept = run(
          resting,
          peeked.map((index): TodayInput => ({ _tag: 'peek', index })),
        );
        const reports = said(piece.text)
          .split(' ')
          .filter(() => random.chance(0.8))
          .join(' ');
        const graded = run(kept, [
          { _tag: 'say', recognition: 'r', at, offset: offsetAt(at) },
          { _tag: 'heard', recognition: 'r', transcript: reports, final: true },
          { _tag: 'finish' },
          { _tag: 'grade', grade: random.pick(GRADES) },
        ]);
        const after = step(graded, { _tag: 'next' });
        const result = handedBy(graded, { _tag: 'next' }, after);
        const matcher = updateMatcher(
          updateMatcher(createMatcher(piece.text, cue), {
            type: 'recognition',
            revision: 1,
            finalWords: reports
              .split(' ')
              .filter((word) => word !== '')
              .map((word, index) => ({ text: word, start: index, end: index + 1 })),
            tentativeWords: [],
          }),
          { type: 'finish' },
        );
        const heard = matcherView(matcher);
        const help = graded.help;
        const choice = Option.getOrElse(graded.choice, (): Grade => 1);
        const recall = recallOf(
          piece.reference,
          at,
          offsetAt(at),
          cappedBy(choice, help),
          heard.suggestedGrade ?? 1,
          heard,
        );
        expect(Option.map(result, (each) => each.recall)).toEqual(
          Option.some({ ...recall, peeked: recall.peeked + restPeeks(help, heard) }),
        );
      }
    }
  });
});
