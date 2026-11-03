import { Digest } from 'effect/crypto';
import type { Key } from '@alchemy.run/domain/Aggregate';
import { Clock, Context, Duration, Effect, Option, Redacted, Schema } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse, UrlParams } from 'effect/http';

import { Confirm } from '../list/ConfirmLink.command.ts';
import { Leave } from '../list/Leave.command.ts';
import { SignUp } from '../list/SignUp.command.ts';
import { Subscriber } from '../list/Subscriber.aggregate.ts';
import type { SubscriberId } from '../list/Subscriber.id.ts';
import { CONFIRM_FOR } from '../list/timing.ts';
import { Assets, pageRequest } from '../worker/assets.ts';
import { type Address, addressOf } from './address.ts';
import { Addresses } from './addresses.ts';
import { type SendAnswer, SendRequest } from './admin.ts';
import { Background } from './background.ts';
import { Films } from './films.ts';
import { logMail, reasonOf, warnMail } from './log.ts';
import { MAIL_PAGES, MAIL_ROUTES, SIGNUP_FIELDS } from './paths.ts';
import { BATCH, FilmQueue, type QueueError } from './queue.ts';
import { RosterTable } from './roster.ts';
import type { Sql, SqlError } from './sql.ts';
import { Throttle } from './throttle.ts';
import { type Token, Tokens } from './tokens.ts';

export class AdminToken extends Context.Service<AdminToken, Redacted.Redacted<string>>()(
  'firsttheblade/AdminToken',
) {}

export type MailServices =
  | Assets
  | Key<'Subscriber'>
  | Addresses
  | RosterTable
  | Sql
  | Tokens
  | Throttle
  | FilmQueue
  | AdminToken
  | Films
  | Background
  | Digest.Digest;

const see = (path: string) => HttpServerResponse.redirect(path, { status: 303 });

const text = (body: string, status: number) => HttpServerResponse.text(body, { status });

const json = (body: SendAnswer, status: number) => HttpServerResponse.jsonUnsafe(body, { status });

const page = Effect.fn('Mail.page')(function* (
  request: HttpServerRequest.HttpServerRequest,
  path: string,
  status: number,
) {
  const assets = yield* Assets;
  const served = yield* assets.serve(pageRequest(request, path));
  return HttpServerResponse.setStatus(served, status);
});

const originOf = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.originalUrl).origin;

const queryOf = (request: HttpServerRequest.HttpServerRequest, name: string) =>
  Option.fromNullishOr(new URL(request.originalUrl).searchParams.get(name));

const formOf = (request: HttpServerRequest.HttpServerRequest) =>
  request.urlParamsBody.pipe(Effect.orElseSucceed(() => UrlParams.empty));

const field = (form: UrlParams.UrlParams, name: string) =>
  Option.getOrElse(UrlParams.getFirst(form, name), () => '');

const placeOf = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(Headers.get(request.headers, 'cf-connecting-ip'), () => 'unknown');

const signUpAfter = Effect.fn('Mail.signUpAfter')(
  function* (address: Address, origin: string) {
    const tokens = yield* Tokens;
    const addresses = yield* Addresses;
    const subscribers = yield* Subscriber;
    const subscriber = yield* tokens.idOf(address);
    yield* addresses.keep(subscriber, address, yield* Clock.currentTimeMillis);
    const { reply } = yield* subscribers.send(subscriber, SignUp.make({ origin }));
    if (Option.isNone(reply.issued)) return yield* logMail('subscribe.quiet');
    yield* logMail('subscribe.issued', { subscriber });
  },
  Effect.catchCause((cause) =>
    warnMail('subscribe.failed', { reason: reasonOf(cause, (failure) => failure._tag) }),
  ),
);

