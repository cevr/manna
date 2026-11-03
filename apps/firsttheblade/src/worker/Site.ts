import { Stage } from 'alchemy/Stage';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';
import { HttpServerRequest } from 'effect/http';

import { deliver } from '../mail/deliver.ts';
import { warnMail } from '../mail/log.ts';
import type { Mailer } from '../mail/mailer.ts';
import { Delivery } from '../mail/queue.ts';
import type { MailServices } from '../mail/routes.ts';

import { DOMAIN, REDIRECTED_DOMAINS, SERVED_FROM, type ServedFrom, WORKER_NAME } from '../site.ts';
import { Assets } from './assets.ts';
import { DELIVERY, layerCloudflare, MailBindings, MailQueue } from './mail.ts';
import { respond } from './respond.ts';

const readDelivery = Schema.decodeUnknownOption(Delivery);

const withServices =
  <S, Event = never>(services: Context.Context<S>) =>
  <A, E>(effect: Effect.Effect<A, E, S | Event>) =>
    Effect.updateContext(effect, (event: Context.Context<Event>) => Context.merge(services, event));

const serve = (services: Context.Context<MailServices>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    return yield* respond(request);
  }).pipe(withServices<MailServices, HttpServerRequest.HttpServerRequest>(services));

const ASSETS = {
  directory: 'dist',
  runWorkerFirst: true,
  htmlHandling: 'auto-trailing-slash',
  notFoundHandling: 'none',
} as const;

const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': {
    name: WORKER_NAME,
    workersDev: false,
    domain: {
      name: DOMAIN,
      redirects: [`www.${DOMAIN}`, ...REDIRECTED_DOMAINS.flatMap((name) => [name, `www.${name}`])],
    },
  },
};

const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, assets: ASSETS };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

export default class Site extends Cloudflare.Worker<Site>()(
  'Site',
  props,
  Effect.gen(function* () {
    const env = yield* Cloudflare.WorkerEnvironment;
    const assets = Assets.of({
      serve: (request) =>
        Cloudflare.fromCloudflareFetcher(env['ASSETS']).fetch(request).pipe(Effect.orDie),
    });
    const queue = yield* MailQueue;
    const mail = yield* Effect.context<Exclude<MailServices, Assets> | Mailer>();

    yield* Cloudflare.Queues.consumeQueueMessages(queue, DELIVERY, (messages) =>
      Effect.gen(function* () {
        const deliveries = [];
        for (const message of yield* Stream.runCollect(messages)) {
          const delivery = readDelivery(message.body);
          if (Option.isSome(delivery)) deliveries.push(delivery.value);
          else yield* warnMail('film.unreadable', { message: message.id });
        }
        yield* deliver(deliveries);
      }).pipe(withServices(mail)),
    );

    return { fetch: serve(Context.add(mail, Assets, assets)) };
  }).pipe(Effect.provide(layerCloudflare.pipe(Layer.provideMerge(MailBindings)))),
) {}
