import { Clock, Context, Effect, Layer, Ref } from 'effect';

export const SIGNUPS = { limit: 5, period: 60 } as const;

export interface ThrottleService {
  readonly allow: (key: string) => Effect.Effect<boolean>;
}

export class Throttle extends Context.Service<Throttle, ThrottleService>()(
  'firsttheblade/Throttle',
) {}

export const layerMemory = Layer.effect(
  Throttle,
  Effect.gen(function* () {
    const windows = yield* Ref.make(
      new Map<string, { readonly start: number; readonly count: number }>(),
    );
    const allow = Effect.fn('Throttle.allow')(function* (key: string) {
      const now = yield* Clock.currentTimeMillis;
      const start = now - (now % (SIGNUPS.period * 1000));
      return yield* Ref.modify(windows, (map) => {
        const seen = map.get(key);
        let count = 1;
        if (seen?.start === start) count = seen.count + 1;
        const next = new Map(map).set(key, { start, count });
        return [count <= SIGNUPS.limit, next] as const;
      });
    });
    return Throttle.of({ allow });
  }),
);