const subscribe = Effect.fn('Mail.subscribe')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const throttle = yield* Throttle;
  if (!(yield* throttle.allow(placeOf(request)))) {
    yield* warnMail('subscribe.busy');
    return yield* page(request, MAIL_PAGES.busy, 429);
  }
  const form = yield* formOf(request);
  if (field(form, SIGNUP_FIELDS.honeypot) !== '') {
    yield* warnMail('subscribe.honeypot');
    return see(MAIL_PAGES.check);
  }
  const address = addressOf(field(form, SIGNUP_FIELDS.email));
  if (Option.isNone(address)) {
    yield* logMail('subscribe.invalid');
    return see(MAIL_PAGES.address);
  }
  const background = yield* Background;
  yield* background.run(signUpAfter(address.value, originOf(request)));
  return see(MAIL_PAGES.check);
});

interface ConfirmClaim {
  readonly subscriber: SubscriberId;
  readonly issued: number;
}

const claimOf = (read: Token, now: number): Option.Option<ConfirmClaim> => {
  if (read._tag !== 'Confirm') return Option.none();
  if (now - read.issued >= Duration.toMillis(CONFIRM_FOR)) return Option.none();
  return Option.some({ subscriber: read.subscriber, issued: read.issued });
};

const confirmClaimOf = Effect.fn('Mail.confirmClaimOf')(function* (
  request: HttpServerRequest.HttpServerRequest,
  now: number,
) {
  const tokens = yield* Tokens;
  const token = yield* Option.match(queryOf(request, 'token'), {
    onNone: () => Effect.succeedNone,
    onSome: tokens.read,
  });
  return Option.flatMap(token, (read) => claimOf(read, now));
});

const confirmPage = Effect.fn('Mail.confirmPage')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const claim = yield* confirmClaimOf(request, yield* Clock.currentTimeMillis);
  if (Option.isNone(claim)) {
    yield* logMail('confirm.expired');
    return see(MAIL_PAGES.expired);
  }
  return yield* page(request, MAIL_PAGES.confirm, 200);
});

const confirm = Effect.fn('Mail.confirm')(function* (request: HttpServerRequest.HttpServerRequest) {
  const now = yield* Clock.currentTimeMillis;
  const claim = yield* confirmClaimOf(request, now);
  if (Option.isNone(claim)) {
    yield* logMail('confirm.expired');
    return see(MAIL_PAGES.expired);
  }
  const subscribers = yield* Subscriber;
  const { subscriber, issued } = claim.value;
  const outcome = yield* subscribers.send(subscriber, Confirm.make({ issued })).pipe(
    Effect.as('confirmed' as const),
    Effect.catchTag('StaleLink', () => Effect.succeed('invalid' as const)),
  );
  yield* logMail(`confirm.${outcome}`, { subscriber });
  if (outcome === 'confirmed') return see(MAIL_PAGES.confirmed);
  return see(MAIL_PAGES.expired);
});

const leaverOf = Effect.fn('Mail.leaverOf')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const tokens = yield* Tokens;
  const token = yield* Option.match(queryOf(request, 'token'), {
    onNone: () => Effect.succeedNone,
    onSome: tokens.read,
  });
  return Option.flatMap(token, (read) => {
    if (read._tag !== 'Unsubscribe') return Option.none();
    return Option.some(read.subscriber);
  });
});

const leavePage = Effect.fn('Mail.leavePage')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const leaver = yield* leaverOf(request);
  if (Option.isNone(leaver)) return yield* page(request, MAIL_PAGES.badLink, 400);
  return yield* page(request, MAIL_PAGES.leave, 200);
});

const leave = Effect.fn('Mail.leave')(function* (request: HttpServerRequest.HttpServerRequest) {
  const leaver = yield* leaverOf(request);
  if (Option.isNone(leaver)) {
    yield* logMail('unsubscribe.invalid');
    return yield* page(request, MAIL_PAGES.badLink, 400);
  }
  const subscribers = yield* Subscriber;
  yield* subscribers.send(leaver.value, Leave.make({}));
  yield* logMail('unsubscribe.done', { subscriber: leaver.value });
  return yield* page(request, MAIL_PAGES.left, 200);
});

