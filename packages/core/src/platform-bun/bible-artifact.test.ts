import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import type { CorpusProvenance, CorpusSupplyReceipt } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { layerNativeBibleArtifacts, type NativeFileArtifactSource } from './bible-artifact.js';
import type { NativeFileArtifactProvenanceStore } from './file-artifact.js';

const makeProvenanceStore = (): NativeFileArtifactProvenanceStore => {
  let current = Option.none<CorpusProvenance>();

  return {
    read: () => {
      if (Option.isNone(current)) return Effect.fail('provenance is unavailable');
      return Effect.succeed(current.value);
    },
    write: (_filename, provenance) =>
      Effect.sync(() => {
        current = Option.some(provenance);
      }),
  };
};

const ensure = (
  destination: string,
  sources: readonly NativeFileArtifactSource[],
  provenanceStore: NativeFileArtifactProvenanceStore,
  fetch?: (url: string) => Effect.Effect<Response, unknown>,
): Effect.Effect<CorpusSupplyReceipt, unknown> => {
  const artifacts = layerNativeBibleArtifacts({
    destination,
    sources,
    fetch,
    provenanceStore,
    verify: () => Effect.succeed(1),
  });
  const supply = CorpusSupply.layer.pipe(Layer.provide(artifacts));
  return Effect.gen(function* () {
    return yield* (yield* CorpusSupply).ensure();
  }).pipe(Effect.provide(supply));
};

const installBibleFile = (destination: string, source: string) =>
  CorpusSupply.use((supply) => supply.ensure()).pipe(
    Effect.provide(
      CorpusSupply.layer.pipe(
        Layer.provide(
          layerNativeBibleArtifacts({
            destination,
            sources: [{ kind: 'packaged', path: source, label: 'closed-wal-bible' }],
          }),
        ),
      ),
    ),
  );

describe('native Bible Artifact adapter', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('installs a self-contained WAL Bible without staging WAL or SHM residue', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-staging-wal-' });
      const source = `${dir}/source.db`;
      const destination = `${dir}/bible.db`;
      yield* Effect.acquireUseRelease(
        Effect.sync(() => new Database(source)),
        (db) =>
          Effect.sync(() =>
            db.exec(`
          CREATE TABLE books(id INTEGER);
          INSERT INTO books WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<66) SELECT x FROM n;
          CREATE TABLE verses(version_code TEXT);
          INSERT INTO verses WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<31102) SELECT 'KJV' FROM n;
          CREATE TABLE strongs(id INTEGER); INSERT INTO strongs VALUES(1);
          CREATE TABLE cross_refs(source TEXT); INSERT INTO cross_refs VALUES('openbible'),('tske');
          CREATE TABLE margin_notes(id INTEGER); INSERT INTO margin_notes VALUES(1);
          CREATE TABLE topics(id INTEGER); INSERT INTO topics VALUES(1);
          PRAGMA journal_mode=WAL;
        `),
          ),
        (db) => Effect.sync(() => db.close()),
      );
      const receipt = yield* installBibleFile(destination, source);
      expect(receipt.activated).toMatchObject([{ corpus: 'bible', installed: 31_102 }]);
      expect((yield* fs.readDirectory(dir)).filter((name) => name.includes('.building'))).toEqual(
        [],
      );
      yield* Effect.acquireUseRelease(
        Effect.sync(() => new Database(destination, { readonly: true, create: false })),
        (db) =>
          Effect.sync(() => {
            expect(db.query('SELECT count(*) AS n FROM verses').get()).toEqual({ n: 31_102 });
          }),
        (db) => Effect.sync(() => db.close()),
      );
    }));

  test('activates the first available source atomically and reuses exact Provenance', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-native-corpus-' });
      const missing = `${directory}/missing.db`;
      const source = `${directory}/source.db`;
      const destination = `${directory}/user-data/bible.db`;
      const provenanceStore = makeProvenanceStore();
      yield* fs.writeFileString(source, 'canonical-corpus');
      const sources: readonly NativeFileArtifactSource[] = [
        { kind: 'packaged', path: missing, label: 'packaged' },
        { kind: 'workspace', path: source, label: 'development' },
      ];

      const first = yield* ensure(destination, sources, provenanceStore);
      const second = yield* ensure(destination, sources, provenanceStore);

      expect(first.activated).toMatchObject([{ corpus: 'bible', identity: 'canonical' }]);
      expect(second.activated).toEqual([]);
      expect(second.skipped).toEqual(['canonical']);
      expect(yield* fs.readFileString(destination)).toBe('canonical-corpus');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
      expect(yield* fs.exists(`${destination}.provenance.json`)).toBe(false);
    }));

  test('replaces the active Artifact when source revision changes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-native-corpus-' });
      const source = `${directory}/source.db`;
      const destination = `${directory}/bible.db`;
      const provenanceStore = makeProvenanceStore();
      const sources: readonly NativeFileArtifactSource[] = [
        { kind: 'workspace', path: source, label: 'test' },
      ];
      yield* fs.writeFileString(source, 'first');
      yield* ensure(destination, sources, provenanceStore);

      yield* fs.writeFileString(source, 'second-version');
      const result = yield* ensure(destination, sources, provenanceStore);

      expect(result.activated).toHaveLength(1);
      expect(yield* fs.readFileString(destination)).toBe('second-version');
    }));

  test('fails before runtime construction when every source is unavailable', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-native-corpus-' });
      const failure = yield* Effect.flip(
        ensure(
          `${directory}/bible.db`,
          [{ kind: 'packaged', path: `${directory}/missing.db`, label: 'missing' }],
          makeProvenanceStore(),
        ),
      );

      expect(failure).toMatchObject({ _tag: 'CorpusSourceUnavailableError' });
    }));

  test('rejects release bytes that do not match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-native-corpus-' });
      const destination = `${directory}/bible.db`;
      const failure = yield* Effect.flip(
        ensure(
          destination,
          [
            {
              kind: 'release',
              url: 'https://example.test/bible.db',
              revision: 'fixture',
              digest: `sha256:${'a'.repeat(64)}`,
              size: 'wrong bytes'.length,
            },
          ],
          makeProvenanceStore(),
          () => Effect.succeed(new Response('wrong bytes')),
        ),
      );

      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(yield* fs.exists(destination)).toBe(false);
    }));
});
