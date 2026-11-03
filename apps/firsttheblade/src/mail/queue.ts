import { Context, Effect, Layer, Ref, Schema } from 'effect';

import { SubscriberId } from '../list/Subscriber.id.ts';

export const Delivery = Schema.Struct({
  film: Schema.String,
  subscriber: SubscriberId,
  origin: Schema.String,
});
export type Delivery = typeof Delivery.Type;

export const BATCH = 100;

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  reason: Schema.String,
}) {}

export interface FilmQueueService {
  readonly put: (deliveries: ReadonlyArray<Delivery>) => Effect.Effect<void, QueueError>;
}

export class FilmQueue extends Context.Service<FilmQueue, FilmQueueService>()(
  'firsttheblade/FilmQueue',
) {}

export class Queued extends Context.Service<
  Queued,
  { readonly deliveries: Effect.Effect<ReadonlyArray<Delivery>> }
>()('firsttheblade/Queued') {}

export const layerMemory = Layer.effectContext(
  Effect.gen(function* () {
    const kept = yield* Ref.make<ReadonlyArray<Delivery>>([]);
    const put = (deliveries: ReadonlyArray<Delivery>) =>
      Ref.update(kept, (all) => [...all, ...deliveries]);
    return Context.make(FilmQueue, FilmQueue.of({ put })).pipe(
      Context.add(Queued, Queued.of({ deliveries: Ref.get(kept) })),
    );
  }),
);
