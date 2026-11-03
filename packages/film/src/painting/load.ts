import { Effect, Exit, Option, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import type { Edge, LoadedPainting, PaintingSpec } from '../canvas/painting.ts';
import { type PaintingImage, PaintingImages, PaintingUnloadable } from './images.ts';

const edgePixels = (edge: Edge, w: number, h: number): ReadonlyArray<number> => {
  switch (edge) {
    case 'top':
      return Array.from({ length: w }, (_, x) => x);
    case 'bottom':
      return Array.from({ length: w }, (_, x) => (h - 1) * w + x);
    case 'left':
      return Array.from({ length: h }, (_, y) => y * w);
    case 'right':
      return Array.from({ length: h }, (_, y) => y * w + w - 1);
  }
};

export const paintedEdges = (
  rgba: Uint8Array,
  w: number,
  h: number,
  open: ReadonlyArray<Edge>,
): ReadonlyArray<Edge> =>
  open.filter((edge) => edgePixels(edge, w, h).some((px) => (rgba[px * 4 + 3] ?? 0) > 0));

const heldTo = (spec: PaintingSpec, image: PaintingImage) => {
  const unloadable = (reason: string) => PaintingUnloadable.make({ painting: spec.key, reason });
  const [w, h] = spec.size;
  if (image.width !== w || image.height !== h)
    return Effect.fail(
      unloadable(`${spec.png} is ${image.width}x${image.height}, the painting ${w}x${h}`),
    );
  const painted = Option.match(image.rgba, {
    onNone: () => [],
    onSome: (rgba) => paintedEdges(rgba, w, h, spec.open ?? []),
  });
  if (painted.length > 0)
    return Effect.fail(
      unloadable(`its open ${painted.join(', ')} edge has paint (alpha above 0) on it`),
    );
  return Effect.succeed({ image: image.image } satisfies LoadedPainting);
};

const loadPainting = Effect.fn('Painting.load')(function* (spec: PaintingSpec) {
  const images = yield* PaintingImages;
  const image = yield* images
    .read(spec.png)
    .pipe(
      Effect.mapError((e) => PaintingUnloadable.make({ painting: spec.key, reason: e.reason })),
    );
  return yield* heldTo(spec, image);
});

export const loadPaintings = Effect.fn('Painting.loadPaintings')(function* (
  film: Film,
): Effect.fn.Return<Film, PaintingUnloadable, PaintingImages | Scope.Scope> {
  const caller = yield* Scope.Scope;
  const stood = Effect.gen(function* () {
    const loaded = new Map<PaintingSpec, LoadedPainting>();
    for (const spec of film.paintings.declared) loaded.set(spec, yield* loadPainting(spec));
    yield* Effect.acquireRelease(
      Effect.sync(() => film.paintings.stand(loaded)),
      (down) => Effect.sync(down),
    );
    return film;
  });
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const own = yield* Scope.make('sequential');
      const done = yield* Effect.exit(restore(Scope.provide(stood, own)));
      if (Exit.isFailure(done)) {
        yield* Scope.close(own, done);
        return yield* done;
      }
      yield* Scope.addFinalizerExit(caller, (exit) => Scope.close(own, exit));
      return done.value;
    }),
  );
});
