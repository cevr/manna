/* oxlint-disable effect/noTernary -- a property test over plain counts. */

/**
 * The bar's buttons, over generated counts and pack states: each button's
 * second line and name are the spec's table (Cross-refs its count or
 * "none"; Words the language or "none tagged"; Commentary its count,
 * "none", or nothing while no pack is on the phone), and a button that
 * says "none" opens a tab that says why in a sentence, never an empty one.
 */

import { expect, it } from 'bun:test';

import { seeded, type Random } from '../test/random';
import { studyButtonsOf, type StudyButton, type StudyVerseFacts } from './bar';
import { LINES, sheetOf } from './sheet';

const WAITING = { xrefs: 'x-wait', tags: 't-wait', commentary: 'c-wait', lexicon: 'l-wait' };

const factsOf = (random: Random): StudyVerseFacts => ({
  reference: 'John 3:16',
  language: random.pick(['Hebrew', 'Greek']),
  xrefsHave: random.chance(0.7),
  xrefs: random.chance(0.3) ? 0 : 1 + random.below(6),
  wordsHave: random.chance(0.7),
  words: random.chance(0.2) ? 0 : 1 + random.below(40),
  notesHave: random.chance(0.6),
  notes: random.chance(0.5) ? 0 : 1 + random.below(18),
});

/** A count's line by the table. */
const lineOf = (have: boolean, count: number) => (have ? (count > 0 ? `${count}` : 'none') : '');

const checkButtons = (facts: StudyVerseFacts, buttons: ReadonlyArray<StudyButton>) => {
  const [xrefs, words, notes] = buttons;
  expect(xrefs?.line).toBe(lineOf(facts.xrefsHave, facts.xrefs));
  expect(words?.line).toBe(facts.wordsHave && facts.words === 0 ? 'none tagged' : facts.language);
  expect(notes?.line).toBe(lineOf(facts.notesHave, facts.notes));
  expect(words?.name).toBe('Hebrew and Greek words of John 3:16');
  expect(xrefs?.name).toBe(
    facts.xrefsHave
      ? `Cross-references of John 3:16, ${xrefs?.line}`
      : 'Cross-references of John 3:16',
  );
  const said =
    facts.notes === 0 ? 'no notes' : facts.notes === 1 ? '1 note' : `${facts.notes} notes`;
  expect(notes?.name).toBe(
    facts.notesHave
      ? `Ellen White's commentary on John 3:16, ${said}`
      : "Ellen White's commentary on John 3:16",
  );
};

const sheetFor = (facts: StudyVerseFacts) =>
  sheetOf({
    book: 43,
    chapter: 3,
    verse: 16,
    reference: 'John 3:16',
    language: facts.language,
    xrefs: {
      have: facts.xrefsHave,
      refs: Array.from({ length: facts.xrefsHave ? facts.xrefs : 0 }, () => ({
        reference: 'R',
        book: 1,
        chapter: 1,
        verse: 1,
        last: 1,
        text: 't',
      })),
    },
    words: {
      have: facts.wordsHave,
      words: Array.from({ length: Math.max(facts.words, 3) }, (_, index) => ({
        index,
        text: 'w',
        start: index * 2,
        end: index * 2 + 1,
        numbers: facts.wordsHave && index < facts.words ? ['G1'] : [],
        added: false,
      })),
    },
    notes: {
      have: facts.notesHave,
      verses: Array.from({ length: facts.notesHave && facts.notes > 0 ? 1 : 0 }, () => ({
        verse: 16,
        notes: Array.from({ length: facts.notes }, () => ({ ref: 'r', text: 't' })),
      })),
    },
    held: false,
    waiting: WAITING,
  });

/** The tab a button opens says why it is empty, or shows what the button counted. */
const checkTabs = (facts: StudyVerseFacts) => {
  const sheet = sheetFor(facts);
  const xrefsWant = facts.xrefsHave ? (facts.xrefs === 0 ? LINES.noXrefs : '') : WAITING.xrefs;
  const wordsWant = facts.wordsHave ? (facts.words === 0 ? LINES.noWords : '') : WAITING.tags;
  const notesWant = facts.notesHave ? (facts.notes === 0 ? LINES.noNotes : '') : WAITING.commentary;
  expect([sheet.xrefsLine, sheet.wordsLine, sheet.notesLine]).toEqual([
    xrefsWant,
    wordsWant,
    notesWant,
  ]);
  expect(sheet.xrefs.length).toBe(facts.xrefsHave ? facts.xrefs : 0);
  expect(sheet.notes.length).toBe(facts.notesHave ? facts.notes : 0);
};

it('says what each button holds, for 400 generated verses and pack states', () => {
  const random = seeded(3);
  for (let run = 0; run < 400; run++) {
    const facts = factsOf(random);
    checkButtons(facts, studyButtonsOf(facts));
    checkTabs(facts);
  }
});
