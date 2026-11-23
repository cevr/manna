/**
 * Each hymn's head line, by its number, as the current app's `headLine`
 * words it: the hymn's section and the first passage the Scriptural index
 * gives it, in its printed order, with how many more follow. Built at
 * prepare (`src/hymns/make.ts`, into `heads.gen.json`, ignored, the data
 * module's `virtual:hymnal-heads`) from the back-matter indexes, so a hymn
 * page draws its head line without reading the indexes file, which is read
 * at the first search, index tab or About sheet (`src/indexes/load.ts`).
 * The line carries no hymn text: a section's name and passages.
 */

import { type HymnIndexes, lookupsOf } from '@manna/hymnal-app/hymns/lookups';
import type { HymnText } from '@manna/hymnal-app/hymns/text';
import { headLine } from '@manna/hymnal-app/reader/head-line';

/** A head line by hymn number. */
export type Heads = Readonly<Record<string, string>>;

/** The head line of each of `hymns` over `indexes`, by the current app's own `headLine` and `referencesOf`. */
export const headsOf = (hymns: ReadonlyArray<HymnText>, indexes: HymnIndexes): Heads => {
  const { referencesOf } = lookupsOf(indexes);
  return Object.fromEntries(
    hymns.map((hymn) => [`${hymn.number}`, headLine(hymn.topic, referencesOf(hymn.number))]),
  );
};
