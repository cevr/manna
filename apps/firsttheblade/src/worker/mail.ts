/**
 * The email list on Cloudflare: its resources, and its services over the
 * Worker's bindings (`./Site.ts`), with the list's model hosted on Durable
 * Objects (`../mail/model.ts`): one object a subscriber, and one for each of
 * the model's policies and projections.
 *
 * - `MailDatabase`: D1, the address book and the roster. Alchemy applies
 *   `migrations/` on deploy.
 * - `MailSender`: the Email Sending binding, allowed to send only as `FROM`
 *   (`../mail/mailer.ts`).
 * - `MailQueue`: the queue a film's send is put on, delivered one batch at a
 *   time (`DELIVERY`).
 * - `SignupLimit`: the sign-up limit (`SIGNUPS`), a Rate Limiting binding.
 *
 * The bindings' clients answer only in a running Worker or Durable Object
 * (`RuntimeContext`), as does the request's `waitUntil`, which keeps a
 * sign-up's work running while its answer goes without waiting for it
 * (`../mail/background.ts`). `layerCloudflare` is built once, as the Worker
 * starts, and each call of its services finds the runtime it runs in
 * (`inRuntime`): a request's, a queue batch's, or a Durable Object's, where
 * the model's policies and projections run.
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as DomainCloudflare from '@alchemy.run/cloudflare/Domain';
import { Config, Effect, Layer, Option, Schema } from 'effect';

import { Background } from '../mail/background.ts';
import { layerSite } from '../mail/films.ts';
import { logMail } from '../mail/log.ts';
import { failureOf, FROM, Mailer } from '../mail/mailer.ts';
import { layerModel, layerTables } from '../mail/model.ts';
import { FilmQueue, QueueError } from '../mail/queue.ts';
import { AdminToken } from '../mail/routes.ts';
import { layerD1 } from '../mail/sql-d1.ts';
import { layerWebCrypto } from './crypto.ts';
import { SIGNUPS, Throttle } from '../mail/throttle.ts';
import { layer as tokensLayer } from '../mail/tokens.ts';

export const MailDatabase = Cloudflare.D1.Database('Mail', { migrations: './migrations' });

export const MailSender = Cloudflare.Email.SendEmail('MAIL', {
  allowedSenderAddresses: [FROM.email],
});

export const MailQueue = Cloudflare.Queues.Queue('FilmQueue');

export const SignupLimit = Cloudflare.RateLimit('SIGNUP_LIMIT', {
  namespaceId: 1001,
  simple: SIGNUPS,
});

/**
 * How the queue hands a film's send to the Worker: ten deliveries a batch,
 * one batch at a time, so no two deliveries run at once and the sends stay
 * under Email Sending's rate. A failed batch is tried again a minute later,
 * five times; after that, `bun run mail:send` again resumes the send.
 */
export const DELIVERY = {
  batchSize: 10,
  maxConcurrency: 1,
  maxRetries: 5,
  retryDelay: '1 minute',
  maxWaitTime: '5 seconds',
} as const;

const Coded = Schema.Struct({ code: Schema.String });

/** The code an Email Sending error carries (`E_…`), or `E_UNKNOWN`. */
const codeOf = (cause: unknown) =>
  Option.match(Schema.decodeUnknownOption(Coded)(cause), {
    onNone: () => 'E_UNKNOWN',
    onSome: ({ code }) => code,
  });

/**
 * `effect` in the runtime its caller runs in. A binding called anywhere
 * else (outside a request, a batch or a Durable Object) is a defect.
 */
const inRuntime = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideServiceEffect(
    effect,
    RuntimeContext,
    Effect.flatMap(
      Effect.serviceOption(RuntimeContext),
      Option.match({
        onNone: () => Effect.die(new Error('a mail binding was called outside a running Worker')),
        onSome: Effect.succeed,
      }),
    ),
  );

/**
 * The list's services and its model over the Worker's bindings, built as the
 * Worker starts: the model declares the Durable Objects it is hosted on.
 */
export const layerCloudflare = Layer.unwrap(
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.QueryDatabase(MailDatabase);
    const email = yield* Cloudflare.Email.Send(MailSender);
    const writeQueue = yield* Cloudflare.Queues.WriteQueue(MailQueue);
    const limit = yield* SignupLimit;
    const exec = yield* Cloudflare.WorkerExecutionContext;
    const tokenKey = yield* Config.Redacted('MAIL_TOKEN_KEY');
    const adminToken = yield* Config.Redacted('MAIL_ADMIN_TOKEN');

    const mailer = Mailer.of({
      send: (letter) =>
        inRuntime(
          email.send({
            from: FROM,
            to: letter.to,
            subject: letter.subject,
            text: letter.text,
            html: letter.html,
            headers: { ...letter.headers },
          }),
        ).pipe(
          Effect.mapError((error) => failureOf(codeOf(error.cause))),
          Effect.asVoid,
        ),
    });

    const films = FilmQueue.of({
      put: (deliveries) =>
        inRuntime(writeQueue.sendBatch(deliveries.map((body) => ({ body })))).pipe(
          Effect.mapError(() => QueueError.make({ reason: 'sendBatch' })),
        ),
    });

    // A limit that cannot be read lets the sign-up through: the honeypot
    // and the hour between confirm letters still hold.
    const throttle = Throttle.of({
      allow: (key) =>
        inRuntime(limit.limit({ key })).pipe(
          Effect.map((result) => result.success),
          Effect.catch(() => logMail('throttle.unread').pipe(Effect.as(true))),
        ),
    });

    const background = Background.of({ run: (work) => inRuntime(exec.waitUntil(work)) });

    const services = Layer.mergeAll(
      layerD1(inRuntime(db.raw)),
      tokensLayer(tokenKey),
      Layer.succeed(Mailer, mailer),
    );
    return Layer.mergeAll(
      layerModel.pipe(Layer.provide(DomainCloudflare.DurableObjects)),
      Layer.succeed(FilmQueue, films),
      Layer.succeed(Throttle, throttle),
      Layer.succeed(Background, background),
      Layer.succeed(AdminToken, adminToken),
      layerWebCrypto,
      layerSite,
    ).pipe(Layer.provideMerge(layerTables), Layer.provideMerge(services));
  }),
);

/** The runtime layers the list's bindings resolve through. */
export const MailBindings = Layer.mergeAll(
  Cloudflare.D1.QueryDatabaseBinding,
  Cloudflare.Email.SendBinding,
  Cloudflare.Queues.WriteQueueBinding,
  Cloudflare.Queues.EventSourceLive,
  Cloudflare.Workers.RateLimitBinding,
);
