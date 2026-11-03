import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, type Scope } from 'effect';
import { SqlClient } from 'effect/sql';
import { describe, expect, it } from 'effect-bun-test';

import { BunFileSystem } from '@effect/platform-bun';

import { immutableFileUri } from './immutable-uri.js';

const HOSTILE = 'weird?dir#1 100%';

const readMarkerValues = (file: string): Effect.Effect<readonly string[], never, Scope.Scope> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly value: string }>`SELECT value FROM marker`;
    return rows.map((row) => row.value);
  }).pipe(
    Effect.provide(
      SqliteBun.layer({
        filename: immutableFileUri(file),
        readonly: true,
        readwrite: false,
        create: false,
        disableWAL: true,
      }),
    ),
    Effect.orDie,
  );

const hostileDirectory = (): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const parent = yield* fs
      .makeTempDirectoryScoped({ prefix: 'bible-immutable-uri-' })
      .pipe(Effect.orDie);
    const directory = `${parent}/${HOSTILE}`;
    yield* fs.makeDirectory(directory).pipe(Effect.orDie);
    return directory;
  });

describe('immutableFileUri', () => {
  it.effect('encodes the delimiters that would otherwise truncate the path', () =>
    Effect.sync(() => {
      const uri = immutableFileUri('/tmp/weird?dir#1/topics.db');
      expect(uri).toBe('file:/tmp/weird%3Fdir%231/topics.db?immutable=1');
      expect(uri.indexOf('?')).toBe(uri.lastIndexOf('?'));
      expect(uri).not.toContain('#');
    }),
  );

  it.effect('keeps `/` a separator and leaves an already-formed URI alone', () =>
    Effect.sync(() => {
      expect(immutableFileUri('/a/b/c.db')).toBe('file:/a/b/c.db?immutable=1');
      expect(immutableFileUri('file:/a/b.db?mode=ro')).toBe('file:/a/b.db?mode=ro&immutable=1');
    }),
  );

  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('opens the file the caller named, not a prefix of it', () =>
    Effect.gen(function* () {
      const directory = yield* hostileDirectory();
      const file = `${directory}/artifact.db`;
      yield* Effect.sync(() => {
        const database = new Database(file, { create: true });
        database.exec(`CREATE TABLE marker (value TEXT NOT NULL);`);
        database.prepare('INSERT INTO marker (value) VALUES (?)').run('present');
        database.close();
      });

      const values = yield* readMarkerValues(file);

      expect(values).toEqual(['present']);
    }));
});
