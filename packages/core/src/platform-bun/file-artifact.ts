import * as BunHttpClient from '@effect/platform-bun/BunHttpClient';
import { Database } from 'bun:sqlite';
import * as BunServices from '@effect/platform-bun/BunServices';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  CorpusInstallationError,
  CorpusSourceUnavailableError,
  SqliteRefreshRefused,
} from '../corpus-supply/errors.js';
import type { FileArtifactSourceKind, FileCorpusArtifact } from '../corpus-supply/file-artifact.js';
import {
  assetSourceId,
  corpusDigest,
  corpusGeneration,
  corpusRevision,
  CorpusProvenance,
  registeredCorpusName,
  type CorpusGeneration,
} from '../corpus-supply/model.js';
import { Effect, FileSystem, Layer, Option, Path, Predicate, Schema, Stream } from 'effect';
import { HttpClient } from 'effect/http';

interface LocalFileArtifactSource {
  readonly kind: Exclude<FileArtifactSourceKind, 'release'>;
  readonly path: string;
  readonly label: string;
}

interface ReleaseFileArtifactSource {
  readonly kind: 'release';
  readonly url: string;
  readonly revision: string;
  readonly digest: string;
  readonly size: number;
  readonly generation?: Option.Option<CorpusGeneration>;
}

export type NativeFileArtifactSource = LocalFileArtifactSource | ReleaseFileArtifactSource;

type FileArtifactLayout = 'sqlite' | 'flat';

const StoredProvenance = Schema.Struct({
  source: Schema.String,
  revision: Schema.String,
  digest: Schema.String,
  generation: Schema.optionalKey(Schema.Int),
  artifact: Schema.optionalKey(Schema.String),
});

const provenanceFrom = (stored: typeof StoredProvenance.Type): CorpusProvenance =>
  CorpusProvenance.make({
    source: assetSourceId(stored.source),
    revision: corpusRevision(stored.revision),
    digest: Option.some(corpusDigest(stored.digest)),
    generation: Option.map(Option.fromUndefinedOr(stored.generation), corpusGeneration),
  });

const storedGeneration = (raw: Option.Option<string>): { readonly generation?: number } =>
  Option.match(
    Option.flatMap(raw, (value) => Schema.decodeOption(Schema.Int)(Number(value))),
    {
      onNone: () => ({}),
      onSome: (generation) => ({ generation }),
    },
  );

export interface NativeFileArtifactProvenanceStore {
  readonly read: (filename: string) => Effect.Effect<CorpusProvenance, unknown>;
  readonly write: (filename: string, provenance: CorpusProvenance) => Effect.Effect<void, unknown>;
}

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  CorpusSourceUnavailableError.make({ operation, cause });

export const checkSqliteRefresh = Effect.fn('FileArtifact.checkSqliteRefresh')(function* (
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const inspectionRefused = (wal: string) =>
    SqliteRefreshRefused.make({
      destination,
      wal,
      message: `Cannot inspect ${wal} for ${destination}; refresh refused. Close the database-using program and let SQLite checkpoint cleanly, then retry.`,
    });
  const resolved = yield* fs.realPath(destination).pipe(
    Effect.asSome,
    Effect.catchIf(
      (cause) => cause.reason._tag === 'NotFound',
      () => Effect.succeedNone,
    ),
    Effect.mapError(() => inspectionRefused(`${destination}-wal`)),
  );
  const paths = new Set([destination, ...Option.toArray(resolved)]);
  for (const database of paths) {
    const wal = `${database}-wal`;
    const details = yield* fs.stat(wal).pipe(
      Effect.asSome,
      Effect.catchIf(
        (cause) => cause.reason._tag === 'NotFound',
        () => Effect.succeedNone,
      ),
      Effect.mapError(() => inspectionRefused(wal)),
    );
    if (!Option.exists(details, (info) => info.size > 0n)) continue;
    const exists = yield* fs.exists(database).pipe(Effect.mapError(() => inspectionRefused(wal)));
    let recovery =
      'Close the database-using program and let that program/SQLite checkpoint cleanly, then retry.';
    if (!exists)
      recovery =
        'The matching database file is missing. Close the database-using program. Keep the WAL and recover its matching database from backup before letting SQLite checkpoint cleanly; then retry.';
    return yield* SqliteRefreshRefused.make({
      destination,
      wal,
      message: `Refusing to replace ${destination}: ${wal} is non-empty. Replacement could replay the outgoing WAL and corrupt data. ${recovery}`,
    });
  }
});

