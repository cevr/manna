/* oxlint-disable effect/noNullish, effect/noTernary -- a model test over plain records, its seed named in the failing line. */

/**
 * The study sheet, model-based: 300 generated readers choose a verse, open
 * the sheet from each button, hold a word (by its offset in the drawn
 * text), change tab, open a word and another, fold and unfold notes and
 * entries, follow a cross-reference (twice deep), go Back, press Done, move
 * by a chapter-notes chip, and the commentary's pack lands or fails while
 * the sheet is up, through `studyStep` and the sheet's own rules, beside a
 * small model of what the reader sees. The invariants: Back from a
 * followed reference reopens the sheet on Cross-refs for the verse left;
 * Done and Back leave the chapter's selection as it was; one word is open
 * at a time; a fold is per note and per entry and resets when the verse
 * changes; the Commentary tab follows the pack (its line with none, the
 * notes once it lands) with no tap.
 */

import { expect, it } from 'bun:test';

import type { CommentaryRead } from '../commentary/pack';
import { navLaunch, select } from '../read/nav';
import type { StudyWords } from '../study/read';
import { seeded, type Random } from '../test/random';
import { holdPrefix, holdWord } from './hold';
import { placeKey, sheetOf, wordIndexOf } from './sheet';
import { readPlaceOf, sheetOn, studyStep, type StudyInput, type StudyState } from './step';

const WAITING = { xrefs: 'x-wait', tags: 't-wait', commentary: 'c-wait', lexicon: 'l-wait' };
const VERSES = 12;

/** A verse's made-up words: lengths drawn from its place, so every reader sees the same verse. */
const wordsOf = (book: number, chapter: number, verse: number): StudyWords => {
  const random = seeded(book * 10_000 + chapter * 100 + verse);
  const count = 3 + random.below(12);
  let at = 0;
  return {
    have: true,
    words: Array.from({ length: count }, (_, index) => {
      const length = 1 + random.below(9);
      const word = {
        index,
        text: 'w'.repeat(length),
        start: at,
        end: at + length,
        numbers: random.chance(0.8) ? ['G1'] : [],
        added: random.chance(0.1),
      };
      at += length + 1;
      return word;
    }),
  };
};

/** A made-up chapter's commentary: notes on a few verses. */
const notesOf = (have: boolean, chapter: number): CommentaryRead => ({
  have,
  verses: have
    ? [2, 5, 9].map((verse) => ({
        verse,
        notes: Array.from({ length: 1 + ((verse + chapter) % 3) }, (_, i) => ({
          ref: `1BC ${i}`,
          text: 'n'.repeat(100 + i * 200),
        })),
      }))
    : [],
});

/** What the reader sees, in the model. */
interface Model {
  pages: Array<{ book: number; chapter: number; at?: number; back?: { verse: number } }>;
  sheet?: { verse: number; tab: string };
  word: number;
  folds: Set<string>;
  first: number;
  last: number;
}

/** The launch: John 3 at Read's root, nothing chosen, no sheet. */
interface Launched {
  state: StudyState;
  model: Model;
}

const launch = (): Launched => {
  const state: StudyState = {
    nav: select(navLaunch().nav, 'read'),
    book: 43,
    chapter: 3,
    word: '',
    unfolded: [],
    backs: '',
    row: -1,
    held: false,
    holds: 0,
    first: 0,
    last: 0,
  };
  const model: Model = {
    pages: [{ book: 43, chapter: 3 }],
    word: -1,
    folds: new Set(),
    first: 0,
    last: 0,
  };
  return { state, model };
};

const topPage = (model: Model) => model.pages.at(-1) ?? { book: 0, chapter: 0 };

