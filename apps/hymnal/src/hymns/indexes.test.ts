/**
 * The index lookups over made-up indexes: numbers, made-up topic and tune
 * names, and passages of made-up chapters. The bundled indexes are walked
 * by the findbulk acceptance rows.
 */

import { describe, expect, it } from 'bun:test';
import { parseBibleQuery } from '@manna/core/bible';
import { Option } from 'effect';

import {
  type HymnIndexes,
  lookupsOf,
  passageQuery,
  passageText,
  referencesOf,
  sameMetre,
} from './indexes';

const indexes: HymnIndexes = {
  topics: [
    { name: 'FIRST TOPIC', hymns: [3, 1] },
    { name: 'Part', parent: 'FIRST TOPIC', hymns: [2] },
    { name: 'Part', parent: 'SECOND TOPIC', hymns: [4, 2] },
  ],
  references: [
    { hymn: 10, passage: { _tag: 'Chapter', book: 1, chapter: 2, verses: [{ from: 5, to: 5 }] } },
    { hymn: 11, passage: { _tag: 'Chapter', book: 1, chapter: 2, verses: [{ from: 8, to: 9 }] } },
    { hymn: 12, passage: { _tag: 'Chapter', book: 1, chapter: 2, verses: [] } },
    { hymn: 13, passage: { _tag: 'Chapter', book: 1, chapter: 2, verses: [{ from: 2, to: 2 }] } },
    {
      hymn: 14,
      passage: {
        _tag: 'Span',
        book: 1,
        from: { chapter: 1, verse: 30 },
        to: { chapter: 2, verse: 3 },
      },
    },
    { hymn: 10, passage: { _tag: 'Chapter', book: 2, chapter: 2, verses: [{ from: 5, to: 5 }] } },
    { hymn: 15, passage: { _tag: 'Chapter', book: 1, chapter: 3, verses: [{ from: 5, to: 5 }] } },
  ],
  metres: [
    {
      metre: 'A',
      tunes: [
        { name: 'One', hymns: [5, 1] },
        { name: 'Two', hymns: [9] },
      ],
    },
    { metre: 'B', tunes: [{ name: 'Three', hymns: [1, 7, 800] }] },
    { metre: 'C', tunes: [{ name: 'Four', hymns: [6] }] },
  ],
  tunes: [
    { name: 'One', hymns: [5, 1] },
    { name: 'Four', hymns: [6] },
  ],
};

const lookups = lookupsOf(indexes);

describe('sameMetre', () => {
  it('gives the other hymns of every metre heading a hymn is under, ascending, hymns only', () => {
    expect(lookups.sameMetre(1)).toEqual([5, 7, 9]);
    expect(lookups.sameMetre(9)).toEqual([1, 5]);
  });

  it('gives none for a hymn alone under its heading or under none', () => {
    expect(lookups.sameMetre(6)).toEqual([]);
    expect(lookups.sameMetre(42)).toEqual([]);
  });
});

describe('a hymn on its own', () => {
  it('lists its topics in printed order, a subtopic with its heading', () => {
    expect(lookups.topicsOf(2)).toEqual([
      { name: 'Part', parent: Option.some('FIRST TOPIC') },
      { name: 'Part', parent: Option.some('SECOND TOPIC') },
    ]);
    expect(lookups.topicsOf(3)).toEqual([{ name: 'FIRST TOPIC', parent: Option.none() }]);
  });

  it('lists the passages it alludes to, in printed order', () => {
    expect(lookups.referencesOf(10).map((p) => p.book)).toEqual([1, 2]);
    expect(lookups.referencesOf(99)).toEqual([]);
  });

  it('names its tune, and none when no tune lists it', () => {
    expect(lookups.tuneOf(1)).toEqual(Option.some('One'));
    expect(lookups.tuneOf(9)).toEqual(Option.none());
  });
});

describe('onVerse', () => {
  it('gives the hymns on the verse first, then the chapter by verse distance, ties to the lower number', () => {
    // On 1 2:5: 10 (the verse) and 12 (the chapter); then 14 (2 away: its span ends at 3), then 11 and 13 (3 away).
    expect(lookups.onVerse(1, 2, 5)).toEqual([10, 12, 14, 11, 13]);
  });

  it('reads a passage across chapters in each chapter it touches', () => {
    expect(lookups.onVerse(1, 1, 31)).toEqual([14]);
    expect(lookups.onVerse(1, 1, 10)).toEqual([14]);
  });

  it('gives none for a chapter no entry names', () => {
    expect(lookups.onVerse(1, 4, 1)).toEqual([]);
    expect(lookups.onVerse(3, 2, 5)).toEqual([]);
  });
});

describe('topicHymns', () => {
  it('finds a topic by its folded name and joins topics of one name, each hymn once', () => {
    expect(lookups.topicHymns('first topic')).toEqual([3, 1]);
    expect(lookups.topicHymns('PART')).toEqual([2, 4]);
    expect(lookups.topicHymns('none such')).toEqual([]);
  });
});

describe('a passage as text and as a query', () => {
  const pieces = {
    _tag: 'Chapter',
    book: 19,
    chapter: 98,
    verses: [
      { from: 4, to: 4 },
      { from: 6, to: 8 },
    ],
  } as const;
  const whole = { _tag: 'Chapter', book: 19, chapter: 23, verses: [] } as const;
  const span = {
    _tag: 'Span',
    book: 1,
    from: { chapter: 1, verse: 30 },
    to: { chapter: 2, verse: 3 },
  } as const;

  it('names the book, the chapter and every verse piece, or the span', () => {
    expect([pieces, whole, span].map(passageText)).toEqual([
      'Psalms 98:4, 6–8',
      'Psalms 23',
      'Genesis 1:30–2:3',
    ]);
  });

  it('asks the search for where the passage begins, in a form it parses', () => {
    const queries = [pieces, whole, span].map(passageQuery);
    expect(queries).toEqual(['Psalms 98:4', 'Psalms 23', 'Genesis 1:30']);
    expect(queries.map((q) => parseBibleQuery(q)._tag)).toEqual(['single', 'chapter', 'single']);
    expect(passageQuery({ ...pieces, verses: [{ from: 6, to: 8 }] })).toBe('Psalms 98:6-8');
    expect(parseBibleQuery('Psalms 98:6-8')._tag).toBe('verseRange');
  });
});

describe('the bundled indexes', () => {
  it('answers from the app bundle: other hymns only, and some hymn shares its metre', () => {
    const all = Array.from({ length: 695 }, (_, i) => i + 1);
    expect(all.some((n) => sameMetre(n).length > 0)).toBe(true);
    expect(all.every((n) => sameMetre(n).every((m) => m >= 1 && m <= 695 && m !== n))).toBe(true);
  });

  it('gives each hymn’s references a query the search reads as a verse, a range or a chapter', () => {
    const all = Array.from({ length: 695 }, (_, i) => i + 1);
    const unread = all
      .flatMap((n) => referencesOf(n))
      .map(passageQuery)
      .filter((q) => !['single', 'verseRange', 'chapter'].includes(parseBibleQuery(q)._tag));
    expect(unread).toEqual([]);
  });
});
