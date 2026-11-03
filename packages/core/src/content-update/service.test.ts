import { BunFileSystem } from '@effect/platform-bun';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { corpusGeneration, corpusRevision } from '../corpus-supply/model.js';
import type { CorpusProvenance } from '../corpus-supply/model.js';
import {
  TopicsArtifact,
  TOPICS_SCHEMA_MAJOR,
  type FileArtifactRelease,
} from '../corpus-supply/file-artifact.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import {
  layerNativeFileArtifacts,
  type NativeFileArtifactProvenanceStore,
  type NativeFileArtifactSource,
} from '../platform-bun/file-artifact.js';
import {
  ContentManifest,
  ContentManifestEntry,
  decideUpdate,
  type ManifestFetchOutcome,
} from './model.js';
import {
  compiledFloor,
  ContentActivation,
  ContentManifestSource,
  ContentUpdate,
} from './service.js';

const RELEASE_BYTES = 'the newer topics artifact';
const RELEASE_DIGEST = `sha256:${bytesToHex(sha256(new TextEncoder().encode(RELEASE_BYTES)))}`;
const ACTIVE_BYTES = 'the installed topics artifact';

const manifestEntry = (input: {
  readonly digest: string;
  readonly size: number;
  readonly schemaMajor?: number;
  readonly generation?: number;
  readonly revision?: string;
}): ContentManifestEntry =>
  ContentManifestEntry.make({
    revision: corpusRevision(input.revision ?? 'content-v4'),
    url: 'https://example.test/topics.db',
    sha256: input.digest,
    size: input.size,
    schema_major: input.schemaMajor ?? TOPICS_SCHEMA_MAJOR,
    generation: corpusGeneration(input.generation ?? 4),
  });

const makeProvenanceStore = (
  seed: Option.Option<CorpusProvenance> = Option.none(),
): NativeFileArtifactProvenanceStore => {
  let current = seed;
  return {
    read: () => Effect.suspend(() => Effect.fromOption(current, () => 'provenance is unavailable')),
    write: (_filename, provenance) =>
      Effect.sync(() => {
        current = Option.some(provenance);
      }),
  };
};

const offering = (entry: ContentManifestEntry): ManifestFetchOutcome => ({
  _tag: 'fetched',
  manifest: ContentManifest.make({
    revision: corpusRevision('manifest-1'),
    artifacts: { topics: entry },
  }),
});

interface FetchLog {
  readonly urls: () => readonly string[];
}

const hostFor = (input: {
  readonly destination: string;
  readonly entry: ContentManifestEntry;
  readonly bytes: string;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
  readonly localSources?: readonly NativeFileArtifactSource[];
  readonly log?: FetchLog & { readonly record: (url: string) => void };
  readonly activation?: Layer.Layer<ContentActivation>;
}) => {
  const artifacts = layerNativeFileArtifacts({
    artifact: TopicsArtifact,
    destination: input.destination,
    provenanceStore: input.provenanceStore ?? makeProvenanceStore(),
    sources: input.localSources ?? [],
    fetch: (url) =>
      Effect.sync(() => {
        input.log?.record(url);
        return new Response(input.bytes);
      }),
    verify: () => Effect.succeed(3),
  });
  return ContentUpdate.Live.pipe(
    Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
    Layer.provide(ContentManifestSource.layerOf(offering(input.entry))),
    Layer.provide(input.activation ?? ContentActivation.Inert),
  );
};

const makeActivationLog = () => {
  const reopened: string[] = [];
  return {
    layer: ContentActivation.layerOf((corpus) => Effect.sync(() => reopened.push(corpus))),
    reopened: (): readonly string[] => reopened,
  };
};

const makeFetchLog = (): FetchLog & { readonly record: (url: string) => void } => {
  const urls: string[] = [];
  return { urls: () => urls, record: (url) => urls.push(url) };
};