const localSource = (
  corpus: string,
  source: LocalFileArtifactSource,
  layout: FileArtifactLayout,
) => ({
  kind: source.kind,
  acquire: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const details = yield* fs.stat(source.path);
    if (details.type !== 'File' || details.size === 0n) {
      return yield* sourceError(`open-${corpus}-artifact:${source.label}`, 'source is empty');
    }
    const modified = Option.match(details.mtime, {
      onNone: () => 'unknown',
      onSome: (value) => String(value.getTime()),
    });
    const provenance = CorpusProvenance.make({
      source: assetSourceId(source.label),
      revision: corpusRevision(`${String(details.size)}-${modified}`),
      digest: Option.none(),
    });
    return {
      kind: source.kind,
      provenance,
      expectedSize: Option.none(),
      bytes: localFileBytes(source.path, layout).pipe(
        Stream.mapError((cause) => sourceError(`read-${corpus}-artifact:${source.label}`, cause)),
      ),
    };
  }).pipe(
    Effect.mapError((cause) => sourceError(`open-${corpus}-artifact:${source.label}`, cause)),
    Effect.provide(BunServices.layer),
  ),
});

interface FileArtifactResponse {
  readonly status: number;
  readonly bytes: Stream.Stream<Uint8Array, unknown>;
}

const releaseSource = (
  corpus: string,
  source: ReleaseFileArtifactSource,
  fetchArtifact: (url: string) => Effect.Effect<FileArtifactResponse, unknown>,
) => ({
  kind: source.kind,
  acquire: Effect.succeed({
    kind: source.kind,
    provenance: CorpusProvenance.make({
      source: assetSourceId(`${corpus}-release`),
      revision: corpusRevision(source.revision),
      digest: Option.some(corpusDigest(source.digest)),
      generation: source.generation ?? Option.none(),
    }),
    expectedSize: Option.some(source.size),
    bytes: Stream.unwrap(
      fetchArtifact(source.url).pipe(
        Effect.mapError((cause) => sourceError(`fetch-${corpus}-release`, cause)),
        Effect.flatMap((response) => {
          if (response.status < 200 || response.status >= 300)
            return Effect.fail(
              sourceError(`fetch-${corpus}-release`, `HTTP ${String(response.status)}`),
            );
          return Effect.succeed(
            response.bytes.pipe(
              Stream.mapError((cause) => sourceError(`read-${corpus}-release`, cause)),
            ),
          );
        }),
      ),
    ),
  }),
});

class FileArtifactStoreError extends Schema.TaggedError<FileArtifactStoreError>()(
  'FileArtifactStoreError',
  { operation: Schema.String, cause: Schema.Unknown },
) {}

export const storeError = (operation: string) => (cause: unknown) =>
  FileArtifactStoreError.make({ operation, cause });

const openDatabase = (filename: string, readonly: boolean) =>
  Effect.try({
    try: () => new Database(filename, { readonly, create: false }),
    catch: storeError('open-database'),
  });

export const closeDatabase = (database: Database) =>
  Effect.try({
    try: () => database.close(),
    catch: storeError('close-database'),
  });

const copySqlite = Effect.fn('FileArtifact.copySqlite')(function* (filename: string) {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'manna-sqlite-check-' });
  const copy = `${directory}/artifact.db`;
  yield* fs.copyFile(filename, copy);
  if (yield* fs.exists(`${filename}-wal`)) yield* fs.copyFile(`${filename}-wal`, `${copy}-wal`);
  return copy;
});

const localFileBytes = (source: string, layout: FileArtifactLayout) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      let filename = source;
      if (layout === 'sqlite' && (yield* fs.exists(`${source}-wal`))) {
        filename = yield* copySqlite(source);
        yield* Effect.acquireUseRelease(
          openDatabase(filename, false),
          (db) =>
            Effect.try({
              try: () => db.exec('PRAGMA journal_mode=DELETE'),
              catch: storeError('checkpoint-source-copy'),
            }),
          closeDatabase,
        );
      }
      return fs.stream(filename);
    }).pipe(Effect.provide(BunServices.layer)),
  );

export const withDatabaseSnapshot = <A>(
  filename: string,
  use: (database: Database) => Effect.Effect<A, unknown>,
): Effect.Effect<A, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      const copy = yield* copySqlite(filename);
      return yield* Effect.acquireUseRelease(openDatabase(copy, false), use, closeDatabase);
    }),
  ).pipe(Effect.provide(BunServices.layer));

