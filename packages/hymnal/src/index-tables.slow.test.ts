/**
 * The 12 committed index files (`data/indexes/`), written to the `index_*`
 * tables of an in-memory database, read back as decoded, and the comparison
 * names an index or the rulings once they differ. Slow: it decodes and
 * stores the whole 1.8 MB set, which the hymnal unit tests' 1 s cannot hold.
 */
import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';
/* oxlint-disable effect/noNodeBuiltinImport -- reads the committed index files, read-only. */
import { readFileSync } from 'node:fs';

import { Schema } from 'effect';

import {
  diffIndexTables,
  IndexesSchema,
  readIndexTables,
  writeIndexTables,
} from './index-tables.js';
import { IndexName, Rulings } from './indexes.js';

const DIR = `${import.meta.dir}/../data/indexes`;
const parse = Schema.decodeSync(Schema.fromJsonString(Schema.Unknown));
const file = (name: string) => parse(readFileSync(`${DIR}/${name}.json`, 'utf8'));

it('read back every committed index and the rulings as decoded, and name an index that differs', () => {
  const sources = {
    indexes: Schema.decodeSync(IndexesSchema)(
      Object.fromEntries(IndexName.literals.map((name) => [name, file(name)])),
    ),
    rulings: Schema.decodeUnknownSync(Rulings)(file('rulings')),
  };
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.transaction(() => writeIndexTables(db, sources))();
  const read = readIndexTables(db);
  db.close();

  expect(IndexName.literals.filter((name) => read.indexes[name] === undefined)).toStrictEqual([]);
  expect(read).toStrictEqual(sources);
  expect(diffIndexTables(sources, read)).toStrictEqual([]);
  const topical = sources.indexes.topical;
  const fewer = {
    ...sources,
    indexes: {
      ...sources.indexes,
      topical: topical && { ...topical, topics: topical.topics.slice(1) },
    },
  };
  expect(diffIndexTables(fewer, read)).toStrictEqual(['topical']);
  expect(
    diffIndexTables({ ...sources, rulings: { ...sources.rulings, rulings: [] } }, read),
  ).toStrictEqual(['rulings']);
});
