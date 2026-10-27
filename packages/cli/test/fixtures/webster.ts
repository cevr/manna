import { Database } from 'bun:sqlite';
import { Effect } from 'effect';
import source from '../../../core/assets/webster1828-source.json';

/** Full production census and FTS contract, with minimal synthetic definition text. */
export const compactWebster = (filename: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(filename)),
    (db) =>
      Effect.sync(() => {
        db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE entries(id INTEGER PRIMARY KEY,headword TEXT,key TEXT,source_html TEXT,definition TEXT);
        CREATE INDEX entries_key ON entries(key);
        CREATE VIRTUAL TABLE entries_fts USING fts5(headword,definition,content='entries',content_rowid='id');`);
        db.transaction(() => {
          db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<62391)
          INSERT INTO entries SELECT x,
            CASE WHEN x<=2 THEN 'anticonstitutional' WHEN x<=5 THEN 'counter-revolution'
              WHEN x=6 THEN 'dismayed' ELSE printf('w%d',x) END,
            CASE WHEN x<=2 THEN 'anticonstitutional' WHEN x<=5 THEN 'counter-revolution'
              WHEN x=6 THEN 'dismayed' ELSE printf('w%d',x) END,
            CASE WHEN x=6 THEN 'disheartened' ELSE 'x' END,
            CASE WHEN x=6 THEN 'disheartened' ELSE 'x' END FROM n;`);
          const insert = db.prepare('INSERT INTO meta VALUES(?,?)');
          for (const [key, value] of Object.entries({
            schema_version: '1',
            edition: source.edition,
            projection_version: '1-scan-references',
            source_url: source.url,
            source_revision: source.revision,
            source_sha256: source.sha256,
            licence: source.licence,
            source_records: String(source.records),
            notice: source.notice,
          }))
            insert.run(key, value);
          db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
        })();
      }),
    (db) => Effect.sync(() => db.close()),
  );
