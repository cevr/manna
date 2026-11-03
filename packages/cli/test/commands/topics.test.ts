import {
  ContentActivation,
  ContentManifest,
  ContentManifestEntry,
  ContentManifestSource,
  ContentStatusJson,
  ContentUpdate,
  ContentUpdateJson,
} from '@manna/core/content-update';
import {
  ADAPTER_EXPECTATIONS,
  OVERRUN_REVISION,
  refusingContentUpdate,
} from '@manna/core/content-update/testing';
import {
  corpusGeneration,
  corpusRevision,
  CorpusSupply,
  type CorpusProvenance,
  TOPICS_SCHEMA_MAJOR,
} from '@manna/core/corpus-supply';
import { layerNativeTopicsArtifacts } from '@manna/core/corpus-supply/bun';
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Schema } from 'effect';

import { topicsStatus, topicsUpdate } from '../../src/commands/topics.js';
import { ContentLayer } from '../../src/commands/topics-layer.js';
import { runCli } from '../lib/run-cli.js';

const fixtureContent: Layer.Layer<ContentUpdate> = refusingContentUpdate;

const encodeStatus = Schema.encodeEffect(Schema.fromJsonString(ContentStatusJson, { space: 2 }));
const encodeUpdate = Schema.encodeEffect(Schema.fromJsonString(ContentUpdateJson, { space: 2 }));

const serviceStatusJson = Effect.flatMap(ContentUpdate, (content) => content.status('topics')).pipe(
  Effect.flatMap(encodeStatus),
  Effect.provide(fixtureContent),
);

const serviceUpdateJson = Effect.flatMap(ContentUpdate, (content) => content.update('topics')).pipe(
  Effect.flatMap(encodeUpdate),
  Effect.provide(fixtureContent),
);

const RELEASE_BYTES = 'the offered topics artifact';
const RELEASE_URL = 'https://example.test/topics-v4.db';
const OFFERED_REVISION = corpusRevision('content-v4');

const makeOfferingHost = (destination: string) => {
  const fetches: string[] = [];
  let provenance = Option.none<CorpusProvenance>();
  const artifacts = layerNativeTopicsArtifacts({
    destination,
    provenanceStore: {
      read: () => Effect.fromOption(provenance, () => 'no provenance is recorded'),
      write: (_file, written) =>
        Effect.sync(() => {
          provenance = Option.some(written);
        }),
    },
    sources: [],
    fetch: (url) =>
      Effect.sync(() => {
        fetches.push(url);
        return new Response(RELEASE_BYTES);
      }),
    verify: () => Effect.succeed(3),
  });
  const entry = ContentManifestEntry.make({
    revision: OFFERED_REVISION,
    url: RELEASE_URL,
    sha256: `sha256:${new Bun.CryptoHasher('sha256').update(RELEASE_BYTES).digest('hex')}`,
    size: RELEASE_BYTES.length,
    schema_major: TOPICS_SCHEMA_MAJOR,
    generation: corpusGeneration(4),
  });
  return {
    fetches: (): readonly string[] => fetches,
    layer: ContentUpdate.Live.pipe(
      Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
      Layer.provide(
        ContentManifestSource.layerOf({
          _tag: 'fetched',
          manifest: ContentManifest.make({
            revision: corpusRevision('manifest-1'),
            artifacts: { topics: entry },
          }),
        }),
      ),
      Layer.provide(ContentActivation.Inert),
    ),
  };
};

describe('manna topics', () => {
  const hosted = it.scopedLive.layer(BunFileSystem.layer);

  it.scopedLive('status --json is byte-identical to the service status', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsStatus, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toBe(yield* serviceStatusJson);
      expect(cli.stdout).toContain(ADAPTER_EXPECTATIONS.overrun);
      expect(cli.stdout).toContain(String(OVERRUN_REVISION));
    }),
  );

  it.scopedLive('update --json is byte-identical to the service update', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsUpdate, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toBe(yield* serviceUpdateJson);
    }),
  );

  hosted('status does not install, even when an update is on offer', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'cli-topics-status-' });
      const destination = `${directory}/topics.db`;
      const offer = makeOfferingHost(destination);

      const cli = yield* runCli(topicsStatus, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, offer.layer),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toContain('offer');

      expect(offer.fetches()).toEqual([]);
      expect(yield* fs.exists(destination)).toBe(false);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }),
  );

  hosted('update over that same host does install, so the check above is not vacuous', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'cli-topics-update-' });
      const destination = `${directory}/topics.db`;
      const offer = makeOfferingHost(destination);

      const cli = yield* runCli(topicsUpdate, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, offer.layer),
      );
      expect(cli.success).toBe(true);

      expect(offer.fetches()).toEqual([RELEASE_URL]);
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
      expect(cli.stdout).toContain(String(OFFERED_REVISION));
    }),
  );

  it.scopedLive('the human output names the refused revision and what to do', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsStatus, [], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toContain(String(OVERRUN_REVISION));
      expect(cli.stdout).toContain('newer app');
      expect(cli.stdout).toContain('installed  (none)');
    }),
  );

  it.scopedLive('a refused update on a host with nothing installed says nothing is active', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsUpdate, [], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toContain('activated  (nothing');
      expect(cli.stdout).toContain('no content is installed');
      expect(cli.stdout).not.toContain('the installed generation is still active');
    }),
  );

  hosted('an update that activates nothing on an installed host says it still serves', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-topics-update-' });
      const host = makeOfferingHost(`${directory}/topics.db`);

      const first = yield* runCli(topicsUpdate, [], {}).pipe(
        Effect.provideService(ContentLayer, host.layer),
      );
      expect(first.stdout).toContain(`activated  ${String(OFFERED_REVISION)}`);

      const second = yield* runCli(topicsUpdate, [], {}).pipe(
        Effect.provideService(ContentLayer, host.layer),
      );
      expect(second.success).toBe(true);
      expect(second.stdout).toContain('the installed generation is still active');
      expect(second.stdout).not.toContain('no content is installed');
    }),
  );
});
