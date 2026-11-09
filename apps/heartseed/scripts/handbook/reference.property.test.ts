/* oxlint-disable effect/noTernary -- the model and the cases write their expected values as plain branches. */

/**
 * R4 and R5 over their whole domain: generated links over all 66 books, by
 * the canon's names and Haskell's (`Psalm`), with and without the book in
 * the shown text, against a reference model written plainly here: each case
 * is built from its parts (the book, the title's chapter and verse, the
 * shown chapter, the parts and their kinds), and its outcome is read off
 * how it was built, never by parsing the text again.
 *
 * It catches `C:L` read in a chapter other than the title's, a one-chapter
 * book's verses (`Jude 21-23`) taken as chapters, a reversed part, `;` or a
 * word taken, a whole chapter borrowed from the title when the text names
 * another, a past-chapter range clipped instead of dropped, verse 0 kept, a
 * range of 21 verses kept or one of 20 dropped. The chapters' sizes are made
 * up here (`sizeOf`), so it misses nothing about the real KJV: the content
 * test and the parity check read that.
 */

import { BIBLE_BOOKS, getBibleBookByName } from '@manna/core/bible';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { placeRange, readLink, type Range } from './reference';

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const below = (next: () => number, n: number) => Math.floor(next() * n);
const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;

/** A made-up verse count for each chapter of the canon: short ones, 20, 21 and long ones. */
const SIZES = [3, 9, 14, 20, 21, 25, 31, 47, 176] as const;
const sizeOf = (book: number, chapter: number) => SIZES[(book * 7 + chapter * 3) % SIZES.length]!;
const CHAPTERS = new Map(BIBLE_BOOKS.map((book) => [Number(book.number), book.chapters]));
const count = (book: number, chapter: number) =>
  chapter >= 1 && chapter <= (CHAPTERS.get(book) ?? 0) ? sizeOf(book, chapter) : 0;
const bookOf = (name: string) =>
  Option.map(getBibleBookByName(name), (book) => Number(book.number));

const ONE_CHAPTER = [31, 57, 63, 64, 65];

/** The names a link may give a book: the canon's, and Haskell's `Psalm`. */
const namesOf = (book: number): readonly string[] => {
  const name = BIBLE_BOOKS.find((each) => Number(each.number) === book)!.name;
  return book === 19 ? [name, 'Psalm'] : [name];
};

/** What the model says of a case: `unread`, or each range kept or dropped with its reason, in order. */
type Outcome = 'unread' | readonly (Range | 'past-chapter' | 'long')[];

const judge = (range: Range): Range | 'past-chapter' | 'long' => {
  const [book, chapter, first, last] = range;
  if (first < 1 || last > count(book, chapter) || first > count(book, chapter))
    return 'past-chapter';
  if (last - first + 1 > 20) return 'long';
  return range;
};

interface Case {
  readonly kind: string;
  readonly title: string;
  readonly shown: string;
  readonly outcome: Outcome;
}

/** One part as it is built: its first and last verse, and how it is written. */
const partOf = (next: () => number, size: number): readonly [number, number, string] => {
  const kind = below(next, 9);
  const at = 1 + below(next, size);
  if (kind === 0) return [at, at, `${at}`];
  if (kind === 1) {
    const last = Math.min(size, at + below(next, 6));
    return [at, last, last === at ? `${at}` : `${at}-${last}`];
  }
  if (kind === 2) return [1, 20, '1-20'];
  if (kind === 3) return [1, 21, '1-21'];
  if (kind === 4) return [0, 0, '0'];
  if (kind === 5) return [size + 1, size + 1, `${size + 1}`];
  if (kind === 6) return [at, size + 2, `${at}-${size + 2}`];
  if (kind === 7) return [at + 1, at, `${at + 1}-${at}`];
  return [0, 2, '0-2'];
};

/** A list of 1-9 parts in a chapter of `size` verses: its text, its parts, and whether one runs backward. */
const listOf = (next: () => number, size: number) => {
  const parts = Array.from({ length: 1 + below(next, 9) }, () => partOf(next, size));
  const separator = pick(next, [', ', ',']);
  return {
    text: parts.map(([, , text]) => text).join(separator),
    parts,
    reversed: parts.some(([first, last]) => last < first),
  };
};

