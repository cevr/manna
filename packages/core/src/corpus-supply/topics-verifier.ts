import { Effect, Option } from 'effect';

import { readTopicsSchemaMajor, TOPICS_SCHEMA_MAJOR } from './file-artifact.js';

export interface TopicsArtifactReader {
  readonly integrity: Effect.Effect<string, unknown>;
  readonly meta: (key: string) => Effect.Effect<Option.Option<string>, unknown>;
  readonly count: (table: string) => Effect.Effect<number, unknown>;
}

const TOPICS_VERIFY_MESSAGES = {
  integrity: 'SQLite integrity check failed',
  unreadableSchemaMajor: 'Topics Artifact has no readable schema_major',
  schemaTooNew: (major: number): string =>
    `Topics Artifact schema_major ${String(major)} exceeds ${String(TOPICS_SCHEMA_MAJOR)}`,
  noPages: 'Topics Artifact has no pages',
  noAliases: 'Topics Artifact has no phrase dictionary',
} satisfies Record<string, string | ((major: number) => string)>;

export const verifyTopicsArtifact = Effect.fn('TopicsVerifier.verify')(function* (
  reader: TopicsArtifactReader,
) {
  const integrity = yield* reader.integrity;
  if (integrity !== 'ok') {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.integrity);
  }
  const stored = yield* reader.meta('schema_major');
  const parsed = Option.flatMap(stored, readTopicsSchemaMajor);
  if (Option.isNone(parsed)) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.unreadableSchemaMajor);
  }
  const major = parsed.value;
  if (major > TOPICS_SCHEMA_MAJOR) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.schemaTooNew(major));
  }
  const topics = yield* reader.count('topics');
  const aliases = yield* reader.count('topic_aliases');
  yield* reader.count('topic_edges');
  yield* reader.count('topic_catalog_keys');
  if (topics === 0) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.noPages);
  }
  if (aliases === 0) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.noAliases);
  }
  return topics;
});
