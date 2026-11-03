import { Effect, Exit, Option, Schema } from 'effect';
import { Digest } from 'effect/crypto';

import type { PublicationStream } from '../writings/archive.js';
import { PublicationId } from '../writings/model.js';
import type { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';

export const CorpusFileName = Schema.Literals(['bible', 'topics', 'vectors', 'webster']);
export type CorpusFileName = typeof CorpusFileName.Type;

const CorpusStreamName = Schema.Literals(['writings']);
type CorpusStreamName = typeof CorpusStreamName.Type;

export const CorpusName = Schema.Union([CorpusFileName, CorpusStreamName]);
export type CorpusName = typeof CorpusName.Type;

const CorpusIdentity = Schema.Union([Schema.Literal('canonical'), PublicationId]);
type CorpusIdentity = typeof CorpusIdentity.Type;

const AssetSourceId = Schema.NonEmptyString.pipe(Schema.brand('CorpusSupply/AssetSourceId'));
type AssetSourceId = typeof AssetSourceId.Type;

export const CorpusRevision = Schema.NonEmptyString.pipe(Schema.brand('CorpusSupply/Revision'));
export type CorpusRevision = typeof CorpusRevision.Type;

const CorpusDigest = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
  Schema.brand('CorpusSupply/Digest'),
);
type CorpusDigest = typeof CorpusDigest.Type;

export const CorpusGeneration = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('CorpusSupply/Generation'),
);
export type CorpusGeneration = typeof CorpusGeneration.Type;

export const corpusGeneration = Schema.decodeSync(CorpusGeneration);

export class CorpusProvenance extends Schema.Class<CorpusProvenance>('CorpusSupply/Provenance')({
  source: AssetSourceId,
  revision: CorpusRevision,
  digest: Schema.Option(CorpusDigest),
  generation: Schema.Option(CorpusGeneration).pipe(
    Schema.withConstructorDefault(Effect.succeed(Option.none<CorpusGeneration>())),
  ),
}) {}

export interface WritingsContribution {
  readonly provenance: CorpusProvenance;
  readonly publication: PublicationStream<
    CorpusContributionRejectedError | CorpusSourceUnavailableError
  >;
}

export class BootstrapTarget extends Schema.TaggedClass<BootstrapTarget>(
  'CorpusSupply/BootstrapTarget',
)('bootstrap', {}) {}

class FileCorpusTarget extends Schema.TaggedClass<FileCorpusTarget>(
  'CorpusSupply/FileCorpusTarget',
)('file', {
  corpus: CorpusFileName,
}) {}

export class WritingsTarget extends Schema.TaggedClass<WritingsTarget>(
  'CorpusSupply/WritingsTarget',
)('writings', {
  publications: Schema.optional(Schema.Array(PublicationId)),
}) {}

const CorpusTarget = Schema.Union([BootstrapTarget, FileCorpusTarget, WritingsTarget]);
type CorpusTarget = typeof CorpusTarget.Type;

export class CorpusSupplyInput extends Schema.Class<CorpusSupplyInput>('CorpusSupply/Input')({
  target: Schema.optional(CorpusTarget),
  refresh: Schema.optional(Schema.Boolean),
}) {}

export class CorpusActivation extends Schema.Class<CorpusActivation>('CorpusSupply/Activation')({
  corpus: CorpusName,
  identity: CorpusIdentity,
  source: AssetSourceId,
  revision: CorpusRevision,
  installed: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

export class CorpusSupplyReceipt extends Schema.Class<CorpusSupplyReceipt>('CorpusSupply/Receipt')({
  activated: Schema.Array(CorpusActivation),
  skipped: Schema.Array(CorpusIdentity),
}) {}

const decodeCorpusName = Schema.decodeUnknownExit(CorpusName);

export const registeredCorpusName = (corpus: string): Option.Option<CorpusName> =>
  Exit.match(decodeCorpusName(corpus), {
    onFailure: () => Option.none(),
    onSuccess: Option.some,
  });

export const assetSourceId = Schema.decodeSync(AssetSourceId);
export const corpusRevision = Schema.decodeSync(CorpusRevision);
export const corpusDigest = Schema.decodeSync(CorpusDigest);

export const unknownProvenance = (source: string, revision: string): CorpusProvenance =>
  CorpusProvenance.make({
    source: assetSourceId(source),
    revision: corpusRevision(revision),
    digest: Option.none(),
  });

export const provenanceForBytes = Effect.fn('CorpusSupply.provenanceForBytes')(function* (
  crypto: Digest.Digest['Service'],
  source: string,
  revision: string,
  bytes: Uint8Array,
) {
  const digest = yield* crypto.digest(Digest.sha256, bytes);
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return CorpusProvenance.make({
    source: assetSourceId(source),
    revision: corpusRevision(revision),
    digest: Option.some(corpusDigest(`sha256:${hex}`)),
  });
}, Effect.orDie);

export const Target = {
  bootstrap: (): BootstrapTarget => BootstrapTarget.make({}),
  file: (corpus: CorpusFileName): FileCorpusTarget => FileCorpusTarget.make({ corpus }),
  bible: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'bible' }),
  topics: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'topics' }),
  vectors: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'vectors' }),
  webster: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'webster' }),
  writings: (publications?: readonly PublicationId[]): WritingsTarget =>
    WritingsTarget.make({ publications }),
};
