/* oxlint-disable effect/noTernary, effect/noGlobals -- a Bun test in an Exact app's folder imports no effect (src/sources.test.ts): a topic's parent, an effect Option, is read by its tag, and the written table's JSON text is read back as the bundler reads it. */

/**
 * The About-this-hymn sheet's rows are the current app's: for each hymn of
 * a table spread over the book, `aboutAt` answers what `About.tsx` draws,
 * computed here from the current app's own modules in the order it draws
 * them (its `hymnRows`, `Group` and rows), and nothing for a number the
 * hymnal lacks. The table of `More like this` the build writes
 * (`nearest.ts`) is the current app's `moreLike` for every hymn. The
 * declarations Exact's type check reads are held to the modules they
 * declare.
 */

import { describe, expect, it } from 'bun:test';

import { hymnAt, hymns } from '@manna/hymnal-app/hymns/hymns';
import * as indexes from '@manna/hymnal-app/hymns/indexes';
import * as meaning from '@manna/hymnal-app/hymns/meaning';
import * as rules from '@manna/hymnal-app/reader/about-rules';

import { book } from '../hymns/book.ts';
import { aboutAt, noHymn } from './about.ts';
import { nearestRows, nearestText } from './nearest.ts';
import type * as RulesDecl from './decl/about-rules';
import type * as IndexesDecl from './decl/indexes';
import type * as MeaningDecl from './decl/meaning';

/**
 * A module's declaration with each function's parameters compared both
 * ways: the declarations name a passage looser than the source does, while
 * what a function answers must meet its declaration.
 */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  indexes: {
    sameMetre: indexes.sameMetre,
    topicsOf: indexes.topicsOf,
    referencesOf: indexes.referencesOf,
    passageText: indexes.passageText,
    passageQuery: indexes.passageQuery,
  } satisfies Held<typeof IndexesDecl>,
  meaning: { moreLike: meaning.moreLike } satisfies Held<typeof MeaningDecl>,
  rules: {
    MORE_LIKE: rules.MORE_LIKE,
    ABOUT_GROUPS: rules.ABOUT_GROUPS,
  } satisfies Held<typeof RulesDecl>,
};

/** The current sheet's rows for `numbers`, each a hymn the hymnal has (its `hymnRows`). */
const hymnRows = (numbers: ReadonlyArray<number>, prefix: string) =>
  numbers.flatMap((number) => {
    const found = hymnAt(String(number));
    if (found._tag === 'None') return [];
    const hymn = found.value;
    return [
      {
        id: `${prefix}-${hymn.number}`,
        kind: 'hymn' as const,
        number: hymn.number,
        label: hymn.title,
        detail: '',
        name: `${hymn.number}, ${hymn.title}`,
        query: '',
      },
    ];
  });

/** What the current sheet draws for hymn `number`, section by section, a section with no rows left out. */
const drawn = (number: number) => {
  const found = hymnAt(String(number));
  if (found._tag === 'None') return noHymn;
  const hymn = found.value;
  const { like, topics, scripture, tune } = held.rules.ABOUT_GROUPS;
  return {
    number,
    name: `${hymn.number} ${hymn.title}`,
    groups: [
      {
        name: like,
        rows: hymnRows(held.meaning.moreLike(number, held.rules.MORE_LIKE), 'about-like'),
      },
      {
        name: topics,
        rows: held.indexes.topicsOf(number).map((topic, i) => ({
          id: `about-topic-${i}`,
          kind: 'topic' as const,
          number: 0,
          label: topic.name,
          detail: topic.parent._tag === 'Some' ? topic.parent.value : '',
          name: topic.name,
          query: topic.name,
        })),
      },
      {
        name: scripture,
        rows: held.indexes.referencesOf(number).map((passage, i) => ({
          id: `about-scripture-${i}`,
          kind: 'passage' as const,
          number: 0,
          label: held.indexes.passageText(passage),
          detail: '',
          name: held.indexes.passageText(passage),
          query: held.indexes.passageQuery(passage),
        })),
      },
      { name: tune, rows: hymnRows(held.indexes.sameMetre(number), 'about-tune') },
    ].filter((group) => group.rows.length > 0),
  };
};

/** Five hymns across the book: the first, the last, and three between. */
const TABLE = [1, 100, 229, 462, 695];

/** The table the build writes, as the data module reads it. */
const rows = nearestRows();
const nearest = new Map(rows);

describe('About this hymn', () => {
  it("the written table is the current app's moreLike for every hymn, and its text holds it", () => {
    expect(rows).toEqual(
      hymns.map((hymn) => [hymn.number, held.meaning.moreLike(hymn.number, held.rules.MORE_LIKE)]),
    );
    const text = nearestText(rows);
    expect(
      JSON.parse(text.slice(text.indexOf('export default ') + 15, text.lastIndexOf(' as '))),
    ).toEqual(rows);
  });

  for (const number of TABLE)
    it(`answers hymn ${number}'s rows as the current sheet draws them`, () => {
      expect(aboutAt(book, nearest, String(number))).toEqual(drawn(number));
    });

  it('the table meets every kind of row and a section left out', () => {
    const pages = TABLE.map((number) => aboutAt(book, nearest, String(number)));
    const kinds = new Set(
      pages.flatMap((page) => page.groups.flatMap((g) => g.rows.map((r) => r.kind))),
    );
    expect([...kinds].toSorted()).toEqual(['hymn', 'passage', 'topic']);
    expect(pages.some((page) => page.groups.length < 4)).toBe(true);
    expect(pages.some((page) => page.groups.some((g) => g.rows.some((r) => r.detail !== '')))).toBe(
      true,
    );
  });

  it('answers no hymn for a number the hymnal lacks', () => {
    expect(['0', '696', '999', 'abc', ''].map((n) => aboutAt(book, nearest, n))).toEqual(
      Array.from({ length: 5 }, () => noHymn),
    );
  });
});
