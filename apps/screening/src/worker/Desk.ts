/**
 * The desk on Cloudflare: a second Worker, the publisher's way into the
 * bucket (`../desk.ts`), over a read-write binding of the bucket the site
 * reads (`./bucket.ts`). It answers only to the stack's secret (`DeskToken`,
 * bound as `DESK_TOKEN`), and lives on its `workers.dev` host alone on every
 * stage: no custom domain, so films.cvr.im only ever reads.
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Option, Schema } from 'effect';
import { HttpServerRequest } from 'effect/http';

import { respondDesk, type Store } from '../desk.ts';
import { DESK_NAME } from '../site.ts';
import { DeskToken, Shelf } from './bucket.ts';

/** The props, by stage: the secret is bound at deploy, where there is a stage; the running Worker needs only the base. */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, workersDev: true };
  if (Option.isNone(stage)) return base;
  const token = yield* DeskToken;
  const bound = { ...base, env: { DESK_TOKEN: token.text } };
  if (!Option.contains(stage, 'prod')) return bound;
  return { ...bound, name: DESK_NAME };
});

const readSecret = Schema.decodeUnknownOption(Schema.String);

export default class Desk extends Cloudflare.Worker<Desk>()(
  'Desk',
  props,
  Effect.gen(function* () {
    const env = yield* Cloudflare.WorkerEnvironment;
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(yield* Shelf);
    const run = <A>(effect: Effect.Effect<A, Cloudflare.R2.R2Error, RuntimeContext>) =>
      effect.pipe(Effect.provide(RuntimeContext.phantom), Effect.orDie);
    const metadata = (sha256: Option.Option<string>) =>
      Option.match(sha256, {
        onNone: () => ({}),
        onSome: (each) => ({ customMetadata: { sha256: each } }),
      });
    const store: Store = {
      list: (prefix, delimiter) =>
        Effect.gen(function* () {
          const keys: string[] = [];
          const folders: string[] = [];
          let cursor = Option.none<string>();
          while (true) {
            const page = yield* run(
              bucket.list({
                prefix,
                delimiter: Option.getOrUndefined(delimiter),
                cursor: Option.getOrUndefined(cursor),
              }),
            );
            keys.push(...page.objects.map((object) => object.key));
            folders.push(...page.delimitedPrefixes);
            if (!page.truncated) return { keys, folders };
            cursor = Option.some(page.cursor);
          }
        }),
      read: (key) =>
        run(bucket.get(key)).pipe(
          Effect.flatMap((object) =>
            Option.match(Option.fromNullishOr(object), {
              onNone: () => Effect.succeedNone,
              onSome: (found) =>
                Option.match(Option.fromNullishOr(found.readable), {
                  onSome: (readable) =>
                    Effect.succeedSome<ReadableStream<Uint8Array> | Uint8Array>(readable),
                  onNone: () => run(found.bytes()).pipe(Effect.asSome),
                }),
            }),
          ),
        ),
      hashOf: (key) =>
        run(bucket.head(key)).pipe(
          Effect.map((object) =>
            Option.map(Option.fromNullishOr(object), (found) =>
              Option.fromNullishOr(found.customMetadata?.['sha256']),
            ),
          ),
        ),
      write: (key, bytes, sha256) =>
        run(bucket.put(key, bytes, metadata(sha256))).pipe(Effect.asVoid),
      remove: (key) => run(bucket.delete(key)),
      begin: (key, sha256) =>
        run(bucket.createMultipartUpload(key, metadata(sha256))).pipe(
          Effect.map((upload) => upload.uploadId),
        ),
      part: (key, uploadId, partNumber, bytes) =>
        run(
          bucket
            .resumeMultipartUpload(key, uploadId)
            .pipe(Effect.flatMap((upload) => upload.uploadPart(partNumber, bytes))),
        ),
      finish: (key, uploadId, parts) =>
        run(
          bucket
            .resumeMultipartUpload(key, uploadId)
            .pipe(Effect.flatMap((upload) => upload.complete([...parts]))),
        ).pipe(Effect.asVoid),
      abort: (key, uploadId) =>
        run(
          bucket
            .resumeMultipartUpload(key, uploadId)
            .pipe(Effect.flatMap((upload) => upload.abort())),
        ),
    };
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        // The binding is read per request: the environment fills in when the Worker runs.
        const secret = Option.getOrElse(readSecret(env['DESK_TOKEN']), () => '');
        return yield* respondDesk(store, secret, request);
      }),
    };
  }).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketBinding)),
) {}
