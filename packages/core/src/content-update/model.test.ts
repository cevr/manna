import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { corpusGeneration, corpusRevision } from '../corpus-supply/model.js';
import { TOPICS_SCHEMA_MAJOR } from '../corpus-supply/file-artifact.js';
import {
  ContentFloor,
  ContentManifest,
  ContentManifestEntry,
  decideUpdate,
  type ContentDecision,
  type ManifestFetchOutcome,
} from './model.js';

const entry = (input: {
  readonly revision: string;
  readonly generation: number;
  readonly schemaMajor?: number;
}): ContentManifestEntry =>
  ContentManifestEntry.make({
    revision: corpusRevision(input.revision),
    url: `https://github.com/cevr/manna/releases/download/${input.revision}/topics.db`,
    sha256: `sha256:${'a'.repeat(64)}`,
    size: 4_096,
    schema_major: input.schemaMajor ?? TOPICS_SCHEMA_MAJOR,
    generation: corpusGeneration(input.generation),
  });

const fetched = (entries: Record<string, ContentManifestEntry>): ManifestFetchOutcome => ({
  _tag: 'fetched',
  manifest: ContentManifest.make({
    revision: corpusRevision('manifest-1'),
    artifacts: entries,
  }),
});

const OFFLINE: ManifestFetchOutcome = { _tag: 'unavailable', detail: 'no network' };

