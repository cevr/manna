import { describe, expect, it } from 'effect-bun-test';
import { test as unit } from 'bun:test';
import { Effect, Result } from 'effect';

import { CategoryId, HymnId, VerseId } from '../types/ids.js';
import {
  Category,
  Hymn,
  type HymnIndexes,
  HymnVerse,
  type IndexPassage,
  passageReaches,
} from './schemas.js';
import { type HymnalError, HymnalService, type HymnNotFoundError } from './service.js';

/** The operation a call failed in, `false` for another error, or `succeeded`. */
const failedOperation = <A>(call: Effect.Effect<A, HymnalError | HymnNotFoundError>) =>
  Effect.match(call, {
    onFailure: (error) => error._tag === 'HymnalError' && error.operation,
    onSuccess: () => 'succeeded',
  });

const worship = Category.make({ id: CategoryId.make(1), name: 'Worship' });
const gospel = Category.make({ id: CategoryId.make(2), name: 'Gospel' });
const longFirstLine = 'A'.repeat(61);

const hymns = [
  Hymn.make({
    id: HymnId.make(1),
    name: 'Morning Praise',
    category: worship.name,
    categoryId: worship.id,
    verses: [HymnVerse.make({ id: VerseId.make(1), text: `${longFirstLine}\nSecond line` })],
  }),
  Hymn.make({
    id: HymnId.make(2),
    name: 'Amazing Grace',
    category: gospel.name,
    categoryId: gospel.id,
    verses: [HymnVerse.make({ id: VerseId.make(1), text: 'How sweet the sound' })],
  }),
  Hymn.make({
    id: HymnId.make(3),
    name: 'Faith of Our Fathers',
    category: gospel.name,
    categoryId: gospel.id,
    verses: [HymnVerse.make({ id: VerseId.make(1), text: 'Living still' })],
  }),
] as const;

const TestLayer = HymnalService.Test({ hymns, categories: [worship, gospel] });

describe('HymnalService', () => {
  const test = it.effect;

  test('returns a hymn by number', () =>
    Effect.gen(function* () {
      const hymn = yield* HymnalService.use((service) => service.getHymn(HymnId.make(2)));
      expect(hymn.name).toBe('Amazing Grace');
    }).pipe(Effect.provide(TestLayer)));

  test('fails with HymnNotFoundError when the hymn is absent', () =>
    Effect.gen(function* () {
      const error = yield* HymnalService.use((service) => service.getHymn(HymnId.make(920))).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe('HymnNotFoundError');
      if (error._tag === 'HymnNotFoundError') {
        expect(error.id).toBe(920);
      }
    }).pipe(Effect.provide(TestLayer)));

  test('returns categories and filters summaries by category', () =>
    Effect.gen(function* () {
      const result = yield* HymnalService.use((service) =>
        Effect.all({
          categories: service.getCategories,
          hymns: service.getHymnsByCategory(gospel.id),
        }),
      );

      expect(result.categories.map((category) => category.name)).toEqual(['Worship', 'Gospel']);
      expect(result.hymns.map((hymn) => hymn.name)).toEqual([
        'Amazing Grace',
        'Faith of Our Fathers',
      ]);
    }).pipe(Effect.provide(TestLayer)));

  test('searches case-insensitively and honors the requested limit', () =>
    Effect.gen(function* () {
      const byName = yield* HymnalService.use((service) => service.searchHymns('GRACE', 1));
      const byLyrics = yield* HymnalService.use((service) => service.searchHymns('living', 1));
      const limited = yield* HymnalService.use((service) => service.searchHymns('a', 2));

      expect(byName.map((hymn) => hymn.id)).toEqual([HymnId.make(2)]);
      expect(byLyrics.map((hymn) => hymn.id)).toEqual([HymnId.make(3)]);
      expect(limited).toHaveLength(2);
    }).pipe(Effect.provide(TestLayer)));

  test('uses the same first-line truncation for category and search summaries', () =>
    Effect.gen(function* () {
      const result = yield* HymnalService.use((service) =>
        Effect.all({
          category: service.getHymnsByCategory(worship.id),
          search: service.searchHymns('morning'),
        }),
      );
      const expected = `${'A'.repeat(60)}...`;

      expect(result.category[0]?.firstLine).toBe(expected);
      expect(result.search[0]?.firstLine).toBe(expected);
    }).pipe(Effect.provide(TestLayer)));
});

const chapter = (book: number, chapterNumber: number, verses: [number, number][] = []) =>
  ({
    _tag: 'Chapter',
    book,
    chapter: chapterNumber,
    verses: verses.map(([from, to]) => ({ from, to })),
  }) satisfies IndexPassage;
const span = (book: number, from: [number, number], to: [number, number]) =>
  ({
    _tag: 'Span',
    book,
    from: { chapter: from[0], verse: from[1] },
    to: { chapter: to[0], verse: to[1] },
  }) satisfies IndexPassage;

