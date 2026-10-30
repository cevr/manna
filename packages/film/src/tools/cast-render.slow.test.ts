// `film concept render` over a member of two kept views drawn by a page
// double: a view whose fit rows fail is never shown to the critic, and its
// critique is recorded skipped with the rows that failed; a view whose rows
// pass is shown. Over a real folder, since the film's `rigs/cast.ts` is
// imported as a module.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { PuppetImagesBun } from '../puppet/images-bun.ts';
import type { ExportPages } from './pages.ts';
import { CastSheetJson } from '../core/cast-record.ts';
import type { Raster } from '../core/raster.ts';
import { Segment } from '../core/segment.ts';
import { renderCast } from './cast-render.ts';
import { Critic } from './critique.ts';
import { FilmFolder, FilmName } from './film-repo.ts';
import { Pages } from './pages.ts';
import { encodePng } from './png.ts';

type Rgb = readonly [number, number, number];

const W = 64;
const H = 96;

/** A head over a body inside a 3 px line, `dx` to the right. */
const inside = (x: number, y: number, dx: number) =>
  (x - dx - 32) ** 2 + (y - 18) ** 2 <= 100 || (x - dx >= 18 && x - dx <= 46 && y >= 26 && y <= 84);

const CREAM: Rgb = [253, 225, 188];
const INK: Rgb = [43, 29, 22];

/** A pixel of a view: the ground outside its figure, its line within 3 px of its edge, its cream inside. */
const colourAt = (ground: Rgb, x: number, y: number, dx: number): Rgb => {
  if (!inside(x, y, dx)) return ground;
  const near = [-3, 0, 3].flatMap((ox) => [-3, 0, 3].map((oy) => inside(x + ox, y + oy, dx)));
  if (near.every(Boolean)) return CREAM;
  return INK;
};

/** Two views side by side on `ground`, each figure moved by its `dx`. */
const sheet = (ground: Rgb, dxs: readonly [number, number]): Uint8Array => {
  const rgba = new Uint8Array(2 * W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < 2 * W; x++) {
      const c = colourAt(ground, x % W, y, dxs[Math.floor(x / W)] ?? 0);
      rgba.set([c[0], c[1], c[2], 255], (y * 2 * W + x) * 4);
    }
  const raster: Raster = { width: 2 * W, height: H, rgba };
  return encodePng(raster);
};

const RECORD = {
  member: Segment.make('m'),
  scope: 'film' as const,
  who: 'him',
  refs: [],
  sheets: {},
  kept: {
    turnaround: {
      try: 1,
      why: 'kept',
      views: [
        { view: 1, name: 'front', box: [0, 0, W, H] as const },
        { view: 2, name: 'back', box: [W, 0, 2 * W, H] as const },
      ],
    },
  },
};

const CAST_MODULE = `export const PAPER = { base: '#eeddc9', tone: '#e0d0bb', seed: 1 };
export const SHEETS = { m: { turnaround: { width: ${2 * W}, height: ${H}, scale: 1 } } };
const view = (box) => ({ box, at: [0, 0], rig: {}, pose: {} });
export const CAST = { m: { turnaround: { front: view([0, 0, ${W}, ${H}]), back: view([${W}, 0, ${2 * W}, ${H}]) } } };
`;

/** A page double: its one scene, and the still it draws (each view's figure moved by its `dx`). */
const pages = (dxs: readonly [number, number]) =>
  Layer.succeed(
    Pages,
    Pages.of({
      open: () =>
        Effect.succeed({
          info: { width: 2 * W, height: H, fps: 24, duration: 1, frames: 24 },
          title: 'm',
          use: () => Effect.die('no page use in this test'),
          call: ((name: 'scenes' | 'still' | 'drawTimes', frames?: ReadonlyArray<number>) =>
            Effect.sync(() =>
              ({
                scenes: () => [{ id: 'turnaround', start: 0, dur: 1, marks: {}, cues: {} }],
                still: () => sheet([238, 221, 201], dxs),
                drawTimes: () => (frames ?? []).map(() => 1),
              })[name](),
            )) as unknown as ExportPages['call'],
        }),
    }),
  );

/** A critic double that writes down the figures each run is shown. */
const critic = (shown: Array<ReadonlyArray<string>>) =>
  Layer.succeed(
    Critic,
    Critic.of({
      critique: () => Effect.die('no scene critique in this test'),
      start: () => Effect.die('no scene critique in this test'),
      job: () => Effect.die('no scene critique in this test'),
      critiqueSheet: (ask) =>
        Effect.sync(() => {
          shown.push(ask.views.map((v) => v.figure));
          return { figures: [], cached: false, rejected: [] };
        }),
    }),
  );

/**
 * Film f in a fresh folder with member m, his record, his kept sheet and the
 * film's table; its page draws each view's figure moved by its `dx`, and the
 * critic writes down what it is shown into `shown`.
 */
const world = (dxs: readonly [number, number], shown: Array<ReadonlyArray<string>>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const films = path.join(root, 'films');
      const folder = path.join(films, 'f', 'cast', 'm', 'cast-sheet');
      yield* fs.makeDirectory(path.join(folder, 'kept'), { recursive: true });
      yield* fs.makeDirectory(path.join(films, 'f', 'rigs'), { recursive: true });
      yield* fs.writeFileString(
        path.join(folder, 'cast-sheet.json'),
        yield* Schema.encodeEffect(CastSheetJson)(RECORD),
      );
      yield* fs.writeFile(
        path.join(folder, 'kept', 'turnaround.png'),
        sheet([253, 241, 219], [0, 0]),
      );
      yield* fs.writeFileString(path.join(films, 'f', 'rigs', 'cast.ts'), CAST_MODULE);
      yield* fs.writeFileString(path.join(films, 'f', 'rigs', 'figures.riv'), 'riv');
      return Layer.mergeAll(
        FilmFolder.layer(films),
        pages(dxs),
        critic(shown),
        PuppetImagesBun,
        ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: path.join(root, 'out') })),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

/** Member m rendered, critique asked: the record, and the back view's critique file. */
const rendered = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const made = yield* renderCast(FilmName.make('f'), 'm', {
    kinds: [],
    views: [],
    critique: true,
    fitOnly: false,
  });
  const dir = yield* Effect.fromOption(made.dir);
  return { made, back: yield* fs.readFileString(path.join(dir, 'turnaround-back.critique.md')) };
});

describe('film concept render', () => {
  const shownFit: Array<ReadonlyArray<string>> = [];
  it.effect('the critique waits on every fit bar', () =>
    Effect.gen(function* () {
      const { made, back } = yield* rendered;
      expect(shownFit).toEqual([['turnaround-front']]);
      expect(made.render.views.map((v) => v.critique)).toEqual(['taken', 'skipped']);
      expect(made.render.views[0]?.fit?.every((r) => r.pass)).toBe(true);
      expect(Option.getOrElse(made.render.views[1]?.skipped ?? Option.none(), () => '')).toMatch(
        /^fit: silhouette\.edge\/head /,
      );
      expect(back).toContain('Skipped: fit: silhouette.edge/head');
    }).pipe(Effect.scoped, Effect.provide(world([0, 10], shownFit))),
  );

  const shownNone: Array<ReadonlyArray<string>> = [];
  it.effect('with no view passing, the critic is never asked', () =>
    Effect.gen(function* () {
      const { made } = yield* rendered;
      expect(shownNone).toEqual([]);
      expect(made.render.views.map((v) => v.critique)).toEqual(['skipped', 'skipped']);
    }).pipe(Effect.scoped, Effect.provide(world([10, 10], shownNone))),
  );
});
