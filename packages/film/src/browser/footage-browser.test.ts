import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from 'effect';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { FootageDecoders, footageLayer } from './footage-browser.ts';
import { Footage } from './footage.ts';

interface Counted {
  made: number;
  returned: number;
  decoded: number;
  frames: number;
}

const counted = (): Counted => ({ made: 0, returned: 0, decoded: 0, frames: 0 });

interface Gate {
  readonly asked: Deferred.Deferred<void>;
  readonly open: Deferred.Deferred<void>;
}

const settled = <A>(value: A) => Effect.runPromise(Effect.succeed(value));

const DONE = { done: true } as const;

const standIn = (count: Counted, closed: ReadonlySet<string>, gated: ReadonlyMap<string, Gate>) => {
  const sample = (at: number) => ({
    timestamp: at,
    displayWidth: 4,
    displayHeight: 2,
    draw: () => {},
    close: () => {},
    toVideoFrame: () => {
      count.decoded += 1;
      return {
        close: () => {
          count.frames += 1;
        },
      };
    },
  });
  class UrlSource {
    constructor(readonly url: string) {}
  }
  class Input {
    readonly url: string;
    constructor(options: { readonly source: UrlSource }) {
      this.url = options.source.url;
    }
    getPrimaryVideoTrack() {
      const track = Option.getOrNull(
        Option.liftPredicate({ url: this.url }, () => !closed.has(this.url)),
      );
      return Effect.runPromise(
        Option.match(Option.fromUndefinedOr(gated.get(this.url)), {
          onNone: () => Effect.succeed(track),
          onSome: (gate) =>
            Deferred.done(gate.asked, Exit.void).pipe(
              Effect.andThen(Deferred.await(gate.open)),
              Effect.as(track),
            ),
        }),
      );
    }
    dispose() {}
  }
  class VideoSampleSink {
    getSample(at: number) {
      return settled(sample(at));
    }
    samplesAtTimestamps(times: ReadonlyArray<number>) {
      count.made += 1;
      let i = 0;
      return {
        next: () =>
          settled(
            Option.match(Option.fromUndefinedOr(times[i]), {
              onNone: () => DONE,
              onSome: (at) => {
                i += 1;
                return { done: false, value: sample(at) };
              },
            }),
          ),
        return: () => {
          count.returned += 1;
          return settled(DONE);
        },
      };
    }
  }
  const module = { Input, UrlSource, ALL_FORMATS: [], VideoSampleSink };
  return module as unknown as Awaited<ReturnType<Decoders['load']>>;
};

type Decoders = Parameters<typeof FootageDecoders.of>[0];

const hostOver = (
  count: Counted,
  closed: ReadonlySet<string> = new Set(),
  gated: ReadonlyMap<string, Gate> = new Map(),
) =>
  footageLayer((source) => source).pipe(
    Layer.provide(
      Layer.succeed(
        FootageDecoders,
        FootageDecoders.of({ load: () => settled(standIn(count, closed, gated)) }),
      ),
    ),
  );

const at = (source: string, t: number) => ({ source, at: t });

describe('the live footage host', () => {
  it.effect(
    "lets a run's decoders go when its scope closes, read partway or failed partway, with every frame it handed out",
    () => {
      const count = counted();
      return Effect.gen(function* () {
        const footage = yield* Footage;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const run = yield* footage.run([[at('a', 0)], [at('a', 1)], [at('a', 2)]]);
            yield* run.next;
            yield* run.next;
          }),
        );
        expect(count).toEqual({ made: 1, returned: 1, decoded: 2, frames: 2 });
        const failed = yield* Effect.scoped(
          Effect.gen(function* () {
            const run = yield* footage.run([[at('a', 0), at('b', 0)]]);
            return yield* Effect.flip(run.next);
          }),
        );
        expect(failed.source).toBe('b');
        expect(count).toEqual({ made: 2, returned: 2, decoded: 3, frames: 3 });
      }).pipe(Effect.provide(hostOver(count, new Set(['b']))));
    },
  );

  it.effect(
    'a read still opening its source when the run ends makes no decoder and holds no frame',
    () => {
      const count = counted();
      const gate: Gate = { asked: Deferred.makeUnsafe(), open: Deferred.makeUnsafe() };
      return Effect.gen(function* () {
        const footage = yield* Footage;
        const scope = yield* Scope.make();
        const run = yield* footage.run([[at('a', 0), at('b', 0)]]).pipe(Scope.provide(scope));
        const reading = yield* Effect.forkDetach(run.next);
        yield* Deferred.await(gate.asked);
        yield* Scope.close(scope, Exit.void);
        yield* Deferred.done(gate.open, Exit.void);
        const read = yield* Fiber.await(reading);
        expect(Exit.isFailure(read)).toBe(true);
        expect(count).toEqual({ made: 1, returned: 1, decoded: 1, frames: 1 });
      }).pipe(Effect.provide(hostOver(count, new Set(), new Map([['b', gate]]))));
    },
  );

  it.effect("hands a frame's reads over held: what is decoded after never takes them away", () =>
    Effect.gen(function* () {
      yield* standInDom();
      const footage = yield* Footage;
      const first = yield* footage.ready([at('a', 0)]);
      yield* footage.ready(Arr.makeBy(9, (i) => at('a', i + 1)));
      expect(first.frame(at('a', 0))).toBeDefined();
    }).pipe(Effect.scoped, Effect.provide(hostOver(counted()))),
  );
});
