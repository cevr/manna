// A film's painted plates loaded before its first frame (`loadPaintings`), as
// its puppets are (`puppet/load.ts`): every painting its drawings declare
// (`film.paintings.declared`), each PNG read once through the
// `PaintingImages` the host gives (a page decodes it here, never in a frame),
// held to its spec, and stood on the film for its draws. What a read holds (a
// page's bitmap) is the load scope's, handed to the caller's and freed when
// it closes; the paintings stand on the film until then. One rule holds for
// every host: a PNG of another size than its spec declares fails the load,
// and where the host gives the bytes, so does paint (alpha above 0) on the
// outermost row or column of an edge the spec declares open.

import { Effect, Exit, Option, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import type { Edge, LoadedPainting, PaintingSpec } from '../canvas/painting.ts';
import { type PaintingImage, PaintingImages, PaintingUnloadable } from './images.ts';

/** The pixel offsets (into RGBA bytes) of `edge`'s outermost row or column in a `w` × `h` picture. */
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

/** The edges of `open` with paint on their outermost row or column of `rgba` (a `w` × `h` picture). */
export const paintedEdges = (
  rgba: Uint8Array,
  w: number,
  h: number,
  open: ReadonlyArray<Edge>,
): ReadonlyArray<Edge> =>
  open.filter((edge) => edgePixels(edge, w, h).some((px) => (rgba[px * 4 + 3] ?? 0) > 0));

/** `image` held to `spec`: its declared size, and its open edges clear where the bytes are given. */
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

/** One declared painting, read and held to its spec. */
const loadPainting = Effect.fn('Painting.load')(function* (spec: PaintingSpec) {
  const images = yield* PaintingImages;
  const image = yield* images
    .read(spec.png)
    .pipe(
      Effect.mapError((e) => PaintingUnloadable.make({ painting: spec.key, reason: e.reason })),
    );
  return yield* heldTo(spec, image);
});

/**
 * Load every painting `film`'s drawings declare and stand them on it for its
 * draws, until the caller's scope closes: what a film's load path runs before
 * its first frame, after its puppets. The film, ready to draw. As
 * `loadPuppets`, what the load acquires is held in a scope of its own that
 * only the load closes while it runs, then handed to the caller's.
 */
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
