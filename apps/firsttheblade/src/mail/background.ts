import { Context, Effect, Layer, Ref } from 'effect';

export interface BackgroundService {
  readonly run: <R>(work: Effect.Effect<void, never, R>) => Effect.Effect<void, never, R>;
}

export class Background extends Context.Service<Background, BackgroundService>()(
  'firsttheblade/Background',
) {}

export const layerInline = Layer.succeed(Background, Background.of({ run: (work) => work }));

export class Held extends Context.Service<
  Held,
  {
    readonly settle: Effect.Effect<void>;
  }
>()('firsttheblade/Held') {}

export const layerHeld = Layer.effectContext(
  Effect.gen(function* () {
    const kept = yield* Ref.make<ReadonlyArray<Effect.Effect<void>>>([]);
    const run = <R>(work: Effect.Effect<void, never, R>) =>
      Effect.gen(function* () {
        const context = yield* Effect.context<R>();
        const ready = Effect.provideContext(work, context);
        yield* Ref.update(kept, (all) => [...all, ready]);
      });
    const settle = Effect.gen(function* () {
      for (const work of yield* Ref.getAndSet(kept, [])) yield* work;
    });
    return Context.make(Background, Background.of({ run })).pipe(
      Context.add(Held, Held.of({ settle })),
    );
  }),
);
