import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Option, Scope } from 'effect';
import { type SceneSpec, createFilm } from '../canvas/film.ts';
import type { PaintingSpec } from '../canvas/painting.ts';
import { recorder, standInDom } from '../canvas/fixtures/stand-in.ts';
import { NEAR, SKY, paintingImages } from './fixtures/sky.ts';
import { loadPaintings, paintedEdges } from './load.ts';

/** A film of `scenes`, four seconds each. */
const filmOf = (scenes: ReadonlyArray<Pick<SceneSpec, 'id' | 'paintings' | 'draw'>>) =>
  createFilm({
    fps: 30,
    title: 'plates',
    paper: { base: '#ffffff', tone: '#000000', seed: 1 },
    shade: '#000000',
    scenes: scenes.map((s) => ({ ...s, min: 4 })),
  });

/** Two scenes sharing the sky, one with the near plate too. */
const twoScenes = () =>
  filmOf([
    { id: 'one', paintings: { sky: SKY, near: NEAR }, draw: (f) => f.painting('sky') },
    { id: 'two', paintings: { sky: SKY }, draw: (f) => f.painting('sky') },
  ]);

/** A 4 x 3 RGBA picture, opaque but where `clear` says. */
const tiny = (clear: (x: number, y: number) => boolean) => {
  const rgba = new Uint8Array(4 * 3 * 4);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 4; x++) if (!clear(x, y)) rgba[(y * 4 + x) * 4 + 3] = 255;
  return rgba;
};

/** The tiny plate read with `rgba` as its bytes. */
const tinyImages = (clear: (x: number, y: number) => boolean) =>
  paintingImages([TINY], () => ({ image: Option.none(), rgba: Option.some(tiny(clear)) })).layer;

/** A film whose one scene paints the tiny plate. */
const tinyFilm = () => filmOf([{ id: 't', paintings: { t: TINY }, draw: (f) => f.painting('t') }]);

const TINY: PaintingSpec = {
  key: 'fixtures/tiny',
  png: 'paint/tiny.png',
  size: [4, 3],
  open: ['top', 'left'],
};

describe('loadPaintings', () => {
  it.effect('reads each declared painting once, even when two scenes share it', () => {
    const { read, layer } = paintingImages();
    return Effect.gen(function* () {
      const film = twoScenes();
      expect(film.paintings.declared).toEqual([SKY, NEAR]);
      yield* loadPaintings(film);
      expect(read).toEqual(['paint/sky.png', 'paint/near.png']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('fails, naming the painting and both sizes, on a PNG of another size', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(loadPaintings(twoScenes()));
      expect(error.painting).toBe('fixtures/sky');
      expect(error.reason).toContain('1920x1000');
      expect(error.reason).toContain('1920x1280');
    }).pipe(
      Effect.scoped,
      Effect.provide(paintingImages([{ ...SKY, size: [1920, 1000] }, NEAR]).layer),
    ),
  );

  it.effect('loads a plate whose open edges are clear', () =>
    Effect.gen(function* () {
      const film = tinyFilm();
      yield* loadPaintings(film);
      expect(film.paintings.declared).toEqual([TINY]);
    }).pipe(Effect.scoped, Effect.provide(tinyImages((x, y) => x === 0 || y === 0))),
  );

  it.effect('fails naming an open edge with paint on it, and only that edge', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(loadPaintings(tinyFilm()));
      expect(error.painting).toBe('fixtures/tiny');
      expect(error.reason).toContain('left');
      expect(error.reason).not.toContain('top');
      expect(
        paintedEdges(
          tiny(() => false),
          4,
          3,
          [],
        ),
      ).toEqual([]);
      expect(
        paintedEdges(
          tiny((_x, y) => y !== 2),
          4,
          3,
          ['bottom', 'right'],
        ),
      ).toEqual(['bottom', 'right']);
    }).pipe(Effect.scoped, Effect.provide(tinyImages((x, y) => (x === 0 && y !== 2) || y === 0))),
  );

  it.effect('stands the paintings until the caller scope closes, then releases each read', () => {
    const { released, layer } = paintingImages();
    return Effect.gen(function* () {
      yield* standInDom({ record: false });
      const film = twoScenes();
      const draw = () => film.render(recorder().ctx, 1);
      expect(draw).toThrow('painting fixtures/sky is not loaded (loadPaintings)');
      const scope = yield* Scope.make();
      yield* loadPaintings(film).pipe(Scope.provide(scope));
      draw();
      expect(released).toEqual([]);
      yield* Scope.close(scope, Exit.void);
      expect(released.toSorted()).toEqual(['paint/near.png', 'paint/sky.png']);
      expect(draw).toThrow('not loaded');
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('a failed load releases what it had read', () => {
    const { released, layer } = paintingImages([SKY, { ...NEAR, size: [1, 1] }]);
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(loadPaintings(twoScenes()));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(released).toEqual(['paint/near.png', 'paint/sky.png']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});