const outcomeOf = (book: number, chapter: number, list: ReturnType<typeof listOf>): Outcome => {
  if (list.reversed) return 'unread';
  return list.parts.map(([first, last]) => judge([book, chapter, first, last]));
};

const caseOf = (next: () => number, index: number): Case => {
  const many = BIBLE_BOOKS.filter((book) => !ONE_CHAPTER.includes(Number(book.number)));
  const kind = index % 11;
  const single = kind === 4 || kind === 5 || kind === 6;
  const book = single ? pick(next, ONE_CHAPTER) : Number(pick(next, many).number);
  const chapters = CHAPTERS.get(book)!;
  const chapter = single ? 1 : 1 + below(next, chapters);
  const name = pick(next, namesOf(book));
  const verse = below(next, 200);
  const title = pick(next, [
    `${pick(next, namesOf(book))} ${chapter}`,
    `${pick(next, namesOf(book))} ${chapter}:${verse}`,
  ]);
  const lead = pick(next, ['', `${name} `]);
  const size = Math.max(1, count(book, chapter));
  const list = listOf(next, size);
  const other = chapter + 1 + below(next, 3);
  if (kind === 0 || kind === 1)
    return {
      kind: 'verses',
      title,
      shown: `${lead}${chapter}:${list.text}`,
      outcome: outcomeOf(book, chapter, list),
    };
  if (kind === 2)
    return {
      kind: 'other chapter',
      title,
      shown: `${lead}${other}:${list.text}`,
      outcome: 'unread',
    };
  if (kind === 3) {
    const whole = below(next, 2) === 0;
    return whole
      ? {
          kind: 'whole chapter',
          title,
          shown: `${lead}${chapter}`,
          outcome: [judge([book, chapter, 1, count(book, chapter)])],
        }
      : { kind: 'whole other chapter', title, shown: `${lead}${other}`, outcome: 'unread' };
  }
  if (kind === 4)
    return {
      kind: 'one-chapter verses',
      title,
      shown: `${lead}${list.text}`,
      outcome: outcomeOf(book, 1, list),
    };
  if (kind === 5)
    return {
      kind: 'one-chapter 1:L',
      title,
      shown: `${lead}1:${list.text}`,
      outcome: outcomeOf(book, 1, list),
    };
  if (kind === 6) {
    const far = 2 + below(next, 5);
    return {
      kind: 'one-chapter title past 1',
      title: `${name} ${far}:${verse}`,
      shown: `${lead}${list.text}`,
      outcome: 'unread',
    };
  }
  if (kind === 7) {
    const at = 1 + below(next, size);
    return {
      kind: 'semicolon',
      title,
      shown: pick(next, [
        `${lead}${chapter}:${at}; ${at + 1}`,
        `${lead}${chapter}:${at}; ${other}:${at}`,
      ]),
      outcome: 'unread',
    };
  }
  if (kind === 8) {
    const at = 1 + below(next, size);
    return {
      kind: 'words',
      title,
      shown: pick(next, [
        `${lead}${chapter}:${at} and ${at + 1}`,
        `${chapter}th chapter`,
        `${lead}${chapter}:${at} to ${at + 2}`,
        `${lead}${chapter}:${at}ff`,
        `${lead}${chapter}:${at}, ${at + 1}, etc.`,
      ]),
      outcome: 'unread',
    };
  }
  if (kind === 9)
    return {
      kind: 'chapter range',
      title,
      shown: `${lead}${chapter}-${chapter + 4}, ${chapter + 5}`,
      outcome: 'unread',
    };
  return {
    kind: 'unknown book',
    title: pick(next, [`Hezekiah ${chapter}:${verse}`, `${name}`, `${name} ${chapter}:`, '']),
    shown: `${lead}${chapter}:${list.text}`,
    outcome: 'unread',
  };
};

/** What the rules give for a case, in the model's terms. */
const ruled = (title: string, shown: string): Outcome => {
  const reading = readLink(title, shown, bookOf, count);
  if (reading._tag === 'Unread') return 'unread';
  return reading.ranges.map((range) => {
    const placed = placeRange(range, count);
    return placed._tag === 'Kept' ? placed.range : placed.reason;
  });
};

