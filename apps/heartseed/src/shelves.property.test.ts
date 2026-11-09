/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its cases in plain branches, tallies its kinds in plain maps and names a wrong case by its references as JSON text. */

/**
 * The shelves Add verses offers (hshomebase H8), at their seam: `SHELVES`
 * judged against `shelvesModel` (`test/home-model.ts`), which writes the
 * spec's picks out in canon numbers and derives the collection shelves from
 * the committed list less the taught ids; every pick and every promise
 * judged choosable, each verse read from the corpus and placed by
 * `placeOf` and by the canon's own table; and `offerStateOf` against
 * `offerModel` over generated fields (ranges inside, overlapping and
 * outside them, the own verse, near-misses of the range's verses) and
 * passage views (unread, 0 to 5 held).
 *
 * It catches a shelf moved, missing or added (the taught collection's), a
 * pick that names the wrong verses or cannot be added, a shared id, a range
 * twice on a shelf, a title or note that names a paid tier, and a row that
 * offers `plant` when the field holds the range, when 3 are held, or while
 * the passages are unread.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import type { Field, PlantStage } from './field';
import { versesOf } from './kjv';
import { placeOf, type List } from './lists';
import { choosable, type PassagesView } from './passages';
import { COLLECTIONS, TAUGHT } from './promises';
import { offerStateOf, SHELVES, type Shelf } from './shelves';
import { below, pickOf, random } from './test/garden-model';
import {
  heldOf as heldModelOf,
  offerModel,
  placesOf,
  shelvesModel,
  type ModelList,
  type ModelShelf,
} from './test/home-model';
import { addable, verseRef, type Held, type Span } from './test/passages-model';
import { choosableOf, CORPUS } from './test/passages-rig';

const PLACES = placesOf(CORPUS);

/** A list as plain JSON in the model's shape. */
const plainList = (list: List): ModelList => {
  const span = (range: Span): Span => ({
    book: range.book,
    chapter: range.chapter,
    first: range.first,
    last: range.last,
  });
  return {
    id: list.id,
    title: list.title,
    verses: [...list.verses],
    range: list.range === undefined ? undefined : span(list.range),
    source:
      list.source._tag === 'Passage'
        ? { tag: 'Passage', span: span(list.source.range) }
        : list.source._tag === 'Collection'
          ? { tag: 'Collection', id: list.source.id }
          : { tag: list.source._tag },
  };
};

/** A shelf as plain JSON in the model's shape. */
const plainShelf = (shelf: Shelf): ModelShelf => ({
  id: shelf.id,
  title: shelf.title,
  icon: shelf.icon,
  note: shelf.note,
  lists: shelf.source._tag === 'Bible' ? 'chooser' : shelf.source.lists.map(plainList),
});

/** Each shelf's lists, none for the chooser's. */
const listsOn = (shelf: Shelf): readonly List[] =>
  shelf.source._tag === 'Lists' ? shelf.source.lists : [];

/** What is wrong with a shelf's list: a range a reader may not add, a verse the corpus lacks, written or placed otherwise than the canon does, or a verse count off its range. */
const listWrong = (list: List): string[] => {
  const range = list.source._tag === 'Passage' ? list.source.range : undefined;
  if (range === undefined || !choosable(range) || !addable(CORPUS, range))
    return [`${list.id} not choosable`];
  const wrong = list.verses.flatMap((verse, index) => {
    const number = range.first + index;
    const text = versesOf(range.book, range.chapter)[number - 1] ?? '';
    const place = Option.getOrUndefined(placeOf(verse));
    const canon = PLACES.get(verse);
    const right =
      text.trim() !== '' &&
      verse === verseRef(range.book, range.chapter, number) &&
      canon !== undefined &&
      JSON.stringify(place) === JSON.stringify(canon);
    return right ? [] : [`${list.id} ${verse}`];
  });
  if (list.verses.length !== range.last - range.first + 1) wrong.push(`${list.id} count`);
  return wrong;
};

const PAID = /\b(pro|premium|paid|unlock|subscri|upgrade|price|trial)\b/iu;

describe('the shelves', () => {
  it('are any passage, the Psalms, the Proverbs and John as the spec picks them, then each collection the session does not teach, in order', () => {
    expect(SHELVES.map(plainShelf)).toEqual(shelvesModel());
  });

  it('hold exactly the collections the list has less the taught ones, each with one list per promise', () => {
    const wanted = COLLECTIONS.filter((collection) => !TAUGHT.includes(collection.id));
    const got = SHELVES.slice(4);
    expect(got.map((shelf) => shelf.id)).toEqual(wanted.map((collection) => collection.id));
    expect(got.map((shelf) => listsOn(shelf).length)).toEqual(
      wanted.map((collection) => collection.promises.length),
    );
    expect(got.every((shelf) => shelf.icon === 'bow')).toBe(true);
    expect(SHELVES.some((shelf) => TAUGHT.includes(shelf.id))).toBe(false);
    expect(SHELVES).toHaveLength(4 + COLLECTIONS.length - TAUGHT.length);
  });

  it('offer only lists a reader may add, each verse in the corpus and placed where the canon places it', () => {
    const lists = SHELVES.flatMap(listsOn);
    expect(lists.flatMap(listWrong).slice(0, 3)).toEqual([]);
    expect(lists.length).toBeGreaterThan(16);
  });

  it('give each shelf and each list its own id, and no shelf a range twice', () => {
    const shelfIds = SHELVES.map((shelf) => shelf.id);
    expect(new Set(shelfIds).size).toBe(shelfIds.length);
    const listIds = SHELVES.flatMap((shelf) => listsOn(shelf).map((list) => list.id));
    expect(new Set(listIds).size).toBe(listIds.length);
    for (const shelf of SHELVES) {
      const ranges = listsOn(shelf).map((list) => JSON.stringify(list.range));
      expect(new Set(ranges).size, shelf.id).toBe(ranges.length);
    }
  });

  it('name no paid tier in any title or note', () => {
    const words = SHELVES.flatMap((shelf) => [
      shelf.title,
      shelf.note,
      ...listsOn(shelf).map((list) => list.title),
    ]);
    expect(words.filter((text) => PAID.test(text) || text.includes('$'))).toEqual([]);
    expect(PAID.test('Unlock Pro')).toBe(true);
  });
});