export const countRows = (database: Database, table: string, where = '') =>
  Effect.try({
    try: () => database.query(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(),
    catch: storeError('count-rows'),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Finite }))(raw).pipe(
        Effect.mapError(storeError('count-rows')),
      ),
    ),
    Effect.map((row) => row.count),
  );

export const integrityCheck = (database: Database) =>
  Effect.try({
    try: () => database.query('PRAGMA integrity_check').get(),
    catch: storeError('integrity-check'),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(Schema.Struct({ integrity_check: Schema.String }))(raw).pipe(
        Effect.mapError(storeError('integrity-check')),
      ),
    ),
    Effect.map((row) => row.integrity_check),
  );

const sealDatabase = (database: Database) =>
  Effect.try({
    try: () => database.query('PRAGMA journal_mode=DELETE').get(),
    catch: storeError('checkpoint-database'),
  }).pipe(
    Effect.flatMap((mode) =>
      Schema.decodeUnknownEffect(Schema.Struct({ journal_mode: Schema.Literal('delete') }))(
        mode,
      ).pipe(Effect.mapError(storeError('checkpoint-database'))),
    ),
    Effect.asVoid,
  );

const sqliteProvenanceStore: NativeFileArtifactProvenanceStore = {
  read: (filename) =>
    withDatabaseSnapshot(filename, (database) =>
      Effect.gen(function* () {
        const row = Schema.Struct({ value: Schema.String });
        const value = (key: string) =>
          Effect.try({
            try: () => database.query('SELECT value FROM meta WHERE key = ?').get(key),
            catch: storeError('read-provenance'),
          }).pipe(
            Effect.flatMap((raw) =>
              Schema.decodeUnknownEffect(row)(raw).pipe(
                Effect.mapError(storeError('read-provenance')),
              ),
            ),
            Effect.map((decoded) => decoded.value),
          );
        const optionalValue = (key: string) =>
          Effect.try({
            try: () => database.query('SELECT value FROM meta WHERE key = ?').get(key),
            catch: storeError('read-provenance'),
          }).pipe(
            Effect.map((raw) =>
              Option.fromNullishOr(raw).pipe(
                Option.flatMap((found) =>
                  Schema.decodeUnknownOption(row)(found).pipe(
                    Option.map((decoded) => decoded.value),
                  ),
                ),
              ),
            ),
          );
        const stored = yield* Schema.decodeEffect(StoredProvenance)({
          source: yield* value('corpus_source'),
          revision: yield* value('corpus_revision'),
          digest: yield* value('corpus_digest'),
          ...storedGeneration(yield* optionalValue('corpus_generation')),
        }).pipe(Effect.mapError(storeError('read-provenance')));
        return provenanceFrom(stored);
      }),
    ),
  write: (filename, provenance) =>
    Effect.acquireUseRelease(
      openDatabase(filename, false),
      (database) =>
        Effect.try({
          try: () => {
            database.exec(
              'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
            );
            const upsert = database.query(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            );
            database.transaction(() => {
              upsert.run('corpus_source', provenance.source);
              upsert.run('corpus_revision', provenance.revision);
              upsert.run('corpus_digest', Option.getOrThrow(provenance.digest));
              Option.match(provenance.generation, {
                onNone: () => {
                  database.query('DELETE FROM meta WHERE key = ?').run('corpus_generation');
                },
                onSome: (generation) => {
                  upsert.run('corpus_generation', String(generation));
                },
              });
            })();
          },
          catch: storeError('write-provenance'),
        }).pipe(Effect.andThen(sealDatabase(database))),
      closeDatabase,
    ),
};

const sidecarProvenanceStore: NativeFileArtifactProvenanceStore = {
  read: (filename) => Effect.map(readSidecar(filename), (pointer) => pointer.provenance),
  write: (filename, provenance) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const digest = yield* Effect.fromOption(
        provenance.digest,
        () => 'Artifact digest is required',
      );
      const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(StoredProvenance))({
        source: provenance.source,
        revision: provenance.revision,
        digest,
        ...Option.match(provenance.generation, {
          onNone: () => ({}),
          onSome: (generation) => ({ generation: Number(generation) }),
        }),
      });
      yield* fs.writeFileString(sidecarPath(filename), encoded);
    }).pipe(Effect.mapError(storeError('write-provenance')), Effect.provide(BunServices.layer)),
};

interface SidecarPointer {
  readonly provenance: CorpusProvenance;
  readonly artifact: Option.Option<string>;
}

