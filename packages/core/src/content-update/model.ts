import { Option, Predicate, Schema } from 'effect';

import { CorpusFileName, CorpusGeneration, CorpusRevision } from '../corpus-supply/model.js';

export const UpdatableCorpus = Schema.Literals(['topics']);
export type UpdatableCorpus = typeof UpdatableCorpus.Type;

const ContentUrl = Schema.NonEmptyString.check(
  Schema.makeFilter<string>((url) => {
    const parsed = URL.parse(url);
    if (Predicate.isNull(parsed)) return 'Content URL must be a URL this build can parse';
    if (parsed.protocol !== 'https:') return 'Content URL must be https';
    return true;
  }),
);
type ContentUrl = typeof ContentUrl.Type;

export class ContentManifestEntry extends Schema.Class<ContentManifestEntry>(
  'ContentUpdate/ManifestEntry',
)({
  revision: CorpusRevision,
  url: ContentUrl,
  sha256: Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
  size: Schema.Int.check(Schema.isGreaterThan(0)),
  schema_major: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  generation: CorpusGeneration,
}) {}

export class ContentManifest extends Schema.Class<ContentManifest>('ContentUpdate/Manifest')({
  revision: CorpusRevision,
  artifacts: Schema.Record(CorpusFileName, Schema.optional(ContentManifestEntry)),
}) {}

export const ManifestFetchOutcome = Schema.Union([
  Schema.TaggedStruct('fetched', { manifest: ContentManifest }),
  Schema.TaggedStruct('unavailable', { detail: Schema.String }),
]);
export type ManifestFetchOutcome = typeof ManifestFetchOutcome.Type;

export const manifestFetched = (manifest: ContentManifest): ManifestFetchOutcome => ({
  _tag: 'fetched',
  manifest,
});

export const manifestUnavailable = (detail: string): ManifestFetchOutcome => ({
  _tag: 'unavailable',
  detail,
});

export class ContentFloor extends Schema.Class<ContentFloor>('ContentUpdate/Floor')({
  pinned: Schema.Option(CorpusRevision),
  pinnedGeneration: Schema.Option(CorpusGeneration),
  schemaMajor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

const ContentRefusalReason = Schema.Literals(['schema-major']);
type ContentRefusalReason = typeof ContentRefusalReason.Type;

export const ContentDecision = Schema.Union([
  Schema.TaggedStruct('offer', { entry: ContentManifestEntry }),
  Schema.TaggedStruct('up-to-date', {}),
  Schema.TaggedStruct('refused', {
    reason: ContentRefusalReason,
    available: ContentManifestEntry,
  }),
  Schema.TaggedStruct('offline', { detail: Schema.String }),
]);
export type ContentDecision = typeof ContentDecision.Type;

export class ContentStatus extends Schema.Class<ContentStatus>('ContentUpdate/Status')({
  corpus: UpdatableCorpus,
  installed: Schema.Option(CorpusRevision),
  installedGeneration: Schema.Option(CorpusGeneration),
  floor: ContentFloor,
  decision: ContentDecision,
}) {}

export class ContentUpdateOutcome extends Schema.Class<ContentUpdateOutcome>(
  'ContentUpdate/Outcome',
)({
  status: ContentStatus,
  activated: Schema.Option(CorpusRevision),
}) {}

export const ContentStatusJson = ContentStatus;
export type ContentStatusJson = typeof ContentStatusJson.Encoded;

export const ContentUpdateJson = ContentUpdateOutcome;
export type ContentUpdateJson = typeof ContentUpdateJson.Encoded;

export const CONTENT_MANIFEST_URL =
  'https://github.com/cevr/manna/releases/download/content-manifest/manifest.json';

export const CONTENT_MANIFEST_ORIGINS: readonly string[] = [new URL(CONTENT_MANIFEST_URL).origin];

export const isAllowedOrigin = (url: string, origins: readonly string[]): boolean =>
  Option.exists(parseOrigin(url), (origin) => origins.includes(origin));

export const isAllowedManifestOrigin = (url: string): boolean =>
  isAllowedOrigin(url, CONTENT_MANIFEST_ORIGINS);

const parseOrigin = (url: string): Option.Option<string> =>
  Option.map(Option.fromNullOr(URL.parse(url)), (parsed) => parsed.origin);

export const CONTENT_MANIFEST_MAX_BYTES = 262_144;

export const CONTENT_MANIFEST_TIMEOUT_MILLIS = 10_000;

export const CONTENT_MANIFEST_MAX_REDIRECTS = 3;

export const redirectTarget = (
  status: number,
  location: Option.Option<string>,
  from: string,
): Option.Option<string> => {
  if (status < 300 || status >= 400) return Option.none();
  return Option.flatMap(location, (target) =>
    Option.map(Option.fromNullOr(URL.parse(target, from)), (resolved) => resolved.href),
  );
};

export const decideUpdate = (input: {
  readonly floor: ContentFloor;
  readonly installed: Option.Option<CorpusGeneration>;
  readonly manifest: ManifestFetchOutcome;
  readonly corpus: UpdatableCorpus;
}): ContentDecision => {
  if (input.manifest._tag === 'unavailable') {
    return { _tag: 'offline', detail: input.manifest.detail };
  }
  const entry = Option.fromUndefinedOr(input.manifest.manifest.artifacts[input.corpus]);
  if (Option.isNone(entry)) return { _tag: 'up-to-date' };
  const available = entry.value;
  if (available.schema_major > input.floor.schemaMajor) {
    return { _tag: 'refused', reason: 'schema-major', available };
  }
  if (Option.exists(input.floor.pinnedGeneration, (pinned) => available.generation <= pinned)) {
    return { _tag: 'up-to-date' };
  }
  if (Option.exists(input.installed, (current) => available.generation <= current)) {
    return { _tag: 'up-to-date' };
  }
  return { _tag: 'offer', entry: available };
};