const OWN_VERSE: Span = { book: 23, chapter: 41, first: 10, last: 10 };

const PICKS: readonly Span[] = SHELVES.flatMap((shelf) =>
  listsOn(shelf).flatMap((list) => (list.range === undefined ? [] : [list.range])),
);

/** The verses of `span`, by reference. */
const versesOfSpan = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, index) =>
    verseRef(span.book, span.chapter, span.first + index),
  );

/** A range to offer from `next`: a shelf's pick, a range a reader may choose, or the own verse, with its kind. */
const rangeOf = (next: () => number, held: readonly Span[]): readonly [string, Span] => {
  const roll = below(next, 6);
  if (roll === 0) return ['the own verse', OWN_VERSE];
  if (roll <= 2) return ['a pick', pickOf(next, PICKS as [Span, ...Span[]])];
  return ['chosen', choosableOf(next, held)[1]];
};

/** Rows of references over `span` from `next`: holding all of it (one row or split over two), part of it, or none, with near-misses and other verses beside, and the kind. */
const rowsOf = (next: () => number, span: Span): readonly [string, string[][]] => {
  const verses = versesOfSpan(span);
  const others = choosableOf(next, [])[1];
  const rows: string[][] = [versesOfSpan(others).slice(0, 1 + below(next, 4))];
  if (below(next, 2) === 0) rows.push([verseRef(23, 41, 10)]);
  const roll = below(next, 4);
  let kind = 'outside';
  if (roll === 0) {
    kind = 'inside';
    rows.push([...verses]);
  } else if (roll === 1) {
    kind = 'inside, split';
    const cut = below(next, verses.length + 1);
    rows.push(verses.slice(0, cut), [verseRef(19, 23, 1), ...verses.slice(cut)]);
  } else if (roll === 2 && verses.length > 1) {
    kind = 'overlapping';
    const dropped = below(next, verses.length);
    rows.push(verses.filter((_, index) => index !== dropped));
  }
  if (below(next, 3) === 0) {
    const missing = verses[below(next, verses.length)] ?? '';
    rows.push([`${missing} `, `${missing} [1-6]`]);
    if (kind === 'outside') kind = 'near-misses';
  }
  return [kind, rows.sort(() => next() - 0.5)];
};

const STAGES: readonly [PlantStage, ...PlantStage[]] = [
  'not planted',
  'seed',
  'blade',
  'ear',
  'full corn',
];

/** A field whose rows hold `rows`, each plant at a stage from `next`. */
const fieldOf = (next: () => number, rows: readonly (readonly string[])[]): Field => ({
  rows: rows.map((references, index) => ({
    title: `row ${index}`,
    plants: references.map((reference) => ({ reference, stage: pickOf(next, STAGES) })),
  })),
  sown: 0,
  harvest: 0,
});

/** The kinds a case's held passages reach, by how many are held and what the row offers. */
const heldKinds = (held: Held, want: string): string[] => {
  if (held.tag === 'Unread') return [];
  const count = held.passages.length;
  const kinds = [`held:${count}`];
  if (count === 3 && want !== 'in field') kinds.push('full at 3');
  if (count === 2 && want === 'plant') kinds.push('plant at 2');
  if (count >= 3 && want === 'in field') kinds.push('in field though full');
  return kinds;
};

describe('what a shelf row offers', () => {
  it('is unread while the passages are, in field when the field shows each verse at any stage, full at 3 held, else plant', () => {
    const next = random(9_801);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 1500 && wrong.length < 3; run++) {
      const held: Held = heldModelOf(next, (more, kept) => choosableOf(more, kept)[1]);
      const [rangeKind, span] = rangeOf(next, held.tag === 'Read' ? held.passages : []);
      const [rowsKind, rows] = rowsOf(next, span);
      const view: PassagesView =
        held.tag === 'Read' ? { _tag: 'Read', passages: held.passages } : { _tag: 'Unread' };
      const got = offerStateOf(span, view, fieldOf(next, rows));
      const want = offerModel(span, held, rows);
      if (got !== want) wrong.push(`${JSON.stringify(span)} ${JSON.stringify(rows)} ${got}`);
      bump(rangeKind);
      bump(rowsKind);
      bump(want);
      for (const kind of heldKinds(held, want)) bump(kind);
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of [
      'the own verse',
      'a pick',
      'chosen',
      'inside',
      'inside, split',
      'overlapping',
      'outside',
      'near-misses',
      'unread',
      'in field',
      'full',
      'plant',
      'held:0',
      'held:5',
      'full at 3',
      'plant at 2',
      'in field though full',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(20);
  });
});