const readSidecar = (filename: string): Effect.Effect<SidecarPointer, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(sidecarPath(filename));
    const stored = yield* Schema.decodeEffect(Schema.fromJsonString(StoredProvenance))(raw);
    return {
      provenance: provenanceFrom(stored),
      artifact: Option.fromUndefinedOr(stored.artifact),
    };
  }).pipe(Effect.mapError(storeError('read-provenance')), Effect.provide(BunServices.layer));

const writeSidecarPointer = (input: {
  readonly sidecarFor: string;
  readonly artifact: string;
  readonly provenance: CorpusProvenance;
}): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const digest = yield* Effect.fromOption(
      input.provenance.digest,
      () => 'Artifact digest is required',
    );
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(StoredProvenance))({
      source: input.provenance.source,
      revision: input.provenance.revision,
      digest,
      artifact: input.artifact,
      ...Option.match(input.provenance.generation, {
        onNone: () => ({}),
        onSome: (generation) => ({ generation: Number(generation) }),
      }),
    });
    yield* fs.writeFileString(sidecarPath(input.sidecarFor), encoded);
  }).pipe(Effect.mapError(storeError('write-provenance')), Effect.provide(BunServices.layer));

const fileDigest = (filename: string): Effect.Effect<string, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const hasher = sha256.create();
    yield* fs
      .stream(filename)
      .pipe(Stream.runForEach((chunk) => Effect.sync(() => hasher.update(chunk))));
    return `sha256:${bytesToHex(hasher.digest())}`;
  }).pipe(Effect.provide(BunServices.layer));

const retire = (
  fs: FileSystem.FileSystem,
  candidate: Option.Option<string>,
  keep: string,
): Effect.Effect<void> =>
  Option.match(
    Option.filter(candidate, (file) => file !== keep),
    {
      onNone: () => Effect.void,
      onSome: (file) => fs.remove(file, { force: true }).pipe(Effect.ignore),
    },
  );

const generationPath = (destination: string, digest: string): string =>
  `${destination}.g-${digest.slice('sha256:'.length, 'sha256:'.length + 12)}`;

const sidecarPath = (filename: string): string => `${filename}.provenance.json`;

interface ActiveGeneration {
  readonly file: string;
  readonly provenance: CorpusProvenance;
}

const readActive = (input: {
  readonly destination: string;
  readonly layout: FileArtifactLayout;
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore: NativeFileArtifactProvenanceStore;
}): Effect.Effect<Option.Option<ActiveGeneration>> =>
  Effect.gen(function* () {
    if (input.layout !== 'flat') {
      yield* input.verify(input.destination);
      return {
        file: input.destination,
        provenance: yield* input.provenanceStore.read(input.destination),
      };
    }
    const pointer = yield* readSidecar(input.destination);
    const file = Option.getOrElse(pointer.artifact, () => input.destination);
    const stated = yield* Effect.fromOption(
      pointer.provenance.digest,
      () => 'Artifact provenance states no digest',
    );
    if ((yield* fileDigest(file)) !== stated) {
      return yield* Effect.fail('Artifact does not match the generation its pointer names');
    }
    yield* input.verify(file);
    return { file, provenance: pointer.provenance };
  }).pipe(Effect.option);

