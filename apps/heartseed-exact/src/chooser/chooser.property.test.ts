/* oxlint-disable effect/noTernary, effect/noGlobals -- a test's oracle written plainly beside the port's Option code, and the answer's size measured as its JSON. */

/**
 * The chooser's taps and what its footer offers are the current
 * Heartseed's (spec A1). For one chapter of every length the canon holds,
 * generated taps (on 0, past the end, fractions, NaN, and verses of the
 * chapter) step the range as `tapVerse` does, and after each tap and for
 * every plant answer the footer offers what the current chooser does:
 * `Plant` exactly at 3 verses or more, `SHORT_LINE` and no `Plant` under
 * 3 (the owner's rule, also stated here as a literal 3), there the offer
 * to join the single verses exactly when the current `Passages.join` would
 * add them, their limit line exactly when it would answer `Full`, and
 * neither when every verse is single already, over generated single verses
 * that overlap the range (0 to 20 of them), the limit line
 * of what was planted on `Full`, the alert on any other refusal, nothing
 * once the plant landed. Every range it holds is
 * choosable, and `textOf` gives each verse of the chapter as `versesOf`.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { expect, it } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { LIMIT_LINE, SHORT_LINE, SINGLES_LIMIT_LINE, tapVerse } from '@manna/heartseed/chooser';
import { versesOf } from '@manna/heartseed/kjv';
import {
  choosable,
  isShort,
  layer,
  passageReference,
  Passages,
  verseReference,
  type Range,
} from '@manna/heartseed/passages';
import { textOf } from '../text/text';
import { seeded, type Random } from '../test/random';
import { chooserShown, chooserStep, chooserTap, type ChooserRange } from './chooser';

/** One chapter of each verse count the canon holds: book, chapter, count. */
const CHAPTERS: ReadonlyArray<readonly [number, number, number]> = [
  ...new Map(
    BIBLE_BOOKS.flatMap((book) =>
      Array.from({ length: book.chapters }, (_, index) => {
        const count = versesOf(book.number, index + 1).length;
        return [count, [book.number, index + 1, count] as const] as const;
      }),
    ),
  ).values(),
];

const ANSWERS = ['', 'Planted', 'Already', 'Full', 'Short', 'Invalid', 'Unread', 'Failed'];

const appStep = (range: ChooserRange, verse: number, count: number): ChooserRange =>
  Option.match(
    tapVerse(
      Option.liftPredicate({ first: range.first, last: range.last }, (each) => each.first > 0),
      verse,
      count,
    ),
    { onNone: () => ({ first: 0, last: 0 }), onSome: (each) => ({ ...each }) },
  );

/** The owner's rule, stated here and not imported: a list holds at least three verses. */
const OWNER_LEAST = 3;

/** One verse as a range. */
const verseAt = (book: number, chapter: number, verse: number): Range => ({
  book,
  chapter,
  first: verse,
  last: verse,
});

/** What the current app's `Passages.join` answers for `range` once the single verses hold `held`, over a fresh store. */
const joinAnswer = (held: ReadonlyArray<Range>, range: Range): string =>
  Effect.runSync(
    Effect.gen(function* () {
      const passages = yield* Passages;
      for (const each of held) yield* passages.join(each);
      const view = yield* passages.view;
      expect(view._tag === 'Read' && view.singles.length).toBe(held.length);
      return yield* passages.join(range);
    }).pipe(Effect.provide(layer.pipe(Layer.provide(KeyValueStore.layerMemory)))),
  );

/** A chapter other than `book`'s `chapter`, with 20 verses or more, for single verses outside the range. */
const elsewhere = (book: number, chapter: number): readonly [number, number] =>
  book === 1 && chapter === 1 ? [2, 1] : [1, 1];

/**
 * Single verses a reader may hold beside `range`: 0, 5, 18, 19 or 20 of
 * them, of which a generated run of the range's own verses (none, one, or
 * all) and the rest from another chapter.
 */
const heldBeside = (
  random: Random,
  book: number,
  chapter: number,
  range: ChooserRange,
): ReadonlyArray<Range> => {
  const count = random.pick([0, 5, 18, 19, 19, 20]);
  const length = range.first === 0 ? 0 : range.last - range.first + 1;
  const overlap = Math.min(count, random.below(Math.min(length, 2) + 1));
  const start = range.first + random.below(length - overlap + 1);
  const [otherBook, otherChapter] = elsewhere(book, chapter);
  return [
    ...Array.from({ length: count - overlap }, (_, index) =>
      verseAt(otherBook, otherChapter, index + 1),
    ),
    ...Array.from({ length: overlap }, (_, index) => verseAt(book, chapter, start + index)),
  ];
};

/**
 * The current chooser's footer for a range and the last answer, with the
 * owner's single-verse offer: one or two verses join the single verses
 * exactly when the current app's `Passages.join` would add them
 * (`Added`), their limit line exactly when it would answer `Full`, and
 * neither when every verse is single already (`Held`).
 */
