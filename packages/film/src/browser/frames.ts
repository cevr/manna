import { Clock, Context, Effect, Layer, Option } from 'effect';
import type { Scope } from 'effect';

interface FramesOps {
  readonly next: Effect.Effect<number>;
  readonly loop: (step: (at: number) => boolean) => Effect.Effect<void>;
  readonly coalesce: (paint: () => void) => Effect.Effect<() => void, never, Scope.Scope>;
}

export type Ask = (run: (at: number) => void) => () => void;

const framesOver = (ask: Ask): FramesOps => ({
  next: Effect.callback<number>((resume) => {
    const cancel = ask((at) => resume(Effect.succeed(at)));
    return Effect.sync(cancel);
  }),
  loop: (step) =>
    Effect.callback<void>((resume) => {
      let stopped = false;
      let cancel = ask(function frame(at) {
        const more = step(at);
        if (stopped) return;
        if (more) cancel = ask(frame);
        else resume(Effect.void);
      });
      return Effect.sync(() => {
        stopped = true;
        cancel();
      });
    }),
  coalesce: (paint) =>
    Effect.gen(function* () {
      let asked = Option.none<() => void>();
      yield* Effect.addFinalizer(() => Effect.sync(() => Option.map(asked, (cancel) => cancel())));
      return () => {
        if (Option.isSome(asked)) return;
        asked = Option.some(
          ask(() => {
            asked = Option.none();
            paint();
          }),
        );
      };
    }),
});

const FRAME_MS = 16;

export class Frames extends Context.Service<Frames, FramesOps>()('@manna/film/browser/Frames') {
  static readonly layerOver = (ask: Ask): Layer.Layer<Frames> =>
    Layer.succeed(Frames, framesOver(ask));
  static readonly layerClock: Layer.Layer<Frames> = Layer.effect(
    Frames,
    Effect.map(Effect.context<never>(), (context) =>
      framesOver((run) =>
        Effect.runCallbackWith(context)(
          Effect.flatMap(Effect.andThen(Effect.sleep(FRAME_MS), Clock.currentTimeMillis), (at) =>
            Effect.sync(() => run(at)),
          ),
        ),
      ),
    ),
  );
}
