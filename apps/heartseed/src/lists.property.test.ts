/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its cases in plain branches, tallies its kinds in plain maps and names a wrong case by its references as JSON text. */

/**
 * Verses and lists (hshomebase L1-L3), at their seam: `placeOf` judged
 * against the canon's own table of verses (`placesOf` over the KJV's rows,
 * `test/home-model.ts`), and `listsOf` (with `fieldPassagesOf`, which gives
 * its result) against `listsModel` over generated own rows, held passages
 * (unread, or 0 to 5, equal ones included) and taught ids (none, one,
 * several, or unknown).
 *
 * It catches a place for a reference that does not round-trip (a trailing
 * space, a lower-case book, an alias, a verse past its chapter, a phrase),
 * a missing place for a canon verse, a row moved or dropped, an id shared
 * by two equal held ranges, a range on a list that is not a passage, and a
 * source of the wrong kind.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { listsOf, placeOf, type List } from './lists';
import type { PassagesView } from './passages';
import { COLLECTIONS } from './promises';
import { collectionsOf, fieldPassagesOf } from './promises/taught';
import { anyReference, trickyReferences, type ModelPassage } from './test/field-model';
import { below, pickOf, random } from './test/garden-model';
import { listsModel, placesOf, type ModelList } from './test/home-model';
import { NAMES, verseRef, type Held, type Span } from './test/passages-model';
import { choosableOf, CORPUS } from './test/passages-rig';
import { fieldPassagesModel } from './test/promise-model';

const PLACES = placesOf(CORPUS);

const OWN: readonly ModelPassage[] = [{ title: 'Isaiah 41:10', verses: ['Isaiah 41:10'] }];

const IDS = COLLECTIONS.map((collection) => collection.id);

/** The place the canon's table gives `reference`, as JSON text, or `none`. */
const placeWanted = (reference: string) => {
  const place = PLACES.get(reference);
  return place === undefined ? 'none' : JSON.stringify(place);
};

/** The place `placeOf` gives `reference`, as JSON text, or `none`. */
const placeGot = (reference: string) =>
  Option.match(placeOf(reference), {
    onNone: () => 'none',
    onSome: (place) =>
      JSON.stringify({ book: place.book, chapter: place.chapter, verse: place.verse }),
  });

/** The verse count of a chapter, read from the canon's table. */
const countOf = (book: number, chapter: number) => {
  let count = 0;
  while (PLACES.has(verseRef(book, chapter, count + 1))) count += 1;
  return count;
};

/** A canon verse from `next`: its book, chapter, verse, its chapter's verse count and its book's chapter count. */
const canonVerse = (next: () => number) => {
  const book = pickOf(next, CORPUS.books as [number, ...number[]]);
  const chapters = CORPUS.counts.get(book) ?? 1;
  const chapter = 1 + below(next, chapters);
  const count = countOf(book, chapter);
  const verse = 1 + below(next, count);
  return { book, chapter, verse, count, chapters };
};

/** A reference near a canon verse that is not one, or the verse itself, from `next`, with its kind. */
const nearMiss = (next: () => number): readonly [string, string] => {
  const { book, chapter, verse, count, chapters } = canonVerse(next);
  const name = NAMES.get(book) ?? '';
  const reference = verseRef(book, chapter, verse);
  return pickOf<readonly [string, string]>(next, [
    ['canon', reference],
    ['trailing space', `${reference} `],
    ['leading space', ` ${reference}`],
    ['lower case', reference.toLowerCase()],
    ['upper case', reference.toUpperCase()],
    ['verse 0', `${name} ${chapter}:0`],
    ['verse past the chapter', `${name} ${chapter}:${count + 1}`],
    ['leading zero', `${name} ${chapter}:0${verse}`],
    ['chapter past the book', `${name} ${chapters + 1}:1`],
    ['chapter 0', `${name} 0:${verse}`],
    ['two spaces', `${name}  ${chapter}:${verse}`],
    ['no space', `${name}${chapter}:${verse}`],
    ['a range', `${reference}-${verse + 1}`],
    ['a dot', `${name} ${chapter}.${verse}`],
    ['a phrase', `${reference} [1-6]`],
    ['a sign', `${name} ${chapter}:+${verse}`],
    ['no book', `${chapter}:${verse}`],
    ['a tab', `${name}\t${chapter}:${verse}`],
    ['tricky', pickOf(next, trickyReferences(reference))],
    ['any', anyReference(next, reference)],
  ]);
};

/** A list as plain JSON in the model's shape. */
const plainList = (list: List): ModelList => ({
  id: list.id,
  title: list.title,
  verses: [...list.verses],
  range:
    list.range === undefined
      ? undefined
      : {
          book: list.range.book,
          chapter: list.range.chapter,
          first: list.range.first,
          last: list.range.last,
        },
  source:
    list.source._tag === 'Passage'
      ? {
          tag: 'Passage',
          span: {
            book: list.source.range.book,
            chapter: list.source.range.chapter,
            first: list.source.range.first,
            last: list.source.range.last,
          },
        }
      : list.source._tag === 'Collection'
        ? { tag: 'Collection', id: list.source.id }
        : { tag: list.source._tag },
});

/** Taught ids: none, one, several in any order, or with an id no collection has. */
const taughtOf = (next: () => number): readonly [string, string[]] => {
  const roll = below(next, 8);
  if (roll === 0) return ['none', []];
  if (roll <= 2) return ['one', [pickOf(next, IDS as [string, ...string[]])]];
  const several = [...IDS].sort(() => next() - 0.5).slice(0, 2 + below(next, 4));
  if (roll <= 5) return ['several', several];
  return ['unknown', [...several.slice(0, 1), 'no-such-collection', ...several.slice(1)]];
};

