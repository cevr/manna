import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Option } from 'effect';
import { HttpServerRequest } from 'effect/http';

import { type Body, type Head, respond, type Shelf as ShelfReader } from '../respond.ts';
import { DOMAIN, SERVED_FROM, type ServedFrom, WORKER_NAME } from '../site.ts';
import { Shelf } from './bucket.ts';

const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': { name: WORKER_NAME, workersDev: false, domain: { name: DOMAIN } },
};

const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

const headOf = (object: Cloudflare.R2.R2Object): Head => ({
  size: object.size,
  etag: object.httpEtag,
});

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
