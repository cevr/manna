import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Context, Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  BibleArtifact,
  makeUnregisteredFileCorpusArtifact,
  type FileArtifactInstallerService,
  type FileArtifactRecipeService,
} from '../corpus-supply/file-artifact.js';
import type {
  CorpusInstallationError,
  CorpusSourceUnavailableError,
} from '../corpus-supply/errors.js';
import type { CorpusName, CorpusProvenance } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { Target } from '../corpus-supply/model.js';
import { layerNativeTopicsArtifacts, layerNativeWebsterArtifacts } from './bible-artifact.js';
import { writeWebsterFixture } from '../webster/fixtures/sqlite-bun.js';
import {
  layerNativeFileArtifacts,
  type NativeFileArtifactProvenanceStore,
  type NativeFileArtifactSource,
} from './file-artifact.js';

/** A second File Corpus declared exactly the way a real third corpus will be:
 *  its own corpus name, its own two service keys, its own label, its own
 *  Corpus Storage Identity, its own semantic verifier. Its name is deliberately
 *  outside `CorpusFileName`, which is what proves the lifecycle is no longer
 *  bible-branded and no longer needs the receipt vocabulary widened to be
 *  exercised. */
class FixtureArtifactRecipe extends Context.Service<
  FixtureArtifactRecipe,
  FileArtifactRecipeService
>()('@manna/core/corpus-supply/test/FixtureArtifactRecipe') {}

class FixtureArtifactInstaller extends Context.Service<
  FixtureArtifactInstaller,
  FileArtifactInstallerService
>()('@manna/core/corpus-supply/test/FixtureArtifactInstaller') {}

/** The wiring read at its own boundary: the layer under test is built per case
 *  from a temp directory, so the provide belongs to this helper rather than to a
 *  block nested inside the test's generator. */
const readWiredSlots = <Wired>(
  layer: Layer.Layer<Wired>,
): Effect.Effect<{ readonly own: boolean; readonly other: boolean }> =>
  Effect.gen(function* () {
    const own = yield* Effect.serviceOption(FixtureArtifact.Installer);
    const other = yield* Effect.serviceOption(BibleArtifact.Installer);
    return { own: Option.isSome(own), other: Option.isSome(other) };
  }).pipe(Effect.provide(layer));

const FixtureArtifact = makeUnregisteredFileCorpusArtifact({
  corpus: 'fixture-corpus',
  label: 'Fixture',
  Recipe: FixtureArtifactRecipe,
  Installer: FixtureArtifactInstaller,
});

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

/** Drives the lifecycle through the fixture corpus's own Recipe and Installer
 *  keys rather than `CorpusSupply`, so the test observes exactly what the
 *  parameterized adapter does with the bytes its recipe hands it. Returns one
 *  receipt per declared source, in recipe priority order. */
const install = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly provenanceStore: NativeFileArtifactProvenanceStore;
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
}) =>
  Effect.gen(function* () {
    const recipe = yield* FixtureArtifact.Recipe;
    const installer = yield* FixtureArtifact.Installer;
    return yield* Effect.forEach(recipe.sources, (source) =>
      source.acquire.pipe(Effect.flatMap(installer.install)),
    );
  }).pipe(
    Effect.provide(
      layerNativeFileArtifacts({
        artifact: FixtureArtifact,
        destination: input.destination,
        sources: input.sources,
        provenanceStore: input.provenanceStore,
        verify: input.verify,
        fetch: input.fetch,
      }),
    ),
  );

/** Reads the corpus name an installer stamped on a failure. An unregistered
 *  corpus must leave it unset rather than borrow a registered corpus's name. */
const reportedCorpus = (
  failure: CorpusSourceUnavailableError | CorpusInstallationError,
): Option.Option<CorpusName> => {
  if (failure._tag === 'CorpusInstallationError') return Option.fromNullishOr(failure.corpus);
  return Option.none();
};

const FIXTURE_BYTES = 'wrong bytes';

const releaseSource = (input: {
  readonly digest: string;
  readonly size: number;
}): NativeFileArtifactSource => ({
  kind: 'release',
  url: 'https://example.test/fixture.db',
  revision: 'fixture-v1',
  digest: input.digest,
  size: input.size,
});