describe('passageReaches', () => {
  unit('a chapter with no pieces reaches the chapter and each of its verses', () => {
    expect(passageReaches(chapter(19, 23), { book: 19, chapter: 23 })).toBe(true);
    expect(passageReaches(chapter(19, 23), { book: 19, chapter: 23, verse: 6 })).toBe(true);
    expect(passageReaches(chapter(19, 23), { book: 19, chapter: 24, verse: 1 })).toBe(false);
  });

  unit('a piece reaches the verses from its first to its last', () => {
    const pieces = chapter(23, 40, [
      [1, 2],
      [28, 31],
    ]);
    expect(passageReaches(pieces, { book: 23, chapter: 40, verse: 1 })).toBe(true);
    expect(passageReaches(pieces, { book: 23, chapter: 40, verse: 31 })).toBe(true);
    expect(passageReaches(pieces, { book: 23, chapter: 40, verse: 3 })).toBe(false);
    expect(passageReaches(pieces, { book: 23, chapter: 40 })).toBe(true);
  });

  unit('a span across chapters reaches every place between its ends', () => {
    const across = span(43, [14, 27], [16, 3]);
    expect(passageReaches(across, { book: 43, chapter: 14, verse: 27 })).toBe(true);
    expect(passageReaches(across, { book: 43, chapter: 15, verse: 40 })).toBe(true);
    expect(passageReaches(across, { book: 43, chapter: 16, verse: 3 })).toBe(true);
    expect(passageReaches(across, { book: 43, chapter: 14, verse: 26 })).toBe(false);
    expect(passageReaches(across, { book: 43, chapter: 16, verse: 4 })).toBe(false);
  });

  unit('with no verse, a span reaches each chapter it touches', () => {
    const across = span(43, [14, 27], [16, 3]);
    expect(passageReaches(across, { book: 43, chapter: 14 })).toBe(true);
    expect(passageReaches(across, { book: 43, chapter: 16 })).toBe(true);
    expect(passageReaches(across, { book: 43, chapter: 17 })).toBe(false);
  });

  unit('never reaches another book', () => {
    expect(passageReaches(chapter(19, 23), { book: 20, chapter: 23 })).toBe(false);
    expect(passageReaches(span(43, [1, 1], [2, 1]), { book: 42, chapter: 1, verse: 1 })).toBe(
      false,
    );
  });
});

const indexedHymn = {
  number: 7,
  topics: [{ name: 'Topic A' }, { name: 'Topic B', parent: 'Topic A' }],
  passages: [{ passage: chapter(19, 23), stanza: '2' }],
  see: [8],
  tunes: [{ name: 'TUNE A', alias: false }],
  metres: ['8.7.8.7'],
  authors: ['Author A'],
  composers: ['Composer A'],
} satisfies HymnIndexes;

const IndexedLayer = HymnalService.Test({
  indexes: {
    hymns: [indexedHymn],
    topics: { 'Topic A': [{ number: 7, page: 9 }] },
    tunes: { 'TUNE A': [{ number: 7, page: 9 }] },
    metres: { '8.7.8.7': [{ number: 7, page: 9 }] },
    passages: [
      { passage: chapter(19, 23), ref: { number: 7, page: 9, stanza: '2' } },
      { passage: span(19, [22, 1], [24, 2]), ref: { number: 8, page: 10 } },
      { passage: chapter(20, 3, [[5, 6]]), ref: { number: 9, page: 11 } },
    ],
  },
});

describe('HymnalService.Test indexes', () => {
  const test = it.effect;

  test('answers a hymn indexes from its data and empty lists for another hymn', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      expect(yield* service.getHymnIndexes(HymnId.make(7))).toEqual(indexedHymn);
      const other = yield* service.getHymnIndexes(HymnId.make(12));
      expect(other.number).toBe(12);
      expect(other.topics).toEqual([]);
      const outside = yield* Effect.result(service.getHymnIndexes(HymnId.make(696)));
      expect(Result.isFailure(outside) && outside.failure._tag === 'HymnNotFoundError').toBe(true);
    }).pipe(Effect.provide(IndexedLayer)));

  test('answers topics, tunes and metres by name, and none for an unknown name', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      expect(yield* service.getTopicHymns('Topic A')).toEqual([{ number: 7, page: 9 }]);
      expect(yield* service.getTuneHymns('TUNE A')).toEqual([{ number: 7, page: 9 }]);
      expect(yield* service.getMetreHymns('8.7.8.7')).toEqual([{ number: 7, page: 9 }]);
      expect(yield* service.getTopicHymns('Topic Z')).toEqual([]);
      expect(yield* service.getTuneHymns('constructor')).toEqual([]);
    }).pipe(Effect.provide(IndexedLayer)));

  test('answers the passages that reach a query, in their order', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const numbers = (refs: readonly { number: number }[]) => refs.map((ref) => ref.number);
      expect(numbers(yield* service.getPassageHymns({ book: 19, chapter: 23, verse: 1 }))).toEqual([
        7, 8,
      ]);
      expect(numbers(yield* service.getPassageHymns({ book: 19, chapter: 24, verse: 3 }))).toEqual(
        [],
      );
      expect(numbers(yield* service.getPassageHymns({ book: 20, chapter: 3, verse: 6 }))).toEqual([
        9,
      ]);
    }).pipe(Effect.provide(IndexedLayer)));

  test('with no indexes, each index method fails operation indexes', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const operations = yield* Effect.all([
        failedOperation(service.getHymnIndexes(HymnId.make(7))),
        failedOperation(service.getTopicHymns('Topic A')),
        failedOperation(service.getTuneHymns('TUNE A')),
        failedOperation(service.getMetreHymns('8.7.8.7')),
        failedOperation(service.getPassageHymns({ book: 19, chapter: 23 })),
      ]);
      expect(new Set(operations)).toEqual(new Set(['indexes']));
    }).pipe(Effect.provide(TestLayer)));
});