/** One input the reader can make now, and the model's step for it. */
const draw = (random: Random, model: Model): { input: StudyInput; next: (m: Model) => void } => {
  const page = topPage(model);
  if (model.sheet === undefined) {
    const verse = 1 + random.below(VERSES);
    const choices: Array<() => { input: StudyInput; next: (m: Model) => void }> = [
      () => ({
        input: { _tag: 'choose', verse },
        next: (m) => ((m.first = verse), (m.last = verse)),
      }),
      () => {
        const tab = random.pick(['xrefs', 'words', 'commentary']);
        return {
          input: { _tag: 'open', verse, tab },
          next: (m) => ((m.sheet = { verse, tab }), (m.word = -1), (m.folds = new Set())),
        };
      },
      () => {
        const words = wordsOf(page.book, page.chapter, verse);
        const last = words.words.at(-1)?.end ?? 0;
        const start = holdPrefix(verse) + random.below(last + 2);
        const text = random.chance(0.15) ? 'two words' : 'word';
        return {
          input: { _tag: 'select', verse, start, text },
          next: (m) => {
            if (text !== 'word') return;
            m.sheet = { verse, tab: 'words' };
            m.word = holdWord(words.words, start - holdPrefix(verse));
            m.folds = new Set();
          },
        };
      },
    ];
    if (model.pages.length > 1)
      choices.push(() => ({
        input: { _tag: 'back' },
        next: (m) => {
          const left = m.pages.pop();
          if (left?.back !== undefined) {
            m.sheet = { verse: left.back.verse, tab: 'xrefs' };
            m.word = -1;
            m.folds = new Set();
          }
        },
      }));
    return random.pick(choices)();
  }
  const sheet = model.sheet;
  const place = placeKey(page.book, page.chapter, sheet.verse);
  const choices: Array<() => { input: StudyInput; next: (m: Model) => void }> = [
    () => {
      const tab = random.pick(['xrefs', 'words', 'commentary']);
      return {
        input: { _tag: 'tab', tab },
        next: (m) => m.sheet !== undefined && (m.sheet.tab = tab),
      };
    },
    () => {
      const index = random.below(wordsOf(page.book, page.chapter, sheet.verse).words.length);
      return { input: { _tag: 'word', index }, next: (m) => (m.word = index) };
    },
    () => {
      const key = `${place}:${random.pick(['n0', 'n1', 'e0:G1', 'e3:G1'])}`;
      return {
        input: { _tag: 'fold', key },
        next: (m) => (m.folds.has(key) ? m.folds.delete(key) : m.folds.add(key)),
      };
    },
    () => {
      const verse = random.pick([2, 5, 9]);
      return {
        input: { _tag: 'move', verse },
        next: (m) => (
          (m.sheet = { verse, tab: 'commentary' }),
          (m.word = -1),
          (m.folds = new Set())
        ),
      };
    },
    () => {
      const to = {
        book: random.pick([1, 19, 45]),
        chapter: 1 + random.below(3),
        verse: 1 + random.below(VERSES),
      };
      return {
        input: { _tag: 'follow', ...to, row: random.below(6) },
        next: (m) => {
          const top = m.pages.at(-1);
          if (top?.book !== to.book || top.chapter !== to.chapter || top.at !== to.verse)
            m.pages.push({
              book: to.book,
              chapter: to.chapter,
              at: to.verse,
              back: { verse: sheet.verse },
            });
          m.sheet = undefined;
          m.first = 0;
          m.last = 0;
        },
      };
    },
    () => ({ input: { _tag: 'done' }, next: (m) => (m.sheet = undefined) }),
    () => ({ input: { _tag: 'back' }, next: (m) => (m.sheet = undefined) }),
  ];
  return random.pick(choices)();
};

/** Where the chapter shown, the sheet up or not, and the selection differ from the model's; empty when they agree. */
const pageMismatch = (
  state: StudyState,
  model: Model,
  input: StudyInput,
  before: { first: number; last: number },
): string => {
  const page = readPlaceOf(state);
  if (page.book !== topPage(model).book || page.chapter !== topPage(model).chapter)
    return 'the chapter shown';
  if ((sheetOn(state.nav) === undefined) !== (model.sheet === undefined))
    return 'the sheet up or not';
  const kept = state.first === before.first && state.last === before.last;
  if ((input._tag === 'done' || input._tag === 'back') && !kept) return 'the selection kept';
  if (state.first !== model.first || state.last !== model.last) return 'the selection';
  return '';
};