export const layerNativeFileArtifacts = <Corpus extends string, RecipeId, InstallerId>(input: {
  readonly artifact: FileCorpusArtifact<Corpus, RecipeId, InstallerId>;
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
  readonly layout?: FileArtifactLayout;
}): Layer.Layer<InstallerId | RecipeId> => {
  const corpus = input.artifact.corpus;
  const reportedCorpus = Option.getOrUndefined(registeredCorpusName(corpus));
  const verify = input.verify;
  let fetchArtifact: (url: string) => Effect.Effect<FileArtifactResponse, unknown>;
  const injectedFetch = input.fetch;
  if (Predicate.isNotUndefined(injectedFetch)) {
    fetchArtifact = (url) =>
      injectedFetch(url).pipe(
        Effect.flatMap((response) => {
          const body = response.body;
          if (Predicate.isNull(body)) {
            return Effect.fail(sourceError(`fetch-${corpus}-release`, 'response has no body'));
          }
          return Effect.succeed({
            status: response.status,
            bytes: Stream.fromReadableStream({
              evaluate: () => body,
              onError: (cause) => cause,
            }),
          });
        }),
      );
  } else {
    fetchArtifact = (url) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.get(url);
        return { status: response.status, bytes: response.stream };
      }).pipe(Effect.provide(BunHttpClient.layer));
  }
  const layout = input.layout ?? 'sqlite';
  const defaultProvenanceStore = (): NativeFileArtifactProvenanceStore => {
    if (layout === 'flat') return sidecarProvenanceStore;
    return sqliteProvenanceStore;
  };
  const provenanceStore = input.provenanceStore ?? defaultProvenanceStore();
  const makeSource = (source: NativeFileArtifactSource) => {
    if (source.kind === 'release') return releaseSource(corpus, source, fetchArtifact);
    return localSource(corpus, source, layout);
  };
  const recipe = input.artifact.layerRecipe({
    sources: input.sources.map(makeSource),
    releaseSource: (release) =>
      releaseSource(
        corpus,
        {
          kind: 'release',
          url: release.url,
          revision: release.revision,
          digest: release.digest,
          size: release.size,
          generation: release.generation,
        },
        fetchArtifact,
      ),
  });
  const active = readActive({
    destination: input.destination,
    layout,
    verify,
    provenanceStore,
  });
  const activeFile = active.pipe(Effect.map(Option.map((generation) => generation.file)));
  const retirementTarget = (): Effect.Effect<Option.Option<string>> => {
    if (layout === 'flat') return activeFile;
    return Effect.succeedNone;
  };
  const activeFileForRetirement = retirementTarget();
  const installer = input.artifact.layerInstaller({
    current: active.pipe(Effect.map(Option.map((generation) => generation.provenance))),
    activeFile,
    install: (artifact) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(input.destination), { recursive: true });
        const building = `${input.destination}.building`;
        const clearSqliteSideFiles = Effect.gen(function* () {
          if (layout !== 'sqlite') return;
          yield* Effect.forEach(
            ['-journal', '-wal', '-shm'],
            (suffix) => fs.remove(`${building}${suffix}`, { force: true }),
            { discard: true },
          );
        });
        const hasher = sha256.create();
        let written = 0;
        let staged = Option.none<string>();
        const install = Effect.gen(function* () {
          yield* fs.remove(building, { force: true });
          yield* clearSqliteSideFiles;
          yield* artifact.bytes.pipe(
            Stream.tap((chunk) =>
              Effect.sync(() => {
                hasher.update(chunk);
                written += chunk.byteLength;
              }),
            ),
            Stream.run(fs.sink(building, { flag: 'wx' })),
          );
          if (Option.exists(artifact.expectedSize, (expected) => expected !== written)) {
            return yield* Effect.fail(
              `${input.artifact.label} Artifact size does not match its release manifest`,
            );
          }
          const digest = corpusDigest(`sha256:${bytesToHex(hasher.digest())}`);
          if (Option.exists(artifact.provenance.digest, (expected) => expected !== digest)) {
            return yield* Effect.fail(
              `${input.artifact.label} Artifact digest does not match its release manifest`,
            );
          }
          const provenance = CorpusProvenance.make({
            source: artifact.provenance.source,
            revision: artifact.provenance.revision,
            digest: Option.some(digest),
            generation: artifact.provenance.generation,
          });
          if (layout === 'flat') {
            const versioned = generationPath(input.destination, digest);
            staged = Option.some(versioned);
            const stagedPointer = `${input.destination}.building`;
            const installed = yield* verify(building);
            yield* fs.rename(building, versioned);
            yield* writeSidecarPointer({
              sidecarFor: stagedPointer,
              artifact: versioned,
              provenance,
            });
            yield* fs.rename(sidecarPath(stagedPointer), sidecarPath(input.destination));
            yield* retire(fs, previouslyActive, versioned);
            return { installed, provenance };
          }
          const installed = yield* verify(building);
          yield* provenanceStore.write(building, provenance);
          yield* clearSqliteSideFiles;
          yield* checkSqliteRefresh(input.destination);
          yield* fs.rename(building, input.destination);
          yield* fs.remove(sidecarPath(input.destination), { force: true });
          return { installed, provenance };
        });
        const previouslyActive = yield* activeFileForRetirement;
        return yield* install.pipe(
          Effect.onError(() =>
            Effect.all(
              [
                fs.remove(building, { force: true }),
                clearSqliteSideFiles,
                fs.remove(sidecarPath(building), { force: true }),
                retire(
                  fs,
                  staged,
                  Option.getOrElse(previouslyActive, () => building),
                ),
              ],
              { discard: true },
            ).pipe(Effect.ignore),
          ),
        );
      }).pipe(
        Effect.mapError((cause) => {
          if (Schema.is(SqliteRefreshRefused)(cause)) return cause;
          return CorpusInstallationError.make({ corpus: reportedCorpus, cause });
        }),
        Effect.provide(BunServices.layer),
      ),
  });
  return Layer.merge(recipe, installer);
};