const fixtureDigest = `sha256:${bytesToHex(sha256(new TextEncoder().encode(FIXTURE_BYTES)))}`;

const attemptWebsterInstall = (destination: string, source: string) =>
  CorpusSupply.use((supply) => supply.ensure({ target: Target.webster() })).pipe(
    Effect.provide(
      CorpusSupply.layer.pipe(
        Layer.provide(
          layerNativeWebsterArtifacts({
            destination,
            sources: [{ kind: 'workspace', path: source, label: 'webster-test' }],
          }),
        ),
      ),
    ),
  );

const installTopics = (destination: string, source: string) =>
  CorpusSupply.use((supply) => supply.ensure({ target: Target.topics() })).pipe(
    Effect.provide(
      CorpusSupply.layer.pipe(
        Layer.provide(
          layerNativeTopicsArtifacts({
            destination,
            sources: [{ kind: 'packaged', path: source, label: 'topics-fixture' }],
          }),
        ),
      ),
    ),
  );

const topicsFixture = (filename: string, count: number) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(filename)),
    (db) =>
      Effect.sync(() =>
        db.exec(`
      PRAGMA journal_mode=DELETE;
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
      INSERT INTO meta VALUES('schema_major','1');
      CREATE TABLE topics(id INTEGER, name TEXT);
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<${count})
        INSERT INTO topics SELECT x, printf('%0100d', x) FROM n;
      CREATE TABLE topic_aliases(id INTEGER); INSERT INTO topic_aliases VALUES(1);
      CREATE TABLE topic_edges(id INTEGER); CREATE TABLE topic_catalog_keys(id INTEGER);
    `),
      ),
    (db) => Effect.sync(() => db.close()),
  );

/** Capture a real synced rollback journal while its transaction is open, then
 * close the writer before reusing the captured bytes. This models a crash's
 * hot side file without spawning or signalling any process.
 */
const hotJournal = (filename: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(filename, { create: false })),
    (db) =>
      Effect.gen(function* () {
        yield* Effect.sync(() => {
          db.exec(`PRAGMA synchronous=FULL; PRAGMA cache_size=10; PRAGMA cache_spill=1;
          BEGIN;
          UPDATE meta SET value=value WHERE key='schema_major';
          UPDATE topics SET id=id+1000000;
          CREATE TABLE spill(value TEXT);`);
          const insert = db.prepare('INSERT INTO spill VALUES(?)');
          for (let index = 0; index < 1000; index++) insert.run('x'.repeat(500));
        });
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFile(`${filename}-journal`);
      }),
    (db) => Effect.sync(() => db.close()),
  );