const appFooter = (
  book: number,
  chapter: number,
  range: ChooserRange,
  answer: string,
  held: ReadonlyArray<Range>,
) => {
  const passage = { book, chapter, ...range };
  const short = isShort(passage);
  const join = short ? joinAnswer(held, passage) : '';
  const reference = passageReference(passage);
  let line = '';
  if (answer === '' && join === 'Full') line = SINGLES_LIMIT_LINE;
  else if (answer === 'Full') line = short ? SINGLES_LIMIT_LINE : LIMIT_LINE;
  else if (!['', 'Planted', 'Already'].includes(answer))
    line = `${reference} was not planted. Try again.`;
  return {
    plant: !short,
    singles: join === 'Added',
    short: short ? SHORT_LINE : '',
    reference,
    line,
  };
};

/** The single verses `held` as the contract hands them: their references. */
const referencesOf = (held: ReadonlyArray<Range>) =>
  held.map((each) => verseReference(each.book, each.chapter, each.first));

it('steps and offers as the current chooser, for every chapter length', () => {
  const random = seeded(11);
  expect(CHAPTERS.length).toBe(75);
  for (const [book, chapter, count] of CHAPTERS) {
    let range: ChooserRange = { first: 0, last: 0 };
    for (let n = 0; n < 12; n++) {
      const verse = random.pick([
        0,
        -1,
        count + 1,
        count + 40,
        1.5,
        Number.NaN,
        1,
        count,
        1 + random.below(count),
        1 + random.below(count),
        1 + random.below(count),
      ]);
      const next = chooserStep(range, verse, count);
      expect({ book, chapter, verse, next }).toEqual({
        book,
        chapter,
        verse,
        next: appStep(range, verse, count),
      });
      expect(chooserTap(`${book}`, `${chapter}`, range, verse)).toEqual(next);
      range = next;
      const answer = random.pick(ANSWERS);
      const singles = heldBeside(random, book, chapter, range);
      const held = referencesOf(singles);
      const shown = chooserShown(`${book}`, `${chapter}`, range, answer, held);
      if (range.first === 0) {
        expect(shown).toMatchObject({
          chosen: false,
          plant: false,
          singles: false,
          short: '',
          line: '',
        });
        continue;
      }
      expect(choosable({ book, chapter, ...range })).toBe(true);
      const verses = range.last - range.first + 1;
      expect({ verses, plant: shown.plant, list: shown.short === '' }).toEqual({
        verses,
        plant: verses >= OWNER_LEAST,
        list: verses >= OWNER_LEAST,
      });
      const app = appFooter(book, chapter, range, answer, singles);
      expect({ book, chapter, range, answer, held, shown }).toMatchObject({
        book,
        chapter,
        range,
        answer,
        held,
        shown: { chosen: true, ...app },
      });
    }
  }
});

it('offers one or two verses to the single verses exactly when join would add them', () => {
  const random = seeded(23);
  const seen = new Set<string>();
  for (let n = 0; n < 240; n++) {
    const [book, chapter, count] = random.pick(CHAPTERS);
    const first = 1 + random.below(count);
    const range = { first, last: Math.min(count, first + random.below(2)) };
    const singles = heldBeside(random, book, chapter, range);
    const shown = chooserShown(`${book}`, `${chapter}`, range, '', referencesOf(singles));
    const app = appFooter(book, chapter, range, '', singles);
    const overlap = singles.filter((each) => each.book === book && each.chapter === chapter);
    seen.add(
      `${singles.length}:${range.last - range.first + 1}:${overlap.length}:${app.singles}:${app.line !== ''}`,
    );
    expect({ book, chapter, range, held: singles.length, shown }).toMatchObject({
      book,
      chapter,
      range,
      held: singles.length,
      shown: { plant: false, short: SHORT_LINE, singles: app.singles, line: app.line },
    });
  }
  expect(seen).toContain('19:2:1:true:false');
  expect(seen).toContain('19:2:0:false:true');
  expect(seen).toContain('20:2:2:false:false');
  expect(seen).toContain('20:1:0:false:true');
});

it("refuses a route outside the canon, and reads each chapter's verses as versesOf", () => {
  for (const [book, chapter] of <ReadonlyArray<readonly [string, string]>>[
    ['0', '1'],
    ['67', '1'],
    ['43', '22'],
    ['x', '3'],
    ['43', '1.5'],
    ['', ''],
  ])
    expect(chooserShown(book, chapter, { first: 1, last: 3 }, '', [])).toMatchObject({
      found: false,
      plant: false,
    });
  for (const [book, chapter, count] of CHAPTERS) {
    const passage = textOf({ book, chapter, first: 1, last: count });
    expect(passage.verses.map((each) => each.text)).toEqual([...versesOf(book, chapter)]);
  }
});

it('answers the longest chapter in under 40 KB', () => {
  const longest = CHAPTERS.reduce((a, b) => (b[2] > a[2] ? b : a));
  expect(longest[2]).toBe(176);
  const bytes = new TextEncoder().encode(
    JSON.stringify(textOf({ book: longest[0], chapter: longest[1], first: 1, last: 176 })),
  ).length;
  expect(bytes).toBeLessThan(40_000);
});
