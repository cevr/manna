import { Database } from 'bun:sqlite';
import { Effect } from 'effect';

import type { WebsterEntry } from '../model.js';
import { normalizeHeadword } from '../source.js';

/** Synthetic tiny artifact for adapter contract tests; never installable. */
export const writeWebsterFixture = (filename: string, entries: readonly WebsterEntry[]) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(filename)),
    (db) =>
      Effect.sync(() => {
        db.exec(
          `CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO meta VALUES ('schema_version','1'),('edition','1828'); CREATE TABLE entries(id INTEGER PRIMARY KEY,headword TEXT,key TEXT,source_html TEXT,definition TEXT); CREATE INDEX entries_key ON entries(key); CREATE VIRTUAL TABLE entries_fts USING fts5(headword,definition,content='entries',content_rowid='id');`,
        );
        db.transaction(() => {
          const insert = db.prepare('INSERT INTO entries VALUES (?,?,?,?,?)');
          for (const entry of entries)
            insert.run(
              entry.id,
              entry.headword,
              normalizeHeadword(entry.headword),
              `<p>${entry.definition}</p>`,
              entry.definition,
            );
          db.exec("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')");
        })();
      }),
    (db) => Effect.sync(() => db.close()),
  );
