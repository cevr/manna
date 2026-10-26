/**
 * Delivering a batch of a film's send (`./queue.ts`): each subscriber still
 * confirmed and still waiting for the film is sent its letter, with a leave
 * link of its own. The letter is claimed in the model before it goes and its
 * outcome kept after (`../list/FilmLetter.command.ts`), so a batch tried
 * again, or a film asked twice, reaches no one twice; a subscriber gone from
 * the list since the send was asked is passed over. A letter the sender
 * refuses for good is kept as refused. One it cannot take now gives its claim
 * back and fails the batch, which the queue tries again later from where it
 * stopped. A send that stops after its claim and before its outcome stays
 * claimed: its letter may have gone, so it is never sent again
 * (`FilmCounts.unsure`, `./roster.ts`).
 */
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
    // The letter is made before the claim, so nothing but the send itself
    // stands between a claim and the letter going.
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

/**
 * A queue that delivers what it is given at once, in the same request, for
 * `bun run preview`, where there is no Cloudflare Queue.
 */
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
