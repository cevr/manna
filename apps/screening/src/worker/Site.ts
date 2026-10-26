/**
 * The site on Cloudflare: one Worker answering every request with the
 * policy in `../respond.ts`, over the bucket (`./bucket.ts`) read through
 * its native binding, one object at a time and never listed. A file's bytes
 * go from R2 to the response as R2's own stream; a `Range` is read from R2
 * as that stretch alone.
 *
 * Where it is served from follows the stage and `SERVED_FROM`
 * (`../site.ts`): `prod` takes the Worker name `screening` and, with
 * `'custom-domain'`, `films.cvr.im`, its `workers.dev` host off. Any other
 * stage is a throwaway copy on a generated `workers.dev` name over a bucket
 * of its own.
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Option } from 'effect';
import { HttpServerRequest } from 'effect/http';

import { type Body, type Head, respond, type Shelf as ShelfReader } from '../respond.ts';
import { DOMAIN, SERVED_FROM, type ServedFrom, WORKER_NAME } from '../site.ts';
import { Shelf } from './bucket.ts';

/** What `prod` claims, by where the site is served from. */
const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': { name: WORKER_NAME, workersDev: false, domain: { name: DOMAIN } },
};

/** The props, by stage. The running Worker reads them without one. */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

/** An R2 object's size and tag, as the policy reads them. */
const headOf = (object: Cloudflare.R2.R2Object): Head => ({
  size: object.size,
  etag: object.httpEtag,
});

/** An R2 object's bytes: its own stream when the platform offers one, else read whole. */
const bodyOf = (object: Cloudflare.R2.ObjectBody): Effect.Effect<Body> =>
  Option.match(Option.fromNullishOr(object.readable), {
    onSome: (readable) => Effect.succeed<Body>(readable),
    onNone: () => object.bytes().pipe(Effect.orDie),
  });

export default class Site extends Cloudflare.Worker<Site>()(
  'Site',
  props,
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadBucket(yield* Shelf);
    // A bucket that cannot be read is a failure of the request: it answers an error.
    const shelf: ShelfReader = {
      head: (key) =>
        bucket.head(key).pipe(
          Effect.map((object) => Option.map(Option.fromNullishOr(object), headOf)),
          Effect.provide(RuntimeContext.phantom),
          Effect.orDie,
        ),
      get: (key, span) =>
        bucket
          .get(key, {
            range: Option.getOrUndefined(
              Option.map(span, ({ offset, length }) => ({ offset, length })),
            ),
          })
          .pipe(
            Effect.flatMap((object) =>
              Option.match(Option.fromNullishOr(object), {
                onNone: () => Effect.succeedNone,
                onSome: (found) =>
                  Effect.map(bodyOf(found), (body) => Option.some({ head: headOf(found), body })),
              }),
            ),
            Effect.provide(RuntimeContext.phantom),
            Effect.orDie,
          ),
    };
    return {
      fetch: Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
        respond(shelf, request),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.R2.ReadBucketBinding)),
) {}
