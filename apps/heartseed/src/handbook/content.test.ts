/**
 * The Bible Handbook as the app reads it (hsdoctrine R9): `HANDBOOK`,
 * `HANDBOOK_LISTS` and `HANDBOOK_SOURCE` over the committed
 * `data/handbook.json`, each range read through the app's own corpus
 * (`versesOf`) and its own pieces and field rows (`collectionPieces`,
 * `fieldPassagesOf`).
 *
 * It catches a list, a range or a section dropped or added (the totals),
 * a range past its chapter or longer than a passage, a verse with no
 * text, a list or section shown with no range, an id twice or shared with
 * a promise collection, a title the app words itself (a "Doctrine"), a
 * practical section kept, a list whose pieces or field row lose its
 * title or its order. It misses
 * a range moved to another of the same size in the same chapter, which
 * only the parity with the planner's model sees.
 */

import { describe, expect, it } from 'bun:test';

import data from '../../data/handbook.json';
import { HANDBOOK, HANDBOOK_LISTS, HANDBOOK_SOURCE } from '../handbook';
import { versesOf } from '../kjv';
import { type Range, collectionPieces, verseReference } from '../passages';
import { COLLECTIONS } from '../promises';
import { fieldPassagesOf } from '../promises/taught';

/** Each verse of `range` by its reference, in order. */
const versesIn = (range: Range) =>
  Array.from({ length: range.last - range.first + 1 }, (_, index) =>
    verseReference(range.book, range.chapter, range.first + index),
  );

const RANGES = HANDBOOK_LISTS.flatMap((list) =>
  list.promises.map((range) => ({ id: list.id, range })),
);

/** How many skipped records the data holds for `reason`. */
const skippedFor = (reason: string) =>
  data.skipped.filter((record) => record.reason === reason).length;

/** The sections Haskell wrote on practical matters, which the owner left out (2026-11-09). */
const LEFT_OUT = [
  'Health and Temperance',
  'Dress',
  'Diet and Dress',
  'Business Principles',
  'School of the Prophets',
  'Bible Etiquette',
  'City Work',
  'Organization of Local Churches Officers',
];

describe('the Bible Handbook in the app', () => {
  it('holds data/handbook.json, each section and list in order, each range as a Range', () => {
    const sections: unknown = data.sections.map((section) => ({
      id: section.id,
      title: section.title,
      lists: section.lists.map((list) => ({
        id: list.id,
        title: list.title,
        promises: list.ranges.map(([book, chapter, first, last]) => ({
          book,
          chapter,
          first,
          last,
        })),
      })),
    }));
    expect<unknown>(HANDBOOK).toEqual(sections);
    expect(HANDBOOK_LISTS).toEqual(HANDBOOK.flatMap((section) => section.lists));
  });

  it('holds the teaching sections: 25 sections, 130 lists, 2,528 ranges over 3,542 verses, 15 skipped', () => {
    expect({
      sections: HANDBOOK.length,
      lists: HANDBOOK_LISTS.length,
      ranges: RANGES.length,
      verses: new Set(RANGES.flatMap(({ range }) => versesIn(range))).size,
      skipped: data.skipped.length,
      byReason: ['past-chapter', 'long', 'unread', 'unlinked'].map(skippedFor),
      leftOut: HANDBOOK.filter((section) => LEFT_OUT.includes(section.title)).map(
        (section) => section.title,
      ),
    }).toEqual({
      sections: 25,
      lists: 130,
      ranges: 2528,
      verses: 3542,
      skipped: 15,
      byReason: [3, 9, 3, 0],
      leftOut: [],
    });
  });

  it('shows no empty section and no empty list', () => {
    expect({
      sections: HANDBOOK.filter((section) => section.lists.length === 0).map(
        (section) => section.id,
      ),
      lists: HANDBOOK_LISTS.filter((list) => list.promises.length === 0).map((list) => list.id),
    }).toEqual({ sections: [], lists: [] });
  });

  it('resolves every range in the bundled KJV: 1-20 verses of one chapter, each with text', () => {
    const wrong = RANGES.flatMap(({ id, range }) => {
      const size = range.last - range.first + 1;
      const texts = versesOf(range.book, range.chapter).slice(range.first - 1, range.last);
      const right =
        range.first >= 1 &&
        size >= 1 &&
        size <= 20 &&
        texts.length === size &&
        texts.every((text) => text.trim() !== '');
      if (right) return [];
      return [`${id} ${versesIn(range).join(' ')}`];
    });
    expect(wrong).toEqual([]);
  });

  it('gives each section and list its own bhb id, none a promise collection’s', () => {
    const ids = [
      ...HANDBOOK.map((section) => section.id),
      ...HANDBOOK_LISTS.map((list) => list.id),
    ];
    const lists = HANDBOOK_LISTS.map((list) => list.id);
    expect({
      twiceInSections: HANDBOOK.length - new Set(HANDBOOK.map((section) => section.id)).size,
      twiceInLists: lists.length - new Set(lists).size,
      misnamed: ids.filter((id) => !/^bhb-\d+$/.test(id)),
      shared: COLLECTIONS.map((collection) => collection.id).filter((id) => ids.includes(id)),
      collections: COLLECTIONS.length,
    }).toEqual({ twiceInSections: 0, twiceInLists: 0, misnamed: [], shared: [], collections: 14 });
  });

  it('names its source, and titles each list and section by Haskell alone', () => {
    const titles = HANDBOOK.flatMap((section) => [
      section.title,
      ...section.lists.map((list) => list.title),
    ]);
    expect({
      source: HANDBOOK_SOURCE,
      file: data.source,
      doctrine: titles.filter((title) => /doctrine/i.test(title)),
      blank: titles.filter((title) => title.trim() !== title || title === ''),
    }).toEqual({
      source: { title: 'Bible Handbook', author: 'Stephen N. Haskell', year: 1919 },
      file: {
        title: 'Bible Handbook',
        author: 'Stephen N. Haskell',
        year: 1919,
        code: 'BHB',
        contents: 'https://text.egwwritings.org/book/b978',
      },
      doctrine: [],
      blank: [],
    });
  });

  it('reads each list as pieces of its distinct verses in order, grouped and field-titled by its title', () => {
    const read = HANDBOOK_LISTS.map((list) => {
      const pieces = collectionPieces([list]);
      return {
        id: list.id,
        verses: [...new Set(pieces.map((piece) => piece.reference))],
        groups: [...new Set(pieces.map((piece) => piece.group))],
        field: fieldPassagesOf([], { _tag: 'Read', passages: [], lists: [] }, [list]),
      };
    });
    expect(read).toEqual(
      HANDBOOK_LISTS.map((list) => {
        const verses = [...new Set(list.promises.flatMap(versesIn))];
        return {
          id: list.id,
          verses,
          groups: [list.title],
          field: [
            {
              id: `collection:${list.id}`,
              source: { _tag: 'Collection', id: list.id },
              title: list.title,
              verses,
            },
          ],
        };
      }),
    );
  });
});
