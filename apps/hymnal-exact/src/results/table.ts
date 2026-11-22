/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noTryCatch, eslint/no-await-in-loop -- Exact's data module cannot import effect (docs/exact.md): it answers a Promise; each field is read in a turn of its own, one after another, so no turn holds Hermes past its 100 ms; a refused read is the host's answer that it ships no table, not a defect. */

/**
 * The hymns about a search, as the current app's search mode finds them
 * (`apps/hymnal/src/hymns/meaning.ts`, through its rule `meaning-rule.ts`),
 * over the meaning table the iOS app ships as files (`meaning-files.ts`,
 * `app.json` `host.ios.resources`). The table is read at the first search
 * that asks, never at launch, and kept: each field in a turn of its own,
 * then decoded. A host that ships no such files (the web, whose `bundle:`
 * read is refused) answers no hymns about any query, so its results are the
 * matches alone. An answer names the query it was asked for, so the list
 * shows it only under that query's matches (`aboutShown`).
 */

import {
  aboutQueryIn,
  type MeaningFile,
  type Table,
  tableOf,
} from '@manna/hymnal-app/hymns/meaning-rule';

import { MEANING_FIELDS, MEANING_ROOT } from './fields.ts';

/** The hymns about `query`: `numbers`, nearest first. */
export interface AboutAnswer {
  readonly query: string;
  readonly numbers: Array<number>;
}

/** A read of one shipped file's bytes: `storage.fs.readFile`. */
export type ReadFile = (path: string) => Promise<ArrayBuffer>;

/** The table from the shipped files, each read in its own turn; none when any cannot be read. */
const readTable = async (read: ReadFile): Promise<Table | undefined> => {
  const text = new TextDecoder();
  const fields: Partial<Record<(typeof MEANING_FIELDS)[number], string>> = {};
  try {
    for (const field of MEANING_FIELDS)
      fields[field] = text.decode(await read(`${MEANING_ROOT}/${field}`));
  } catch {
    return undefined;
  }
  const file: MeaningFile = {
    dims: Number(fields.dims),
    words: fields.words ?? '',
    weights: fields.weights ?? '',
    table: fields.table ?? '',
    hymns: fields.hymns ?? '',
    vectors: fields.vectors ?? '',
    lengths: fields.lengths ?? '',
  };
  return tableOf(file);
};

/**
 * The search's hymns about a query, over the table `read` reaches: the
 * first call starts the one read, every later one waits for it, and a read
 * that fails answers none from then on.
 */
export const aboutOver = (read: ReadFile) => {
  let reading: Promise<Table | undefined> | undefined;
  return async (query: string): Promise<AboutAnswer> => {
    if (query.trim() === '') return { query, numbers: [] };
    reading ??= readTable(read);
    const table = await reading;
    return { query, numbers: table === undefined ? [] : [...aboutQueryIn(() => table, query)] };
  };
};
