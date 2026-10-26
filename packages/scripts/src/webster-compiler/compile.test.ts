import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Result } from 'effect';
import { expect, it } from 'effect-bun-test';

import { compileWebster } from './compile.js';

it.scoped('applies scan-backed citation corrections and retains the unmodified source HTML', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-citations-' });
    const csv = new TextEncoder().encode(
      'charity,<p>1 Corinthians 8:1.</p>\nlove,<p>God is love 1 John 4:7.</p>\nprevent,<p>Psalms 119:148.</p>\n',
    );
    const artifact = yield* compileWebster({ csv, destination: `${dir}/corrected.db` });
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => new Database(artifact.path, { readonly: true })),
      (opened) => Effect.sync(() => opened.close()),
    );
    expect(db.query('SELECT source_html, definition FROM entries ORDER BY id').all()).toEqual([
      { source_html: '<p>1 Corinthians 8:1.</p>', definition: '1 Corinthians 13.' },
      { source_html: '<p>God is love 1 John 4:7.</p>', definition: 'God is love. 1 John 4.' },
      { source_html: '<p>Psalms 119:148.</p>', definition: 'Psalms 119.' },
    ]);
  }).pipe(Effect.provide(BunServices.layer)),
);

it.scoped(
  'preserves quoted CSV records, duplicate headwords, HTML and literal definition FTS',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-compile-' });
      const csv =
        'Word,"<p>First, &amp; &quot;quoted&quot;.</p><p>2. Next\nline.</p>"\r\nWord,"<p>Duplicate ""quote"".</p>"\r\n';
      const artifact = yield* compileWebster({
        csv: new TextEncoder().encode(csv),
        destination: `${dir}/dictionary.db`,
      });
      expect(artifact.records).toBe(2);
      const db = yield* Effect.acquireRelease(
        Effect.sync(() => new Database(artifact.path, { readonly: true })),
        (opened) => Effect.sync(() => opened.close()),
      );
      const rows = db
        .query('SELECT id, headword, key, source_html, definition FROM entries ORDER BY id')
        .all();
      expect(rows).toEqual([
        {
          id: 1,
          headword: 'Word',
          key: 'word',
          source_html: '<p>First, &amp; &quot;quoted&quot;.</p><p>2. Next\nline.</p>',
          definition: 'First, & "quoted".\n\n2. Next line.',
        },
        {
          id: 2,
          headword: 'Word',
          key: 'word',
          source_html: '<p>Duplicate "quote".</p>',
          definition: 'Duplicate "quote".',
        },
      ]);
      expect(
        db.query("SELECT rowid FROM entries_fts WHERE entries_fts MATCH 'duplicate'").all(),
      ).toEqual([{ rowid: 2 }]);
    }).pipe(Effect.provide(BunServices.layer)),
);

it.scoped(
  'rejects malformed source and digest mismatches without replacing a good build; repeated builds are deterministic',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-invalid-' });
      const destination = `${dir}/dictionary.db`;
      const csv = new TextEncoder().encode(
        'alpha,"<p>Good &amp; safe.</p><script>hidden</script><style>hidden</style>"\n',
      );
      const first = yield* compileWebster({ csv, destination });
      const original = yield* fs.readFile(destination);
      const second = yield* compileWebster({ csv, destination });
      expect(second.sha256).toBe(first.sha256);
      for (const bad of [
        '',
        'word',
        'word,',
        ',definition',
        'word,"unfinished',
        'word,"closed"junk',
        'word,un"quoted',
        'word,one,extra',
        'word,<script>hidden</script>',
      ]) {
        const result = yield* Effect.result(
          compileWebster({ csv: new TextEncoder().encode(bad), destination }),
        );
        expect(Result.isFailure(result)).toBe(true);
        expect(yield* fs.readFile(destination)).toEqual(original);
      }
      const mismatch = yield* Effect.result(
        compileWebster({ csv, destination, expectedDigest: '0'.repeat(64) }),
      );
      expect(Result.isFailure(mismatch)).toBe(true);
      expect(yield* fs.readFile(destination)).toEqual(original);
      const failedVerification = yield* Effect.result(
        compileWebster({ csv, destination, expectedRecords: 2, expectedKeys: 2 }),
      );
      expect(Result.isFailure(failedVerification)).toBe(true);
      if (Result.isFailure(failedVerification))
        expect(failedVerification.failure.message).toContain('census mismatch');
      expect(yield* fs.readFile(destination)).toEqual(original);
    }).pipe(Effect.provide(BunServices.layer)),
);
