/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a topic's parent, an effect Option, is read by its tag, and a number the hymnal lacks is the port's `hymnAt`'s undefined. */

/**
 * The About-this-hymn sheet's rows, as the current app's sheet computes
 * them (`apps/hymnal/src/reader/About.tsx`): `More like this`, the hymns
 * whose meaning lies nearest (`moreLike`, `MORE_LIKE` of them, read from
 * `nearest`, the table `make.ts` writes at build time); `Topics`,
 * the Topical index's topics the hymn is listed under, each with its
 * heading; `Scripture`, the passages the Scriptural index gives it, each
 * with the query that searches for where it begins; and `Sing to another
 * tune`, the other hymns of its metre. A number the hymnal lacks is no row,
 * and a section with no rows is left out.
 */

import {
  passageQuery,
  passageText,
  referencesOf,
  sameMetre,
  topicsOf,
} from '@manna/hymnal-app/hymns/indexes';
import { ABOUT_GROUPS } from '@manna/hymnal-app/reader/about-rules';

import type { Book } from '../hymns/book.ts';
import { hymnAt } from '../hymn/page.ts';

/**
 * One row: a hymn (`number`, its `title` the label) opens its page; a topic
 * opens home at it and a passage searches for `query`. `name` is what
 * VoiceOver says, `id` the current sheet's test id.
 */
export interface AboutRow {
  readonly id: string;
  readonly kind: 'hymn' | 'topic' | 'passage';
  readonly number: number;
  readonly label: string;
  readonly detail: string;
  readonly name: string;
  readonly query: string;
}

export interface AboutGroup {
  readonly name: string;
  readonly rows: Array<AboutRow>;
}

/** The sheet for one hymn: its number and title over its groups; number 0 when the route names none. */
export interface AboutPage {
  readonly number: number;
  readonly name: string;
  readonly groups: Array<AboutGroup>;
}

export const noHymn: AboutPage = { number: 0, name: '', groups: [] };

/** A row for each of `numbers` that is a hymn, its id `<prefix>-<number>`. */
const hymnRows = (book: Book, numbers: ReadonlyArray<number>, prefix: string): Array<AboutRow> =>
  numbers.flatMap((number) => {
    const hymn = hymnAt(book, String(number));
    if (hymn === undefined) return [];
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

/** Each hymn's nearest hymns, by number: the written table. */
export type Nearest = ReadonlyMap<number, ReadonlyArray<number>>;

/** The sheet for the hymn route param `number` names, or `noHymn`, its `More like this` from `nearest`. */
export const aboutAt = (book: Book, nearest: Nearest, number: string): AboutPage => {
  const hymn = hymnAt(book, number);
  if (hymn === undefined) return noHymn;
  const { like, topics, scripture, tune } = ABOUT_GROUPS;
  const groups: Array<AboutGroup> = [
    { name: like, rows: hymnRows(book, nearest.get(hymn.number) ?? [], 'about-like') },
    {
      name: topics,
      rows: topicsOf(hymn.number).map((topic, i) => ({
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
      rows: referencesOf(hymn.number).map((passage, i) => ({
        id: `about-scripture-${i}`,
        kind: 'passage' as const,
        number: 0,
        label: passageText(passage),
        detail: '',
        name: passageText(passage),
        query: passageQuery(passage),
      })),
    },
    { name: tune, rows: hymnRows(book, sameMetre(hymn.number), 'about-tune') },
  ];
  return {
    number: hymn.number,
    name: `${hymn.number} ${hymn.title}`,
    groups: groups.filter((group) => group.rows.length > 0),
  };
};
