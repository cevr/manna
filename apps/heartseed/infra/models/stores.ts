/**
 * The copy's one store, the R2 bucket, as a service, so the job (`./job.ts`)
 * runs the same against the real adapter (`./r2.ts`) and the tests' fakes.
 *
 * The store answers what it holds and checks nothing: the job decides
 * whether R2's object is the file (`holds` in `./plan.ts`).
 */
import { Context, Schema } from 'effect';
import type { Effect } from 'effect';

import type { MirrorObject } from './plan.ts';

/** The HTTP metadata an upload stores with its object. */
export interface PutMetadata {
  readonly contentType: string;
  readonly cacheControl: string;
}

/** R2 could not answer: a transport error, a refusal, a bad reply, a timeout. */
export class StoreFailed extends Schema.TaggedError<StoreFailed>()('StoreFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `r2: ${this.reason}`;
  }
}

export class Target extends Context.Service<
  Target,
  {
    /** Every object under `prefix`, by key. */
    readonly list: (
      prefix: string,
    ) => Effect.Effect<ReadonlyMap<string, MirrorObject>, StoreFailed>;
    /** The object as R2 stored it. */
    readonly put: (
      key: string,
      bytes: Uint8Array,
      metadata: PutMetadata,
    ) => Effect.Effect<MirrorObject, StoreFailed>;
  }
>()('@manna/heartseed/infra/models/Target') {}
