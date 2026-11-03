import type { Key } from '@alchemy.run/domain/Aggregate';
import { Effect, Layer, Option } from 'effect';

import {
  ClaimFilmLetter,
  ReleaseFilmLetter,
  SettleFilmLetter,
} from '../list/FilmLetter.command.ts';
import { Subscriber } from '../list/Subscriber.aggregate.ts';
import { Addresses } from './addresses.ts';
import { Films } from './films.ts';
import { filmLetter } from './letters.ts';
import { logMail, warnMail } from './log.ts';
import { Mailer } from './mailer.ts';
import { type Delivery, FilmQueue, QueueError } from './queue.ts';
import { Tokens } from './tokens.ts';

export const deliver = Effect.fn('Mail.deliver')(function* (deliveries: ReadonlyArray<Delivery>) {
  const subscribers = yield* Subscriber;
  const addresses = yield* Addresses;
  const mailer = yield* Mailer;
  const tokens = yield* Tokens;
  const films = yield* Films;
  const tally = { sent: 0, refused: 0, passed: 0 };
  for (const delivery of deliveries) {
    const film = films.find(delivery.film);
    if (Option.isNone(film)) {
      tally.passed += 1;
      yield* warnMail('film.unknown', { film: delivery.film });
      continue;
    }
    const ref = film.value.ref;
    const to = yield* addresses.find(delivery.subscriber);
    if (Option.isNone(to)) {
      tally.passed += 1;
      yield* warnMail('film.unaddressed', { film: ref, subscriber: delivery.subscriber });
      continue;
    }
    const token = yield* tokens.sign({ _tag: 'Unsubscribe', subscriber: delivery.subscriber });
    const letter = filmLetter(to.value, delivery.origin, film.value, token);
    const claim = yield* subscribers.send(delivery.subscriber, ClaimFilmLetter.make({ film: ref }));
    if (!claim.reply.claimed) {
      tally.passed += 1;
      continue;
    }
    const outcome = yield* mailer.send(letter).pipe(
      Effect.as('sent' as const),
      Effect.catchTag('MailRefused', (refusal) =>
        warnMail('film.refused', {
          film: ref,
          subscriber: delivery.subscriber,
          code: refusal.code,
        }).pipe(Effect.as('refused' as const)),
      ),
      Effect.tapError((failure) =>
        warnMail('film.retry', {
          film: ref,
          subscriber: delivery.subscriber,
          code: failure.code,
        }).pipe(
          Effect.andThen(
            subscribers.send(delivery.subscriber, ReleaseFilmLetter.make({ film: ref })),
          ),
        ),
      ),
    );
    yield* subscribers.send(delivery.subscriber, SettleFilmLetter.make({ film: ref, outcome }));
    tally[outcome] += 1;
  }
  yield* logMail('film.delivered', { batch: deliveries.length, ...tally });
});

export const layerInlineQueue = Layer.effect(
  FilmQueue,
  Effect.gen(function* () {
    const services = yield* Effect.context<
      Key<'Subscriber'> | Addresses | Mailer | Tokens | Films
    >();
    return FilmQueue.of({
      put: (deliveries) =>
        deliver(deliveries).pipe(
          Effect.provideContext(services),
          Effect.mapError((failure) => QueueError.make({ reason: failure._tag })),
        ),
    });
  }),
);