const pinnedFloor = ContentFloor.make({
  pinned: Option.some(corpusRevision('content-v3')),
  pinnedGeneration: Option.some(corpusGeneration(3)),
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

const unpinnedFloor = ContentFloor.make({
  pinned: Option.none(),
  pinnedGeneration: Option.none(),
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

const decideTopics = (input: {
  readonly floor?: ContentFloor;
  readonly installed?: number;
  readonly manifest: ManifestFetchOutcome;
}): ContentDecision =>
  decideUpdate({
    corpus: 'topics',
    floor: input.floor ?? pinnedFloor,
    installed: Option.map(Option.fromUndefinedOr(input.installed), corpusGeneration),
    manifest: input.manifest,
  });

describe('§3.6 the update policy', () => {
  it.effect('offers a runtime generation above what is installed', () =>
    Effect.sync(() => {
      const decision = decideTopics({
        installed: 3,
        manifest: fetched({ topics: entry({ revision: 'content-v4', generation: 4 }) }),
      });
      expect(decision._tag).toBe('offer');
      if (decision._tag !== 'offer') return;
      expect(String(decision.entry.revision)).toBe('content-v4');
    }),
  );

  it.effect('reports up-to-date when the manifest names the installed generation', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 4,
          manifest: fetched({ topics: entry({ revision: 'content-v4', generation: 4 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  it.effect('never offers a generation below what is installed', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 5,
          manifest: fetched({ topics: entry({ revision: 'content-v4', generation: 4 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  it.effect('never offers a generation below what is installed, whatever the tag sorts as', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 5,
          manifest: fetched({ topics: entry({ revision: 'content-zz', generation: 2 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  it.effect('never offers the compiled pin itself, even with nothing installed', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({ topics: entry({ revision: 'content-v3', generation: 3 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  it.effect('never offers below the compiled pin', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({ topics: entry({ revision: 'content-v2', generation: 2 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  it.effect('offers above the pin when nothing is installed yet', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({ topics: entry({ revision: 'content-v5', generation: 5 }) }),
        })._tag,
      ).toBe('offer');
    }),
  );

  it.effect('a fresh machine with no network reports the pinned floor and no error', () =>
    Effect.sync(() => {
      const decision = decideTopics({ manifest: OFFLINE });
      expect(decision._tag).toBe('offline');
      expect(Option.getOrUndefined(Option.map(pinnedFloor.pinned, String))).toBe('content-v3');
      expect(Option.getOrUndefined(Option.map(pinnedFloor.pinnedGeneration, Number))).toBe(3);
    }),
  );

  it.effect('refuses an artifact whose schema major exceeds this build', () =>
    Effect.sync(() => {
      const decision = decideTopics({
        installed: 3,
        manifest: fetched({
          topics: entry({
            revision: 'content-v9',
            generation: 9,
            schemaMajor: TOPICS_SCHEMA_MAJOR + 1,
          }),
        }),
      });
      expect(decision._tag).toBe('refused');
      if (decision._tag !== 'refused') return;
      expect(decision.reason).toBe('schema-major');
      expect(String(decision.available.revision)).toBe('content-v9');
    }),
  );

  it.effect('refuses a too-new schema major even when it matches what is installed', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 9,
          manifest: fetched({
            topics: entry({
              revision: 'content-v9',
              generation: 9,
              schemaMajor: TOPICS_SCHEMA_MAJOR + 1,
            }),
          }),
        })._tag,
      ).toBe('refused');
    }),
  );

  it.effect('accepts an artifact whose schema major equals this build', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({
            topics: entry({
              revision: 'content-v4',
              generation: 4,
              schemaMajor: TOPICS_SCHEMA_MAJOR,
            }),
          }),
        })._tag,
      ).toBe('offer');
    }),
  );

  it.effect('accepts an artifact whose schema major is below this build', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({
            topics: entry({ revision: 'content-v4', generation: 4, schemaMajor: 0 }),
          }),
        })._tag,
      ).toBe('offer');
    }),
  );

  it.effect('yields the pinned floor with no error when the manifest did not arrive', () =>
    Effect.sync(() => {
      const decision = decideTopics({ installed: 3, manifest: OFFLINE });
      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toBe('no network');
    }),
  );

  it.effect('reports offline for a build with no pin at all, rather than failing', () =>
    Effect.sync(() => {
      expect(decideTopics({ floor: unpinnedFloor, manifest: OFFLINE })._tag).toBe('offline');
    }),
  );

  it.effect('reports up-to-date when the manifest carries no entry for the corpus', () =>
    Effect.sync(() => {
      expect(decideTopics({ installed: 3, manifest: fetched({}) })._tag).toBe('up-to-date');
    }),
  );
});

describe('§3.6 the manifest wire model', () => {
  const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(ContentManifest));

  const manifestBody = (entry: string): string =>
    `{"revision":"manifest-2026-08","artifacts":{"topics":{${entry}}}}`;

  const VALID_TOPICS_ENTRY = `"revision":"content-v4","url":"https://github.com/cevr/manna/releases/download/content-v4/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1,"generation":4`;

  it.effect('decodes the published shape', () =>
    Effect.gen(function* () {
      const manifest = yield* decode(manifestBody(VALID_TOPICS_ENTRY));
      expect(String(manifest.revision)).toBe('manifest-2026-08');
      const topics = Option.fromUndefinedOr(manifest.artifacts.topics);
      expect(Option.isSome(topics)).toBe(true);
      if (Option.isNone(topics)) return;
      expect(Number(topics.value.generation)).toBe(4);
    }),
  );

  it.effect('refuses an entry whose digest is not a sha256', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            '"revision":"content-v4","url":"https://example.invalid/topics.db","sha256":"md5:abc","size":8192,"schema_major":1,"generation":4',
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  it.effect('refuses an entry with no size', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"https://example.invalid/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":0,"schema_major":1,"generation":4`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  it.effect('refuses an entry whose url is not https', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"http://example.invalid/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1,"generation":4`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  it.effect('refuses an entry whose url is a file path', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"file:///etc/passwd","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1,"generation":4`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  it.effect('refuses an entry with no generation', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"https://example.test/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  it.effect('decodes a second corpus from the same manifest text, with no format change', () =>
    Effect.gen(function* () {
      const manifest = yield* decode(
        `{"revision":"manifest-2026-09","artifacts":{"topics":{${VALID_TOPICS_ENTRY}},"vectors":{"revision":"vectors-v2","url":"https://example.test/vectors.bvi","sha256":"sha256:${'c'.repeat(64)}","size":4096,"schema_major":1,"generation":2}}}`,
      );
      const vectors = Option.fromUndefinedOr(manifest.artifacts.vectors);
      expect(Option.isSome(vectors)).toBe(true);
      if (Option.isNone(vectors)) return;
      expect(String(vectors.value.revision)).toBe('vectors-v2');
      expect(Number(vectors.value.generation)).toBe(2);
      expect(Option.isSome(Option.fromUndefinedOr(manifest.artifacts.topics))).toBe(true);
    }),
  );
});