const runUpdate = (host: Layer.Layer<ContentUpdate>) =>
  Effect.flatMap(ContentUpdate, (service) => service.update('topics')).pipe(Effect.provide(host));

const runStatus = (host: Layer.Layer<ContentUpdate>) =>
  Effect.flatMap(ContentUpdate, (service) => service.status('topics')).pipe(Effect.provide(host));

describe('§10 M9 update over the shipped File Corpus lifecycle', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('installs an offered revision and reports the new activation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(Option.getOrUndefined(Option.map(outcome.activated, String))).toBe('content-v4');
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
      expect(outcome.status.decision._tag).toBe('up-to-date');
      expect(Option.getOrUndefined(Option.map(outcome.status.installed, String))).toBe(
        'content-v4',
      );
    }));

  test('tells the host to reopen its readers after an activation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const activation = makeActivationLog();

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
          activation: activation.layer,
        }),
      );

      expect(Option.isSome(outcome.activated)).toBe(true);
      expect(activation.reopened()).toEqual(['topics']);
    }));

  test('does not reopen readers when nothing was activated', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);
      const activation = makeActivationLog();

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: `sha256:${'a'.repeat(64)}`,
            size: RELEASE_BYTES.length,
          }),
          bytes: RELEASE_BYTES,
          activation: activation.layer,
        }),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(activation.reopened()).toEqual([]);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));

  test('a digest mismatch aborts and leaves the installed generation active', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: `sha256:${'a'.repeat(64)}`,
            size: RELEASE_BYTES.length,
          }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('a size mismatch aborts and leaves the installed generation active', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length + 1,
          }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('a schema-major overrun is refused before any install is attempted', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length,
            schemaMajor: TOPICS_SCHEMA_MAJOR + 1,
          }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(outcome.status.decision._tag).toBe('refused');
      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));

  test('status never mutates: an offer left unacted-on installs nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;

      const status = yield* runStatus(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(status.decision._tag).toBe('offer');
      expect(yield* fs.exists(destination)).toBe(false);
    }));

  test('the offered manifest entry is what reaches the installer', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const log = makeFetchLog();

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
          log,
        }),
      );

      expect(log.urls()).toEqual(['https://example.test/topics.db']);
      expect(Option.getOrUndefined(Option.map(outcome.activated, String))).toBe('content-v4');
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  test('an accepted offer installs the offered bytes even when a local source exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const packaged = `${directory}/packaged-topics.db`;
      yield* fs.writeFileString(packaged, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
          localSources: [{ kind: 'packaged', path: packaged, label: 'packaged' }],
        }),
      );

      expect(Option.getOrUndefined(Option.map(outcome.activated, String))).toBe('content-v4');
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  test('a runtime generation above the pin survives a restart and is not re-offered', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const store = makeProvenanceStore();
      const entry = manifestEntry({
        digest: RELEASE_DIGEST,
        size: RELEASE_BYTES.length,
        generation: 4,
      });

      const first = yield* runUpdate(
        hostFor({ destination, entry, bytes: RELEASE_BYTES, provenanceStore: store }),
      );
      expect(Option.getOrUndefined(Option.map(first.activated, String))).toBe('content-v4');

      const second = yield* runStatus(
        hostFor({ destination, entry, bytes: RELEASE_BYTES, provenanceStore: store }),
      );

      expect(Option.getOrUndefined(Option.map(second.installedGeneration, Number))).toBe(4);
      expect(second.decision._tag).toBe('up-to-date');
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  test('a manifest naming an older generation than the installed one installs nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const store = makeProvenanceStore();

      yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length,
            generation: 4,
          }),
          bytes: RELEASE_BYTES,
          provenanceStore: store,
        }),
      );

      const log = makeFetchLog();
      const rolledBack = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length,
            generation: 3,
            revision: 'content-v3',
          }),
          bytes: 'the older topics artifact',
          provenanceStore: store,
          log,
        }),
      );

      expect(rolledBack.status.decision._tag).toBe('up-to-date');
      expect(Option.isNone(rolledBack.activated)).toBe(true);
      expect(log.urls()).toEqual([]);
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  test('a fresh machine with no manifest reports the pinned floor and installs nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;

      const artifacts = layerNativeFileArtifacts({
        artifact: TopicsArtifact,
        destination,
        provenanceStore: makeProvenanceStore(),
        sources: [],
        verify: () => Effect.succeed(3),
      });
      const status = yield* runStatus(
        ContentUpdate.Live.pipe(
          Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
          Layer.provide(ContentManifestSource.Unreachable),
          Layer.provide(ContentActivation.Inert),
        ),
      );

      expect(status.decision._tag).toBe('offline');
      expect(Option.isNone(status.installed)).toBe(true);
      expect(Option.isNone(status.installedGeneration)).toBe(true);
      expect(status.floor.schemaMajor).toBe(TOPICS_SCHEMA_MAJOR);
      expect(Option.isNone(status.floor.pinned)).toBe(true);
      expect(yield* fs.exists(destination)).toBe(false);
    }));

  test('a fresh machine with a published pin reports that pin as its floor', () =>
    Effect.sync(() => {
      const pinned: FileArtifactRelease = {
        url: 'https://example.test/topics-v3.db',
        revision: 'content-v3',
        digest: RELEASE_DIGEST,
        size: RELEASE_BYTES.length,
      };
      const floor = compiledFloor({
        release: Option.some(pinned),
        generation: Option.some(corpusGeneration(3)),
        schemaMajor: TOPICS_SCHEMA_MAJOR,
      });

      expect(Option.getOrUndefined(Option.map(floor.pinned, String))).toBe('content-v3');
      expect(Option.getOrUndefined(Option.map(floor.pinnedGeneration, Number))).toBe(3);
      expect(floor.schemaMajor).toBe(TOPICS_SCHEMA_MAJOR);

      expect(
        decideUpdate({
          corpus: 'topics',
          floor,
          installed: Option.none(),
          manifest: { _tag: 'unavailable', detail: 'no network' },
        })._tag,
      ).toBe('offline');
      expect(
        decideUpdate({
          corpus: 'topics',
          floor,
          installed: Option.none(),
          manifest: {
            _tag: 'fetched',
            manifest: ContentManifest.make({
              revision: corpusRevision('manifest-1'),
              artifacts: {
                topics: manifestEntry({
                  digest: RELEASE_DIGEST,
                  size: RELEASE_BYTES.length,
                  generation: 3,
                  revision: 'content-v3',
                }),
              },
            }),
          },
        })._tag,
      ).toBe('up-to-date');
    }));

  test('a host with no runtime install path activates nothing and does not fail', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const noRuntimePath = Layer.merge(
        TopicsArtifact.layerRecipe({ sources: [] }),
        TopicsArtifact.layerInstaller({
          current: Effect.succeedNone,
          activeFile: Effect.succeedNone,
          install: () => Effect.die('the installer must never be reached'),
        }),
      );
      const outcome = yield* runUpdate(
        ContentUpdate.Live.pipe(
          Layer.provide(CorpusSupply.layer.pipe(Layer.provide(noRuntimePath))),
          Layer.provide(ContentActivation.Inert),
          Layer.provide(
            ContentManifestSource.layerOf(
              offering(manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length })),
            ),
          ),
        ),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));

  test('an unreachable manifest reports offline rather than failing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const artifacts = layerNativeFileArtifacts({
        artifact: TopicsArtifact,
        destination,
        provenanceStore: makeProvenanceStore(),
        sources: [],
        verify: () => Effect.succeed(3),
      });
      const status = yield* runStatus(
        ContentUpdate.Live.pipe(
          Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
          Layer.provide(ContentManifestSource.Unreachable),
          Layer.provide(ContentActivation.Inert),
        ),
      );

      expect(status.decision._tag).toBe('offline');
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));
});