/** The Commentary tab's line and notes, against the pack on the phone or not. */
const notesMismatch = (
  shown: ReturnType<typeof sheetOf>,
  notesHave: boolean,
  chapter: number,
  verse: number,
): string => {
  const own = notesOf(notesHave, chapter).verses.find((v) => v.verse === verse)?.notes.length ?? 0;
  if (!notesHave && (shown.notesLine !== WAITING.commentary || shown.notes.length > 0))
    return 'the waiting line';
  if (notesHave && shown.notes.length !== own) return 'the notes once landed';
  if (notesHave && own === 0 && shown.chips.length === 0) return 'the chapter chips';
  return '';
};

/** Where the sheet's verse, tab, open word, folds and Commentary tab differ from the model's; empty when they agree. */
const sheetMismatch = (state: StudyState, model: Model, notesHave: boolean): string => {
  const sheet = sheetOn(state.nav);
  if (sheet === undefined || model.sheet === undefined) return '';
  if (sheet.verse !== model.sheet.verse || sheet.tab !== model.sheet.tab)
    return 'the sheet on its verse and tab';
  const place = placeKey(sheet.book, sheet.chapter, sheet.verse);
  const words = wordsOf(sheet.book, sheet.chapter, sheet.verse);
  if (wordIndexOf(state.word, place, sheet.verse, words) !== model.word) return 'the one word open';
  const opened = new Set(state.unfolded.filter((key) => key.startsWith(`${place}:`)));
  if (opened.size !== model.folds.size || [...opened].some((key) => !model.folds.has(key)))
    return 'the folds';
  const shown = sheetOf({
    book: sheet.book,
    chapter: sheet.chapter,
    verse: sheet.verse,
    reference: 'R',
    language: 'Greek',
    xrefs: { have: true, refs: [] },
    words,
    notes: notesOf(notesHave, sheet.chapter),
    held: state.held,
    waiting: WAITING,
  });
  return notesMismatch(shown, notesHave, sheet.chapter, sheet.verse);
};

it('walks 300 generated readers through the sheet beside the model', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const random = seeded(seed);
    let { state, model } = launch();
    let notesHave = false;
    for (let step = 0; step < 40; step++) {
      if (random.chance(0.1)) notesHave = !notesHave;
      const { input, next } = draw(random, model);
      const before = { first: state.first, last: state.last };
      state = studyStep(state, input);
      next(model);
      const what =
        pageMismatch(state, model, input, before) || sheetMismatch(state, model, notesHave);
      expect(`seed ${seed} step ${step} ${input._tag}: ${what}`).toBe(
        `seed ${seed} step ${step} ${input._tag}: `,
      );
    }
  }
});

it('reopens the sheet twice deep: a reference followed from a followed chapter', () => {
  let { state } = launch();
  const run = (input: StudyInput) => (state = studyStep(state, input));
  run({ _tag: 'open', verse: 16, tab: 'xrefs' });
  run({ _tag: 'follow', book: 1, chapter: 1, verse: 1, row: 2 });
  run({ _tag: 'open', verse: 3, tab: 'xrefs' });
  run({ _tag: 'follow', book: 19, chapter: 23, verse: 1, row: 0 });
  expect(readPlaceOf(state)).toEqual({ book: 19, chapter: 23 });
  run({ _tag: 'back' });
  expect(sheetOn(state.nav)).toMatchObject({ book: 1, chapter: 1, verse: 3, tab: 'xrefs' });
  expect(state.row).toBe(0);
  run({ _tag: 'done' });
  run({ _tag: 'back' });
  expect(sheetOn(state.nav)).toMatchObject({ book: 43, chapter: 3, verse: 16, tab: 'xrefs' });
  expect(state.row).toBe(2);
  expect(state.backs).toBe('');
});
