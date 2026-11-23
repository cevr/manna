/**
 * The hymnal's back-matter indexes as the app reads them: a hymn's topics,
 * Scripture references, tune and the hymns of its metre, and the hymns on a
 * verse, and a passage's text and its search query. The indexes are bundled
 * with the app (`virtual:hymnal-indexes`, made by `vite/indexes.ts`) as
 * numbers and names only.
 *
 * `lookupsOf` answers over any `HymnIndexes`; the module's own functions
 * answer over the bundled ones, whose tables are built on the first call.
 */

import { Option } from 'effect';
import bundled from 'virtual:hymnal-indexes';

import { type Lookups, lookupsOf } from './lookups';

export type { Passage } from '@manna/hymnal/indexes';
export { passageQuery, passageText } from './passage-text';
export { lookupsOf } from './lookups';
export type { HymnIndexes, Lookups, Topic } from './lookups';

let built = Option.none<Lookups>();

/** The lookups over the bundled indexes, built on the first call. */
export const lookups = (): Lookups =>
  Option.getOrElse(built, () => {
    const made = lookupsOf(bundled);
    built = Option.some(made);
    return made;
  });

export const sameMetre: Lookups['sameMetre'] = (hymn) => lookups().sameMetre(hymn);
export const topicsOf: Lookups['topicsOf'] = (hymn) => lookups().topicsOf(hymn);
export const referencesOf: Lookups['referencesOf'] = (hymn) => lookups().referencesOf(hymn);
export const tuneOf: Lookups['tuneOf'] = (hymn) => lookups().tuneOf(hymn);
export const onVerse: Lookups['onVerse'] = (book, chapter, verse) =>
  lookups().onVerse(book, chapter, verse);
export const topicHymns: Lookups['topicHymns'] = (name) => lookups().topicHymns(name);
