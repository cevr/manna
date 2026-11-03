import { Context, Schema } from 'effect';
import type { Effect, Option } from 'effect';

export interface SourceHead {
  readonly size: number;
  readonly etag: string;
  readonly contentType: string;
}

export interface FillEntry {
  readonly hymn: number;
  readonly path: string;
  readonly size: number;
  readonly sha: string;
}

export interface TargetObject {
  readonly size: number;
  readonly etag: string;
}

export interface PutMetadata {
  readonly contentType: string;
  readonly cacheControl: string;
}

export class StoreFailed extends Schema.TaggedError<StoreFailed>()('StoreFailed', {
  store: Schema.Literals(['s3', 'github', 'r2']),
  reason: Schema.String,
}) {
  override get message() {
    return `${this.store}: ${this.reason}`;
  }
}

export class Source extends Context.Service<
  Source,
  {
    readonly head: (hymn: number) => Effect.Effect<Option.Option<SourceHead>, StoreFailed>;
    readonly get: (hymn: number) => Effect.Effect<Uint8Array, StoreFailed>;
  }
>()('@manna/hymnal-app/infra/audio/Source') {}

export class Fill extends Context.Service<
  Fill,
  {
    readonly tree: Effect.Effect<ReadonlyMap<number, FillEntry>, StoreFailed>;
    readonly get: (entry: FillEntry) => Effect.Effect<Uint8Array, StoreFailed>;
  }
>()('@manna/hymnal-app/infra/audio/Fill') {}

export class Target extends Context.Service<
  Target,
  {
    readonly list: (
      prefix: string,
    ) => Effect.Effect<ReadonlyMap<string, TargetObject>, StoreFailed>;
    readonly put: (
      key: string,
      bytes: Uint8Array,
      metadata: PutMetadata,
    ) => Effect.Effect<TargetObject, StoreFailed>;
  }
>()('@manna/hymnal-app/infra/audio/Target') {}

export class Hash extends Context.Service<
  Hash,
  {
    readonly md5: (bytes: Uint8Array) => string;
    readonly gitBlobSha1: (bytes: Uint8Array) => string;
  }
>()('@manna/hymnal-app/infra/audio/Hash') {}