/** Held passages: unread, or 0 to 5 choosable ranges, equal ones and the own verse's chapter among them. */
const heldOf = (next: () => number): Held => {
  if (below(next, 8) === 0) return { tag: 'Unread' };
  const passages: Span[] = [];
  for (let n = below(next, 6); n > 0; n--) {
    const kept = passages[below(next, Math.max(1, passages.length))];
    if (kept !== undefined && below(next, 3) === 0) passages.push({ ...kept });
    else passages.push(choosableOf(next, passages)[1]);
  }
  return { tag: 'Read', passages };
};

/** The own rows: the promise's, none, or two. */
const ownOf = (next: () => number): readonly ModelPassage[] => {
  const roll = below(next, 6);
  if (roll === 0) return [];
  if (roll === 1) return [...OWN, { title: 'Psalms 23:1', verses: ['Psalms 23:1'] }];
  return OWN;
};

describe('a verse', () => {
  it('has a place for the first and the last verse of every chapter of the canon, each round-tripping', () => {
    const wrong: string[] = [];
    let chapters = 0;
    for (const book of CORPUS.books)
      for (let chapter = 1; chapter <= (CORPUS.counts.get(book) ?? 0); chapter++) {
        chapters += 1;
        const count = countOf(book, chapter);
        for (const verse of [1, count]) {
          const reference = verseRef(book, chapter, verse);
          if (placeGot(reference) !== JSON.stringify({ book, chapter, verse }))
            wrong.push(reference);
        }
      }
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(chapters).toBe(1189);
  });

  it('has a place exactly when it is a canon verse written as the canon writes it', () => {
    const next = random(9_401);
    const tally = new Map<string, number>();
    const wrong: string[] = [];
    for (let run = 0; run < 4000; run++) {
      const [kind, reference] = nearMiss(next);
      tally.set(kind, (tally.get(kind) ?? 0) + 1);
      if (placeGot(reference) !== placeWanted(reference)) wrong.push(JSON.stringify(reference));
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const [kind, count] of tally) expect(count, kind).toBeGreaterThanOrEqual(100);
    expect(tally.size).toBe(20);
  });

  it('has no place for a phrase, a trailing space, an alias, verse 0, a chapter the book lacks or no text', () => {
    expect(
      [
        'Isaiah 41:10',
        'Isaiah 41:10 [1-6]',
        'Isaiah 41:10 ',
        'Ps 23:1',
        'Psalms 23:0',
        'Psalms 151:1',
        '',
        'Isaiah',
      ].map(placeGot),
    ).toEqual([
      JSON.stringify({ book: 23, chapter: 41, verse: 10 }),
      'none',
      'none',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
  });
});

describe('the lists the field holds', () => {
  it('are the own rows, each range held in stored order, then each taught collection, ids unique and a range on each passage alone, as the rule makes them', () => {
    const next = random(9_402);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 500; run++) {
      const own = ownOf(next);
      const held = heldOf(next);
      const [taughtKind, taught] = taughtOf(next);
      const view: PassagesView =
        held.tag === 'Read' ? { _tag: 'Read', passages: held.passages } : { _tag: 'Unread' };
      const got = listsOf(own, view, collectionsOf(taught));
      const want = listsModel(own, held, taught);
      const ids = got.map((list) => list.id);
      const rangeOnPassage = got.every(
        (list) => (list.range !== undefined) === (list.source._tag === 'Passage'),
      );
      if (
        JSON.stringify(got.map(plainList)) !== JSON.stringify(want) ||
        new Set(ids).size !== ids.length ||
        !rangeOnPassage
      )
        wrong.push(`${JSON.stringify(held)} ${JSON.stringify(taught)}`);
      const shown = fieldPassagesOf(own, view, collectionsOf(taught)).map((list) => ({
        title: list.title,
        verses: list.verses,
        range: list.range,
      }));
      const base = fieldPassagesModel(own, held, taught).map((row, index) => ({
        ...row,
        range: want[index]?.range,
      }));
      if (JSON.stringify(shown) !== JSON.stringify(base))
        wrong.push(`field ${JSON.stringify(held)}`);
      bump(`taught:${taughtKind}`);
      if (held.tag === 'Unread') bump('unread');
      else {
        bump(`held:${held.passages.length}`);
        const spans = held.passages.map((span) => JSON.stringify(span));
        if (new Set(spans).size < spans.length) bump('equal ranges');
        if (held.passages.some((span) => span.book === 23 && span.chapter === 41))
          bump('over the own verse');
      }
      if (own.length === 0) bump('no own row');
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of [
      'taught:none',
      'taught:one',
      'taught:several',
      'taught:unknown',
      'unread',
      'held:0',
      'held:5',
      'equal ranges',
      'over the own verse',
      'no own row',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(15);
  });

  it('give two equal held ranges two ids, and keep the own row while the passages are unread', () => {
    const psalm: Span = { book: 19, chapter: 23, first: 1, last: 6 };
    const read = listsOf(OWN, { _tag: 'Read', passages: [psalm, { ...psalm }] }, []);
    expect(read.map((list) => list.id)).toEqual([
      'own:Isaiah 41:10',
      'passage:0:19.23.1-6',
      'passage:1:19.23.1-6',
    ]);
    const unread = listsOf(OWN, { _tag: 'Unread' }, collectionsOf(['protection']));
    expect(unread.map((list) => [list.id, list.source._tag])).toEqual([
      ['own:Isaiah 41:10', 'Own'],
      ['collection:protection', 'Collection'],
    ]);
  });
});