/** An outcome as one line: `unread`, or each range as `book.chapter.first.last` or its reason. */
const keyOf = (outcome: Outcome) =>
  outcome === 'unread'
    ? outcome
    : outcome.map((each) => (Array.isArray(each) ? each.join('.') : each)).join(' ');

/** A judged range's class: its reason, `kept 20` for a kept range of 20 verses, else `kept`. */
const classOf = (range: Range | 'past-chapter' | 'long') => {
  if (range === 'past-chapter' || range === 'long') return range;
  return range[3] - range[2] + 1 === 20 ? 'kept 20' : 'kept';
};

/** How many cases fall in each class: each kind, each outcome, Haskell's `Psalm` and a shown text with no book. */
const tallyOf = (cases: readonly Case[]) => {
  const tally = new Map<string, number>();
  const add = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
  for (const each of cases) {
    add(each.kind);
    if (each.outcome === 'unread') add('unread');
    else for (const range of each.outcome) add(classOf(range));
    if (each.title.startsWith('Psalm ')) add('Psalm');
    if (/^\d/.test(each.shown)) add('no book shown');
  }
  return tally;
};

const CASES = Array.from({ length: 6000 }, (_, index) =>
  caseOf(random(7919 + index * 104729), index),
);

describe('a link read as ranges (R4) and kept or dropped (R5)', () => {
  it('reads every generated link as the model does', () => {
    const wrong = CASES.filter(
      (each) => keyOf(ruled(each.title, each.shown)) !== keyOf(each.outcome),
    ).map(
      (each) =>
        `${each.kind}: ${each.title} | ${each.shown} → ${keyOf(ruled(each.title, each.shown))}`,
    );
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('meets each class’s floor', () => {
    const tally = tallyOf(CASES);
    const books = new Set(
      CASES.map((each) => bookOf(each.title.replace(/ \d.*$/, ''))).flatMap((found) =>
        Option.isSome(found) ? [found.value] : [],
      ),
    );
    expect(books.size).toBe(66);
    const floors = {
      verses: 800,
      'other chapter': 400,
      'whole chapter': 150,
      'whole other chapter': 150,
      'one-chapter verses': 400,
      'one-chapter 1:L': 400,
      'one-chapter title past 1': 400,
      semicolon: 400,
      words: 400,
      'chapter range': 400,
      'unknown book': 400,
      unread: 3000,
      'past-chapter': 1000,
      long: 400,
      kept: 1000,
      'kept 20': 200,
      Psalm: 20,
      'no book shown': 1000,
    };
    const short = Object.entries(floors).filter(([key, floor]) => (tally.get(key) ?? 0) < floor);
    expect(short.map(([key]) => `${key} ${tally.get(key) ?? 0}`)).toEqual([]);
  });

  it('reads Haskell’s own forms', () => {
    const sizes = new Map([
      ['45.5', 21],
      ['45.3', 31],
      ['65.1', 25],
      ['19.23', 6],
      ['40.24', 51],
    ]);
    const real = (book: number, chapter: number) => sizes.get(`${book}.${chapter}`) ?? 0;
    const read = (title: string, shown: string) => {
      const reading = readLink(title, shown, bookOf, real);
      if (reading._tag === 'Unread') return 'unread';
      return reading.ranges.map((range) => {
        const placed = placeRange(range, real);
        return placed._tag === 'Kept' ? placed.range : placed.reason;
      });
    };
    expect(read('Romans 5:8', 'Romans 5:8, 6')).toEqual([
      [45, 5, 8, 8],
      [45, 5, 6, 6],
    ]);
    expect(read('Romans 3:20', 'Romans 3:20, 77')).toEqual([[45, 3, 20, 20], 'past-chapter']);
    expect(read('Jude 1:21', 'Jude 21-23')).toEqual([[65, 1, 21, 23]]);
    expect(read('Psalms 23', 'Psalm 23')).toEqual([[19, 23, 1, 6]]);
    expect(read('Matthew 24:1', 'Matthew 24')).toEqual(['long']);
    expect(read('Romans 5:8', 'Romans 6:8')).toBe('unread');
  });
});