describe('parameterized File Corpus lifecycle', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('discards a stale hot staging journal before installing different candidate bytes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'sqlite-hot-staging-' });
      const old = `${dir}/old.db`;
      const source = `${dir}/source.db`;
      const destination = `${dir}/topics.db`;
      const building = `${destination}.building`;
      yield* topicsFixture(old, 3);
      yield* topicsFixture(source, 5000);
      const journal = yield* hotJournal(old);
      expect([...journal.subarray(0, 8)]).toEqual([0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7]);
      yield* fs.copyFile(old, building);
      yield* fs.writeFile(`${building}-journal`, journal);
      const receipt = yield* installTopics(destination, source);
      expect(receipt.activated).toMatchObject([{ corpus: 'topics', installed: 5000 }]);
      yield* Effect.acquireUseRelease(
        Effect.sync(() => new Database(destination, { readonly: true, create: false })),
        (db) =>
          Effect.sync(() => {
            expect(db.query('SELECT count(*) AS n FROM topics').get()).toEqual({ n: 5000 });
            expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
          }),
        (db) => Effect.sync(() => db.close()),
      );
      expect((yield* fs.readDirectory(dir)).filter((name) => name.includes('.building'))).toEqual(
        [],
      );
    }));

  test('owns staging SQLite side files before streaming and after every failed install phase', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'sqlite-staging-failure-' });
      for (const phase of ['stream', 'verify', 'provenance']) {
        const destination = `${dir}/${phase}.db`;
        const building = `${destination}.building`;
        const sideFiles = ['-journal', '-wal', '-shm'].map((suffix) => `${building}${suffix}`);
        const seed = Effect.forEach(sideFiles, (file) => fs.writeFileString(file, 'discarded'), {
          discard: true,
        });
        yield* fs.writeFileString(destination, 'active-bytes');
        yield* seed;
        const failure = yield* Effect.flip(
          install({
            destination,
            sources: [releaseSource({ digest: fixtureDigest, size: FIXTURE_BYTES.length })],
            fetch: () =>
              Effect.gen(function* () {
                for (const file of sideFiles) expect(yield* fs.exists(file)).toBe(false);
                if (phase === 'stream') return yield* Effect.fail('stream rejected');
                return new Response(FIXTURE_BYTES);
              }),
            verify: () =>
              Effect.gen(function* () {
                if (phase === 'verify') {
                  yield* seed;
                  return yield* Effect.fail('verify rejected');
                }
                return 1;
              }),
            provenanceStore: {
              read: () => Effect.fail('no prior provenance'),
              write: () => seed.pipe(Effect.andThen(Effect.fail('provenance rejected'))),
            },
          }),
        );
        expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
        expect(yield* fs.readFileString(destination)).toBe('active-bytes');
        expect((yield* fs.readDirectory(dir)).filter((name) => name.includes('.building'))).toEqual(
          [],
        );
      }
    }));

  test('installs closed WAL artifacts and committed live WAL rows without altering sources', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'sqlite-wal-artifact-' });
      for (const live of [false, true]) {
        const source = `${dir}/source-${String(live)}.db`;
        const destination = `${dir}/installed-${String(live)}.db`;
        const db = yield* Effect.acquireRelease(
          Effect.sync(() => new Database(source)),
          (db) => Effect.sync(() => db.close()),
        );
        yield* Effect.sync(() => {
          db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
            INSERT INTO meta VALUES('schema_major','1');
            CREATE TABLE topics(id INTEGER); INSERT INTO topics VALUES(1);
            CREATE TABLE topic_aliases(id INTEGER); INSERT INTO topic_aliases VALUES(1);
            CREATE TABLE topic_edges(id INTEGER); CREATE TABLE topic_catalog_keys(id INTEGER);
            PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;`);
          if (live) db.exec('INSERT INTO topics VALUES(2)');
          else db.close();
        });
        const files = [source];
        if (live) files.push(`${source}-wal`, `${source}-shm`);
        const before = yield* Effect.forEach(files, (file) =>
          Effect.gen(function* () {
            return { file, bytes: yield* fs.readFile(file), stat: yield* fs.stat(file) };
          }),
        );
        const receipt = yield* installTopics(destination, source);
        let expected = 1;
        if (live) expected = 2;
        expect(receipt.activated).toMatchObject([{ corpus: 'topics', installed: expected }]);
        expect((yield* installTopics(destination, source)).activated).toEqual([]);
        for (const { file, bytes, stat } of before) {
          expect(yield* fs.readFile(file)).toEqual(bytes);
          const after = yield* fs.stat(file);
          expect(after.ino).toEqual(stat.ino);
          expect(after.mtime).toEqual(stat.mtime);
          expect(after.size).toEqual(stat.size);
        }
        expect(yield* fs.exists(`${source}-wal`)).toBe(live);
        expect(yield* fs.exists(`${source}-shm`)).toBe(live);
        expect((yield* fs.readDirectory(dir)).filter((name) => name.includes('.building'))).toEqual(
          [],
        );
        expect(yield* fs.exists(`${destination}-wal`)).toBe(false);
      }
    }));

  test('Webster rejects a synthetic or corrupt candidate before replacing the destination', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-rejected-' });
      const destination = `${dir}/active.db`;
      yield* fs.writeFileString(destination, 'prior-bytes');
      const source = `${dir}/candidate.db`;
      yield* writeWebsterFixture(source, [{ id: 1, headword: 'word', definition: 'Synthetic.' }]);
      expect(yield* Effect.flip(attemptWebsterInstall(destination, source))).toMatchObject({
        _tag: 'CorpusInstallationError',
        corpus: 'webster',
      });
      expect(yield* fs.readFileString(destination)).toBe('prior-bytes');
      yield* fs.writeFileString(source, 'not sqlite');
      expect(yield* Effect.flip(attemptWebsterInstall(destination, source))).toMatchObject({
        _tag: 'CorpusInstallationError',
        corpus: 'webster',
      });
      expect(yield* fs.readFileString(destination)).toBe('prior-bytes');
    }));

  test('swaps the destination atomically once the candidate verifies', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const source = `${directory}/source.db`;
      const destination = `${directory}/nested/fixture.db`;
      yield* fs.writeFileString(source, 'fixture-corpus');

      const installed = yield* install({
        destination,
        sources: [{ kind: 'workspace', path: source, label: 'fixture-workspace' }],
        provenanceStore: makeProvenanceStore(),
        verify: () => Effect.succeed(7),
      });

      expect(installed).toMatchObject([
        { installed: 7, provenance: { source: 'fixture-workspace' } },
      ]);
      expect(yield* fs.readFileString(destination)).toBe('fixture-corpus');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('rejects release bytes whose digest does not match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const destination = `${directory}/fixture.db`;
      let verified = 0;

      const failure = yield* Effect.flip(
        install({
          destination,
          sources: [
            releaseSource({ digest: `sha256:${'a'.repeat(64)}`, size: FIXTURE_BYTES.length }),
          ],
          provenanceStore: makeProvenanceStore(),
          verify: () =>
            Effect.sync(() => {
              verified += 1;
              return 1;
            }),
          fetch: () => Effect.succeed(new Response(FIXTURE_BYTES)),
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        cause: 'Fixture Artifact digest does not match its release manifest',
      });
      expect(verified).toBe(0);
      expect(yield* fs.exists(destination)).toBe(false);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('rejects release bytes whose size does not match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const destination = `${directory}/fixture.db`;
      yield* fs.writeFileString(destination, 'active-generation');
      let verified = 0;

      const failure = yield* Effect.flip(
        install({
          destination,
          // Digest matches the bytes exactly; only the declared size is wrong,
          // so nothing but the size check can reject this candidate.
          sources: [releaseSource({ digest: fixtureDigest, size: FIXTURE_BYTES.length + 1 })],
          provenanceStore: makeProvenanceStore(),
          verify: () =>
            Effect.sync(() => {
              verified += 1;
              return 1;
            }),
          fetch: () => Effect.succeed(new Response(FIXTURE_BYTES)),
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        cause: 'Fixture Artifact size does not match its release manifest',
      });
      expect(verified).toBe(0);
      expect(yield* fs.readFileString(destination)).toBe('active-generation');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('accepts release bytes whose size and digest both match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const destination = `${directory}/fixture.db`;

      const installed = yield* install({
        destination,
        sources: [releaseSource({ digest: fixtureDigest, size: FIXTURE_BYTES.length })],
        provenanceStore: makeProvenanceStore(),
        verify: () => Effect.succeed(3),
        fetch: () => Effect.succeed(new Response(FIXTURE_BYTES)),
      });

      expect(installed).toMatchObject([{ installed: 3 }]);
      expect(yield* fs.readFileString(destination)).toBe(FIXTURE_BYTES);
    }));

  test('preserves the active file when semantic verification rejects the candidate', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const source = `${directory}/source.db`;
      const destination = `${directory}/fixture.db`;
      const provenanceStore = makeProvenanceStore();
      yield* fs.writeFileString(destination, 'active-generation');
      yield* fs.writeFileString(source, 'rejected-generation');

      const failure = yield* Effect.flip(
        install({
          destination,
          sources: [{ kind: 'workspace', path: source, label: 'fixture-workspace' }],
          provenanceStore,
          verify: () => Effect.fail('Fixture Artifact is incomplete'),
        }),
      );

      // An unregistered corpus never decorates a pipeline error with a name the
      // receipt vocabulary does not admit.
      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(reportedCorpus(failure)).toEqual(Option.none());
      expect(yield* fs.readFileString(destination)).toBe('active-generation');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('keeps one corpus out of another corpus service slot', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const source = `${directory}/source.db`;
      yield* fs.writeFileString(source, 'fixture-corpus');
      const layer = layerNativeFileArtifacts({
        artifact: FixtureArtifact,
        destination: `${directory}/fixture.db`,
        sources: [{ kind: 'workspace', path: source, label: 'fixture-workspace' }],
        provenanceStore: makeProvenanceStore(),
        verify: () => Effect.succeed(1),
      });

      const wired = yield* readWiredSlots(layer);

      expect(wired).toEqual({ own: true, other: false });
    }));
});
