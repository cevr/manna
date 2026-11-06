import * as BunServices from '@effect/platform-bun/BunServices';
import type { Raster } from '@manna/film/tools';
import { Effect, Layer } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import sharp from 'sharp';
import { filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import { platesOf } from '../../../library/storybook/shot.ts';
import { inItsOrder } from './index.ts';
import { CLOSE_EDGE_PX, limeEdgeOf, unfringed } from './plates/fringe.ts';

/**
 * The plates outside this film's storybook folder, keyed from the same
 * green ground and shared with its other scenes, each held to the lime edge
 * pixels it has now: repainting them is the plates' own work, named as a
 * follow-up.
 */
const SHARED_FRINGES: ReadonlyMap<string, number> = new Map([
  ['table.png', 753],
  ['far-table.png', 745],
]);

/** The courtyard's landscape planes, painted whole with their grass and leaves and keyed from no green ground, so their greens are no fringe. */
const LANDSCAPE = new Set(['sky.png', 'distance.png', 'near.png', 'path.png']);

/** The close plates cut from a green ground and laid over a scene: the feast table close and the milk insert's cup and dropper. */
const CLOSE_KEYED = new Set(['table-close.png', 'milk-cup-close.png', 'milk-dropper-close.png']);

/** A plate's pixels. */
const rasterOf = Effect.fn('Act1Plates.rasterOf')(function* (png: string) {
  const { data, info } = yield* Effect.promise(() =>
    sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  const raster: Raster = { width: info.width, height: info.height, rgba: new Uint8Array(data) };
  return raster;
});

/** Each act 1 plate's PNG, once, by the shots that draw it. */
const platePngs = Effect.map(
  shotsOf(inItsOrder),
  (placed) =>
    new Set(
      placed.flatMap(({ shot }) =>
        platesOf(shot).flatMap((plate) => {
          const png = plate.painting?.png ?? '';
          if (png === '' || LANDSCAPE.has(png.split('/').at(-1) ?? png)) return [];
          return [png];
        }),
      ),
    ),
);

describe("In Its Order's act 1 plates", () => {
  it.effect(
    'shows no lime on any plate’s edge, a plate shared with other scenes no more than it has now (critique 3, finding 5: the close table plate’s keyed green fringed its leaves, fruit and board, 8 % of its edge)',
    () =>
      Effect.gen(function* () {
        const pngs = yield* platePngs;
        const fringes = yield* Effect.forEach(
          [...pngs],
          (png) =>
            Effect.map(rasterOf(png), (plate) => ({
              name: png.split('/').at(-1) ?? png,
              lime: limeEdgeOf(plate).length,
            })),
          { concurrency: 'unbounded' },
        );
        expect(fringes.map((f) => f.name)).toContain('table-close.png');
        expect(fringes.filter((f) => f.lime > (SHARED_FRINGES.get(f.name) ?? 0))).toEqual([]);
      }).pipe(
        Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
      ),
  );

  it.effect(
    'shows no lime within 4 px of the edge of a close plate keyed from green: the table, the milk cup and the dropper (critique 4, fault 3: 72 lime px 3–4 px in left a soft rim on its leaf tops)',
    () =>
      Effect.gen(function* () {
        const pngs = yield* platePngs;
        const close = [...pngs].filter((png) => CLOSE_KEYED.has(png.split('/').at(-1) ?? png));
        const lime = yield* Effect.forEach(close, (png) =>
          Effect.map(rasterOf(png), (plate) => limeEdgeOf(plate, CLOSE_EDGE_PX).length),
        );
        expect(lime).toEqual([0, 0, 0]);
      }).pipe(
        Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
      ),
  );

  test('repaints each lime pixel on a plate’s edge from its nearest opaque pixel that is not lime, and keeps the rest', () => {
    const [width, height] = [8, 3];
    const rgba = new Uint8Array(width * height * 4);
    for (let q = 0; q < width * height; q++) {
      const x = q % width;
      const paint: ReadonlyArray<number> = [
        [0, 0, 0, 0],
        [40, 200, 60, 255],
        [180, 120, 60, 255],
      ][Number(x >= 1) + Number(x >= 3)] ?? [0, 0, 0, 0];
      rgba.set(paint, q * 4);
    }
    const plate: Raster = { width, height, rgba };
    const out = unfringed(plate);
    expect(limeEdgeOf(plate)).toHaveLength(6);
    expect(limeEdgeOf(out)).toEqual([]);
    expect([...out.rgba.subarray(4, 8)]).toEqual([180, 120, 60, 255]);
    expect([...out.rgba.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...out.rgba.subarray(28, 32)]).toEqual([180, 120, 60, 255]);
  });
});
