import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Layer, Schema, Stdio, Stream } from 'effect';
import { ContentStore } from '../content-store.ts';

Stdio.Stdio.use(({ args, stdin }) =>
  Effect.flatMap(args, ([file = '']) =>
    ContentStore.use((store) =>
      store.holding({ file, codec: Schema.String, empty: '' }, () =>
        Effect.andThen(Console.log('held'), Stream.runDrain(stdin)),
      ),
    ),
  ),
).pipe(
  Effect.provide(ContentStore.layer.pipe(Layer.provideMerge(BunServices.layer))),
  BunRuntime.runMain,
);