const sameSecret = Effect.fn('Mail.sameSecret')(function* (given: string, held: string) {
  const crypto = yield* Digest.Digest;
  const digest = (value: string) =>
    crypto.digest(Digest.sha256, new TextEncoder().encode(value)).pipe(Effect.orDie);
  const a = yield* digest(given);
  const b = yield* digest(held);
  let difference = 0;
  for (const [index, byte] of a.entries()) difference |= byte ^ (b[index] ?? 0);
  return difference === 0;
});

const BEARER = /^Bearer (.+)$/;

const isAdmin = Effect.fn('Mail.isAdmin')(function* (request: HttpServerRequest.HttpServerRequest) {
  const held = yield* AdminToken;
  const given = Option.getOrElse(
    Option.flatMap(Headers.get(request.headers, 'authorization'), (header) =>
      Option.fromNullishOr(BEARER.exec(header)?.[1]),
    ),
    () => '',
  );
  return yield* sameSecret(given, Redacted.value(held));
});

const send = Effect.fn('Mail.send')(function* (request: HttpServerRequest.HttpServerRequest) {
  if (!(yield* isAdmin(request))) {
    yield* warnMail('send.unauthorized');
    return json({ error: 'unauthorized' }, 401);
  }
  const body = yield* request.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SendRequest)),
    Effect.option,
  );
  if (Option.isNone(body)) return json({ error: 'expected { film, dryRun? }' }, 400);
  const film = (yield* Films).find(body.value.film);
  if (Option.isNone(film)) return json({ error: `no film ${body.value.film} on the site` }, 404);
  const ref = film.value.ref;
  const roster = yield* RosterTable;
  const counts = yield* roster.counts(ref);
  if (body.value.dryRun === true) {
    yield* logMail('send.dry', { film: ref, ...counts });
    return json({ film: ref, ...counts, queued: 0 }, 200);
  }
  const queue = yield* FilmQueue;
  const origin = originOf(request);
  let after = '';
  let queued = 0;
  for (;;) {
    const ids = yield* roster.waiting(ref, after, BATCH);
    if (ids.length === 0) break;
    yield* queue.put(ids.map((subscriber) => ({ film: ref, subscriber, origin })));
    queued += ids.length;
    after = ids.at(-1) ?? after;
  }
  yield* logMail('send.queued', { film: ref, queued });
  return json({ film: ref, ...counts, queued }, 202);
});

type Handler = (
  request: HttpServerRequest.HttpServerRequest,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, SqlError | QueueError, MailServices>;

const ROUTES = new Map<string, ReadonlyMap<string, Handler>>([
  [MAIL_ROUTES.subscribe, new Map([['POST', subscribe]])],
  [
    MAIL_ROUTES.confirm,
    new Map<string, Handler>([
      ['GET', confirmPage],
      ['POST', confirm],
    ]),
  ],
  [
    MAIL_ROUTES.unsubscribe,
    new Map<string, Handler>([
      ['GET', leavePage],
      ['POST', leave],
    ]),
  ],
  [MAIL_ROUTES.send, new Map([['POST', send]])],
]);

export const mailRoute = (
  request: HttpServerRequest.HttpServerRequest,
  pathname: string,
): Option.Option<Effect.Effect<HttpServerResponse.HttpServerResponse, never, MailServices>> =>
  Option.map(Option.fromNullishOr(ROUTES.get(pathname)), (methods) =>
    Option.match(Option.fromNullishOr(methods.get(request.method)), {
      onNone: () => {
        const allow = [...methods.keys()].join(', ');
        return Effect.succeed(
          HttpServerResponse.text('Method Not Allowed', { status: 405, headers: { allow } }),
        );
      },
      onSome: (handler) =>
        handler(request).pipe(
          Effect.catch((failure) =>
            warnMail('route.failed', { route: pathname, reason: failure._tag }).pipe(
              Effect.as(text('Something went wrong. Please try again later.', 503)),
            ),
          ),
        ),
    }),
  );
