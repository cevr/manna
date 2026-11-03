import { Effect, Layer, Option, Path } from 'effect';
import { addressFromConfig } from '../lab-cli.ts';
import { setsReads } from '../sets-mcp.ts';
import { StageFailed } from './graph.ts';
import { DrawingSet } from './owner-ask.ts';

export const drawingSetLive = Layer.effect(
  DrawingSet,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const sets = yield* setsReads();
    return DrawingSet.of({
      publish: (film, needs) =>
        Effect.gen(function* () {
          const files = needs.map((n) => ({
            from: n.file,
            to: `${n.member}/${n.id}${path.extname(n.file)}`,
          }));
          const published = yield* sets
            .publishSet(`cast-keep-${film}`, files, {
              title: `Cast drawings the build asks to keep: ${film}`,
              images: files.map((f) => f.to),
            })
            .pipe(Effect.mapError((e) => StageFailed.make({ reason: `ask: ${e.message}` })));
          const srcOf = new Map(published.files.map((f) => [f.file, f.src]));
          return yield* Effect.forEach(files, (f) =>
            Effect.fromOption(Option.fromUndefinedOr(srcOf.get(f.to))).pipe(
              Effect.mapError(() =>
                StageFailed.make({ reason: `ask: the set does not serve ${f.to}` }),
              ),
            ),
          );
        }),
    });
  }),
).pipe(Layer.provide(addressFromConfig));
