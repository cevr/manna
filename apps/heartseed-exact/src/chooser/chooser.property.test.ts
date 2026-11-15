/* oxlint-disable effect/noTernary, effect/noGlobals -- a test's oracle written plainly beside the port's Option code, and the answer's size measured as its JSON. */

/**
 * The chooser's taps and what its footer offers are the current
 * Heartseed's (spec A1). For one chapter of every length the canon holds,
 * generated taps (on 0, past the end, fractions, NaN, and verses of the
 * chapter) step the range as `tapVerse` does, and after each tap and for
 * every plant answer the footer offers what the current chooser does:
 * `Plant` exactly at 3 verses or more, `SHORT_LINE` and no `Plant` under
 * 3 (no single-verse offer), the limit line on `Full`, the alert on any
 * other refusal, nothing once the plant landed. Every range it holds is
 * choosable, and `textOf` gives each verse of the chapter as `versesOf`.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { expect, it } from 'bun:test';
import { Option } from 'effect';

import { LIMIT_LINE, SHORT_LINE, tapVerse } from '@manna/heartseed/chooser';
import { versesOf } from '@manna/heartseed/kjv';
import { choosable, isShort, passageReference } from '@manna/heartseed/passages';
import { textOf } from '../text/text';
import { seeded } from '../test/random';
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

/** The current chooser's footer for a range and the last answer. */
const appFooter = (book: number, chapter: number, range: ChooserRange, answer: string) => {
  const passage = { book, chapter, ...range };
  const short = isShort(passage);
  const reference = passageReference(passage);
  let line = '';
  if (answer === 'Full') line = LIMIT_LINE;
  else if (!['', 'Planted', 'Already'].includes(answer))
    line = `${reference} was not planted. Try again.`;
  return { plant: !short, short: short ? SHORT_LINE : '', reference, line };
};

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
      const shown = chooserShown(`${book}`, `${chapter}`, range, answer);
      if (range.first === 0) {
        expect(shown).toMatchObject({ chosen: false, plant: false, short: '', line: '' });
        continue;
      }
      expect(choosable({ book, chapter, ...range })).toBe(true);
      const app = appFooter(book, chapter, range, answer);
      expect({ book, chapter, range, answer, shown }).toMatchObject({
        book,
        chapter,
        range,
        answer,
        shown: { chosen: true, ...app },
      });
    }
  }
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
    expect(chooserShown(book, chapter, { first: 1, last: 3 }, '')).toMatchObject({
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
