import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { rng } from '@manna/film/core';
import { decodePng, encodePng, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Layer, Option, Result, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';
import { filmCast, filmFolder, filmNamed, filmShot } from '../films.ts';
import type { PaintFigure, PaintRequest, PaintScene } from '../painter.ts';
import { dataUrlOf, loadShot, storybookPage, StorybookFailed } from '../render.ts';
import { alphaAt, anchorOf, type Box, paintsOf, type Palette } from '../sheet.ts';
import { figuresOf, hold, type Shot } from '../shot.ts';
import { feastCourtyard } from '../shots/feast-courtyard.ts';
import type { StoredFigure } from '../store.ts';
import { planeOf } from './covers.ts';
import {
  type FrameRead,
  heightSamples,
  LEAST_HEIGHT,
  observeHeight,
  readFigure,
} from './measures.ts';
import { analysisBoxOf } from './rows.ts';
import { verifyShot } from './run.ts';

const CLI = `${import.meta.dir}/../cli.ts`;
const GROWTH = `${import.meta.dir}/height-growth.preload.ts`;
const BABY = `${import.meta.dir}/height-baby.verify.ts`;
const BLURRED = `${import.meta.dir}/height-blur.verify.ts`;

const PALETTE: Palette = {
  ink: '#140a05',
  parts: [
    { name: 'skin', base: '#f0b482', role: 'skin' },
    { name: 'robe', base: '#6e827d', role: 'garment' },
  ],
};
const PAINTS = paintsOf(PALETTE);
const NO_LIGHT = {
  tint: { colour: '#ffffff', amount: 0 },
  shade: { colour: '#ffffff', amount: 0 },
};

/** The height receipts' cell (round 3, height-live): 60 × 200 inside a clear px, skin over its top third, inked round. */
const CELL: Raster = (() => {
  const paint = (x: number, y: number): ReadonlyArray<number> => {
    if (x === 1 || x === 60 || y === 1 || y === 200) return [20, 10, 5];
    if (y < 66) return [240, 180, 130];
    return [110, 130, 125];
  };
  const rgba = new Uint8Array(62 * 202 * 4);
  for (let y = 1; y <= 200; y++)
    for (let x = 1; x <= 60; x++) rgba.set([...paint(x, y), 255], (y * 62 + x) * 4);
  return { width: 62, height: 202, rgba };
})();
const ANCHOR = { ax: 30.5, ay: 201 };

/** The verifier's round 1 overlap cell (M2): 82 × 242, a head over a body on two feet apart, a stroke beside the head. */
const OVERLAP_CELL: Raster = (() => {
  const rgba = new Uint8Array(82 * 242 * 4);
  for (let y = 21; y <= 220; y++)
    for (let x = 1; x <= 80; x++) {
      const d = Math.abs(x - 39);
      const inside = [d <= 15, d <= 18, d >= 4 && d <= 21][Number(y < 61) + 2 * Number(y >= 200)];
      if (inside)
        rgba.set(
          [
            ...([
              [110, 130, 125],
              [240, 180, 130],
            ][Number(y < 61)] ?? []),
            255,
          ],
          (y * 82 + x) * 4,
        );
    }
  for (let y = 12; y < 110; y++)
    for (let x = 64; x <= 68; x++) rgba.set([110, 130, 125, 255], (y * 82 + x) * 4);
  return { width: 82, height: 242, rgba };
})();
const OVERLAP_ANCHOR = { ax: 35.5, ay: 170 };

/** A figure named `name` drawing `cell` (the receipts' unless given) at `anchor`. */
const figureOf = (name: string, cell = CELL, anchor = ANCHOR): PaintFigure => ({
  _tag: 'Figure',
  name,
  palette: PALETTE,
  share: 1,
  cells: { a: { image: dataUrlOf(encodePng(cell)), size: [cell.width, cell.height], ...anchor } },
  worn: [],
  blinks: [],
  dress: [],
});

const decoded = (png: Uint8Array) =>
  Effect.fromResult(decodePng(png)).pipe(
    Effect.mapError((e) => StorybookFailed.make({ reason: e.message })),
  );

/** One figure alone in a frame of `scene`: over the frame, and over its analysis surface at `z` with `blur`, its cell `cell` (the receipts' unless given). */
const both = (
  render: (req: PaintRequest, box?: Box) => Effect.Effect<Uint8Array, StorybookFailed>,
  scene: PaintScene,
  req: PaintRequest,
  z: number,
  blur: number,
  cell: {
    readonly width: number;
    readonly height: number;
    readonly ax: number;
    readonly ay: number;
  } = {
    width: 62,
    height: 202,
    ...ANCHOR,
  },
) =>
  Effect.gen(function* () {
    const f = req.figures.find((x) => x.name === req.only);
    const plane = planeOf(scene, z, { t: 0, ...req.camera });
    const place = {
      x: (f?.x ?? 0) * plane.scale + plane.ox,
      y: (f?.y ?? 0) * plane.scale + plane.oy,
      sx: (f?.scale ?? 1) * (f?.sx ?? 1) * plane.scale,
      sy: (f?.scale ?? 1) * (f?.sy ?? 1) * plane.scale,
    };
    const box = analysisBoxOf(place, cell, blur);
    return {
      box,
      frame: yield* decoded(yield* render(req)),
      analysis: yield* decoded(yield* render(req, box)),
    };
  });

/** The bytes, alpha included, of the frame render and the analysis render that differ anywhere they overlap. */
const differing = (frame: Raster, analysis: Raster, box: Box): number => {
  let n = 0;
  for (let y = Math.max(0, box.y); y < Math.min(frame.height, box.y + box.height); y++)
    for (let x = Math.max(0, box.x); x < Math.min(frame.width, box.x + box.width); x++) {
      const p = (y * frame.width + x) * 4;
      const q = ((y - box.y) * analysis.width + (x - box.x)) * 4;
      for (let c = 0; c < 4; c++) if (frame.rgba[p + c] !== analysis.rgba[q + c]) n += 1;
    }
  return n;
};

/** How many of a raster's pixels hold any alpha. */
const drawn = (r: Raster): number => {
  let n = 0;
  for (let q = 0; q < r.width * r.height; q++) if (alphaAt(r, q) > 0) n += 1;
  return n;
};

const spread = (reads: ReadonlyArray<FrameRead>) =>
  Option.getOrElse(heightSamples(reads)[0]?.value ?? Option.none(), () => -1);

const VerdictJson = Schema.fromJsonString(
  Schema.Struct({
    checks: Schema.Array(
      Schema.Struct({ id: Schema.String, pass: Schema.Boolean, value: Schema.String }),
    ),
  }),
);

const heightCheck = (json: string) =>
  Effect.map(Schema.decodeEffect(VerdictJson)(json), (v) =>
    v.checks.find((c) => c.id === 'render-height'),
  );

type Render = (req: PaintRequest, box?: Box) => Effect.Effect<Uint8Array, StorybookFailed>;

/** One frame's read of `stored` drawing `key` alone in the middle of `shot`'s frame, its crown-to-soles `height` px, `phase` px off whole px down and 0.7 of it across, stretched `growth` up; none where its cell has no lines. */
const castRead =
  (render: Render, shot: Shot, stored: StoredFigure, key: string) =>
  (height: number, phase: number, growth: number, frame: number) =>
    Effect.gen(function* () {
      const cell = Option.fromUndefinedOr(stored.cells.get(key));
      const lines = Option.flatten(Option.fromUndefinedOr(stored.lines.get(key)));
      if (Option.isNone(cell) || Option.isNone(lines)) return Option.none<FrameRead>();
      const scale = height / (lines.value.bottom - lines.value.crown + 1);
      const x = shot.size.width / 2 + 0.5 + phase * 0.7;
      const y = shot.size.height * 0.8 + phase;
      const box = analysisBoxOf(
        { x, y, sx: scale, sy: scale * growth },
        { width: cell.value.width, height: cell.value.height, ...anchorOf(lines.value) },
        stored.layer.blur,
      );
      const name = stored.figure.name;
      const raster = yield* decoded(
        yield* render(
          {
            t: frame,
            camera: { x: shot.size.width / 2, y: shot.size.height / 2, zoom: 1 },
            figures: [{ name, cell: key, x, y, sx: 1, sy: growth, scale }],
            only: name,
          },
          box,
        ),
      );
      return Option.some<FrameRead>({
        frame,
        name,
        cell: key,
        zoom: 1,
        squashed: false,
        read: readFigure(raster, stored.paints),
        height: observeHeight(raster),
      });
    });

const PHASES = [0, 0.17, 0.33, 0.5, 0.67, 0.83];

/** What a figure read by `read` gets wrong at `height`: held steady over `PHASES`, its reads more than 0.7 px apart or spread past 0.006; 3 % taller or shorter at any phase, a spread from any steady read at or under the bar. */
const heightMisses = (
  read: ReturnType<typeof castRead>,
  at: string,
  height: number,
): Effect.Effect<ReadonlyArray<string>, StorybookFailed> =>
  Effect.gen(function* () {
    const steady = (yield* Effect.forEach(PHASES, (p) => read(height, p, 1, 0))).flatMap(
      Option.toArray,
    );
    const heights = steady.map((r) => Result.getOrElse(r.height, () => -1));
    const misses: Array<string> = [];
    if (steady.length !== PHASES.length) misses.push(`${at}: no lines`);
    if (Math.max(...heights) - Math.min(...heights) > 0.7 || Math.min(...heights) < 0)
      misses.push(`${at} ${height} px steady reads ${heights.map((h) => h.toFixed(2)).join(' ')}`);
    if (!(spread(steady) >= 0 && spread(steady) <= 0.006))
      misses.push(`${at} ${height} px steady spreads ${spread(steady)}`);
    for (const growth of [1.03, 0.97])
      for (const phase of PHASES)
        for (const changed of Option.toArray(yield* read(height, phase, growth, 1)))
          for (const a of steady)
            if (!(spread([a, changed]) > 0.02))
              misses.push(
                `${at} ${height} px × ${growth} at phase ${phase}: ${spread([a, changed])}`,
              );
    return misses;
  });

/** What a figure read by `read` gets wrong from `LEAST_HEIGHT` up (`heightMisses`), and a read under it that is not unread. */
const castMisses = (read: ReturnType<typeof castRead>, at: string) =>
  Effect.gen(function* () {
    const misses = (yield* Effect.forEach([LEAST_HEIGHT * 1.05, 120, 160, 234, 300, 500], (h) =>
      heightMisses(read, at, h),
    )).flat();
    for (const small of Option.toArray(yield* read(LEAST_HEIGHT * 0.6, 0.33, 1, 0)))
      if (Result.isSuccess(small.height))
        misses.push(`${at} ${LEAST_HEIGHT * 0.6} px read ${small.height.success}`);
    return misses;
  });

/** Where a pushed read stands its figure: whole inside the frame, or cut by one edge. */
const PUSH_VIEWS = ['inside', 'left', 'right', 'top', 'bottom'] as const;

/** One pushed read: the figure's crown-to-soles `height` px at zoom 1, the camera's `zoom`, a fraction of a px `phase`, where it stands (`PUSH_VIEWS`), its stretch up `growth`, and the frame it is. */
interface Pushed {
  readonly height: number;
  readonly zoom: number;
  readonly phase: number;
  readonly view: (typeof PUSH_VIEWS)[number];
  readonly growth: number;
  readonly frame: number;
}

/**
 * One frame's read of `stored` drawing `key` alone in a page of the shot's
 * scene whose layers stand at depth `z` blurred `blur` px: the camera at
 * the read's zoom, off the frame's middle by fractions of a px; the figure
 * placed `phase` px off whole px where its view stands it, so the frame
 * cuts it at that edge; painted `sharp` over its analysis surface, as the
 * verify's height render is (`requestOf`), and read at its plane's zoom.
 */
const pushedRead =
  (render: Render, shot: Shot, stored: StoredFigure, key: string, z: number, blur: number) =>
  (p: Pushed) =>
    Effect.gen(function* () {
      const cell = Option.fromUndefinedOr(stored.cells.get(key));
      const lines = Option.flatten(Option.fromUndefinedOr(stored.lines.get(key)));
      if (Option.isNone(cell) || Option.isNone(lines)) return Option.none<FrameRead>();
      const { width: w, height: h } = shot.size;
      const scale = p.height / (lines.value.bottom - lines.value.crown + 1);
      const camera = {
        x: w / 2 + 7.3 + p.phase * 3.1,
        y: h / 2 - 4.6 + p.phase * 1.7,
        zoom: p.zoom,
      };
      const plane = planeOf(shot.size, z, { t: 0, ...camera });
      const tall = p.height * p.growth * plane.scale;
      const middle = w / 2 + 0.5 + p.phase * 0.7;
      const places: Record<Pushed['view'], readonly [number, number]> = {
        inside: [middle, h * 0.8 + p.phase],
        left: [-0.31 + p.phase * 0.73, h * 0.8 + p.phase],
        right: [w + 0.27 - p.phase * 0.61, h * 0.8 + p.phase],
        top: [middle, tall * 0.45 + p.phase * 0.91],
        bottom: [middle, h + tall * 0.25 + p.phase * 0.91],
      };
      const [px, py] = places[p.view];
      const box = analysisBoxOf(
        { x: px, y: py, sx: scale * plane.scale, sy: scale * p.growth * plane.scale },
        { width: cell.value.width, height: cell.value.height, ...anchorOf(lines.value) },
        blur,
      );
      const name = stored.figure.name;
      const raster = yield* decoded(
        yield* render(
          {
            t: p.frame,
            camera,
            figures: [
              {
                name,
                cell: key,
                x: (px - plane.ox) / plane.scale,
                y: (py - plane.oy) / plane.scale,
                sx: 1,
                sy: p.growth,
                scale,
              },
            ],
            only: name,
            sharp: true,
          },
          box,
        ),
      );
      return Option.some<FrameRead>({
        frame: p.frame,
        name,
        cell: key,
        zoom: plane.scale,
        squashed: false,
        read: readFigure(raster, stored.paints),
        height: observeHeight(raster),
      });
    });

/** One pushed case's result: what it gets wrong, its steady spread, and the least spread of a changed read from a steady one (1 when it reads none). */
interface PushCase {
  readonly misses: ReadonlyArray<string>;
  readonly steady: number;
  readonly changed: number;
}

/**
 * What a figure read by `read` at `height` and `view` gets wrong while the
 * camera pushes: held steady at zooms 0.85, 1.6 and a drawn one between,
 * each at a drawn phase, it reads unread or spreads past 0.01; 3 % taller
 * or shorter at zoom 0.85 or 1.6, its spread from any steady read is at or
 * under the bar.
 */
const pushCase = (
  read: ReturnType<typeof pushedRead>,
  at: string,
  draw: () => number,
  height: number,
  view: Pushed['view'],
): Effect.Effect<PushCase, StorybookFailed> =>
  Effect.gen(function* () {
    const frame = (zoom: number, growth: number, n: number) =>
      read({ height, zoom, phase: draw(), view, growth, frame: n });
    const steady = (yield* Effect.forEach([0.85, 1.6, 0.85 + draw() * 0.75], (zoom, n) =>
      frame(zoom, 1, n),
    )).flatMap(Option.toArray);
    if (steady.length !== 3 || steady.some((r) => Result.isFailure(r.height)))
      return { misses: [`${at}: steady unread`], steady: 1, changed: 0 };
    const misses: Array<string> = [];
    if (!(spread(steady) <= 0.01)) misses.push(`${at}: steady spreads ${spread(steady)}`);
    const changed = (yield* Effect.forEach(
      [1.03, 0.97].flatMap((growth) => [0.85, 1.6].map((zoom) => [growth, zoom] as const)),
      ([growth, zoom]) =>
        Effect.map(frame(zoom, growth, 3), (r) =>
          Option.toArray(r).flatMap((c) =>
            steady.map((a) => ({
              value: spread([a, c]),
              at: `${at} × ${growth} at zoom ${zoom} against plane zoom ${a.zoom.toFixed(3)}`,
            })),
          ),
        ),
    )).flat();
    for (const c of changed) if (!(c.value > 0.02)) misses.push(`${c.at}: ${c.value}`);
    return {
      misses,
      steady: spread(steady),
      changed: Math.min(1, ...changed.map((c) => c.value)),
    };
  });

/** Each pushed case of the loaded shot's cast on one page whose layers stand at depth `z` blurred `blur` px: each view crossed with each figure, its key (one of its first two) and height (from `LEAST_HEIGHT` at zoom 0.85 up to 420 px, more of them small) drawn. */
const pushCases = (
  loaded: { readonly scene: PaintScene; readonly figures: ReadonlyArray<StoredFigure> },
  shot: Shot,
  z: number,
  blur: number,
) =>
  Effect.gen(function* () {
    const render = yield* storybookPage({
      ...loaded.scene,
      layers: loaded.scene.layers.map((l) => ({ ...l, z, blur })),
    });
    const draw = rng(100 * z + 10 * blur + 7);
    const least = (LEAST_HEIGHT * 1.05) / 0.85 ** (1 / z);
    return yield* Effect.forEach(
      PUSH_VIEWS.flatMap((view) => loaded.figures.map((stored) => ({ view, stored }))),
      ({ view, stored }) => {
        const keys = [...stored.cells.keys()].filter((k) => !k.endsWith('Blink'));
        const key = keys[Math.floor(draw() * Math.min(2, keys.length))] ?? '';
        const height = least + (420 - least) * draw() ** 2;
        const at = `z ${z} blur ${blur} ${view} ${stored.figure.name}/${key} ${height.toFixed(1)} px`;
        return pushCase(pushedRead(render, shot, stored, key, z, blur), at, draw, height, view);
      },
    );
  });

describe('render-height in Chrome: the analysis surface', () => {
  it.effect(
    'reads a whole render stretched 4 % (200 → 208 px to a fraction of a px; 210 to its faint fringe) as growth, with a steady side-cut frame added and with the growth cut at the top, and a steady whole and side-cut key as steady (round 3 receipts, height-live)',
    () =>
      Effect.gen(function* () {
        const scene: PaintScene = {
          width: 150,
          height: 270,
          paper: '#fdf7e5',
          light: NO_LIGHT,
          layers: [{ name: 'f', z: 1, blur: 0, items: [figureOf('f')] }],
        };
        const render = yield* storybookPage(scene);
        const read = (frame: number, x: number, y: number, sy: number) =>
          Effect.map(
            both(
              render,
              scene,
              {
                t: frame,
                camera: { x: 75, y: 135, zoom: 1 },
                figures: [{ name: 'f', cell: 'a', x, y, sx: 1, sy, scale: 1 }],
                only: 'f',
              },
              1,
              0,
            ),
            (r): FrameRead => ({
              frame,
              name: 'f',
              cell: 'a',
              zoom: 1,
              squashed: false,
              read: readFigure(r.frame, PAINTS),
              height: observeHeight(r.analysis),
            }),
          );
        const whole = yield* read(0, 60.5, 210, 1);
        const grown = yield* read(1, 60.5, 218, 1.04);
        const sideCut = yield* read(2, 5, 210, 1);
        const topCutGrown = yield* read(3, 60.5, 180, 1.04);
        expect([whole, grown, sideCut, topCutGrown].map((r) => r.read.whole)).toEqual([
          true,
          true,
          false,
          false,
        ]);
        expect(
          [whole, grown, sideCut, topCutGrown].map(
            (r) => Math.round(Result.getOrElse(r.height, () => -1) * 10) / 10,
          ),
        ).toEqual([200, 208, 200, 208]);
        expect(spread([whole, grown])).toBeGreaterThan(0.02);
        expect(spread([whole, grown, sideCut])).toBeGreaterThan(0.02);
        expect(spread([whole, topCutGrown])).toBeGreaterThan(0.02);
        expect(spread([whole, sideCut])).toBe(0);
      }).pipe(Effect.scoped),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the case launches headless Chrome once and renders eight frames (spawn budget).
    120_000,
  );

  it.effect(
    'paints every pixel the figure-alone frame paints, byte for byte and alpha included, over generated fractional cameras, zooms, anchors, draw scales and breaths at depths 1–3, blurred and not, its surface inside the frame and past each edge and corner, and paints the figure past the frame whole (verifier round 1, M2: 70 channels apart at bc3d58886)',
    () =>
      Effect.gen(function* () {
        const misses: Array<string> = [];
        const views = ['inside', 'top', 'bottom', 'left', 'right', 'top-left', 'bottom-right'];
        for (const [z, blur] of [
          [1, 0],
          [1, 1.5],
          [2, 0.7],
          [3, 1.5],
        ] as const) {
          const scene: PaintScene = {
            width: 420,
            height: 700,
            paper: '#fdf7e5',
            light: NO_LIGHT,
            layers: [{ name: 'f', z, blur, items: [figureOf('f', OVERLAP_CELL, OVERLAP_ANCHOR)] }],
          };
          const render = yield* storybookPage(scene);
          const draw = rng(1000 * z + 10 * blur);
          const generated = views.flatMap((view) =>
            [0, 1, 2].map(() => {
              const camera = {
                x: 200 + draw() * 20,
                y: 340 + draw() * 20,
                zoom: 0.8 + draw() * 0.8,
              };
              const plane = planeOf(scene, z, { t: 0, ...camera });
              const scale = 0.7 + draw() * 0.8;
              const tall = OVERLAP_ANCHOR.ay * scale * plane.scale;
              const px =
                [150 + draw() * 120, -5 + draw() * 10, 415 + draw() * 10][
                  Number(view.includes('left')) + 2 * Number(view.includes('right'))
                ] ?? 0;
              const py =
                [300 + draw() * 250, tall * (0.2 + draw() * 0.6), 690 + draw() * 20][
                  Number(view.includes('top')) + 2 * Number(view.includes('bottom'))
                ] ?? 0;
              return {
                view,
                camera,
                figure: {
                  name: 'f',
                  cell: 'a',
                  x: (px - plane.ox) / plane.scale,
                  y: (py - plane.oy) / plane.scale,
                  sx: 1,
                  sy: 1 + draw() * 0.004,
                  scale,
                },
              };
            }),
          );
          const receipt = {
            view: 'inside',
            camera: { x: 216.3, y: 348.4, zoom: 1 },
            figure: { name: 'f', cell: 'a', x: 216.6, y: 498.6, sx: 1, sy: 1, scale: 0.9 },
          };
          for (const c of [receipt, ...generated]) {
            const r = yield* both(
              render,
              scene,
              { t: 0, camera: c.camera, figures: [c.figure], only: 'f' },
              z,
              blur,
              { width: OVERLAP_CELL.width, height: OVERLAP_CELL.height, ...OVERLAP_ANCHOR },
            );
            const at = `z ${z} blur ${blur} ${c.view} at ${c.figure.x.toFixed(2)},${c.figure.y.toFixed(2)} × ${c.figure.scale.toFixed(3)}`;
            const apart = differing(r.frame, r.analysis, r.box);
            if (apart > 0) misses.push(`${at}: ${apart} channels apart`);
            if (readFigure(r.frame, PAINTS).whole !== (c.view === 'inside'))
              misses.push(`${at}: the frame cuts it ${String(c.view !== 'inside')}`);
            if (c.view !== 'inside' && drawn(r.analysis) <= drawn(r.frame))
              misses.push(`${at}: not painted past the frame`);
            if (Result.isFailure(observeHeight(r.analysis))) misses.push(`${at}: unread`);
          }
        }
        expect(misses).toEqual([]);
      }).pipe(Effect.scoped),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the case launches headless Chrome four times and renders 176 frames (spawn budget).
    300_000,
  );

  it.effect(
    'reads the cast’s cells to a fraction of a px at every sampling phase from the least height it reads up, so each passes held steady and fails 3 % taller or shorter, and reads unread under it (verifier round 1, M1: the baby and toddler 1–2 px apart and 3 % passing at bc3d58886)',
    () =>
      Effect.gen(function* () {
        const film = yield* filmNamed('in-its-order');
        const { shot } = yield* filmShot(film, 'milk-row');
        const loaded = yield* loadShot(shot, yield* filmCast(film));
        const render = yield* storybookPage(loaded.scene);
        const misses: Array<string> = [];
        for (const stored of loaded.figures)
          for (const key of [...stored.cells.keys()]
            .filter((k) => !k.endsWith('Blink'))
            .slice(0, 2))
            misses.push(
              ...(yield* castMisses(
                castRead(render, shot, stored, key),
                `${stored.figure.name}/${key}`,
              )),
            );
        expect(misses).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
      ),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the case launches headless Chrome once and renders about 2000 frames (spawn budget).
    600_000,
  );

  it.effect(
    'reads the cast’s cells as steady and 3 % taller or shorter as changed while the camera pushes from zoom 0.85 to 1.6, on layers blurred 0, 1.5 and 3 px at depths 1–3, at generated heights from the least it reads up, fractional phases, whole and cut by each edge (verifier round 2, M1: the blurred lead 3 % shorter passed at 1683e0c07)',
    () =>
      Effect.gen(function* () {
        const film = yield* filmNamed('in-its-order');
        const { shot } = yield* filmShot(film, 'milk-row');
        const loaded = yield* loadShot(shot, yield* filmCast(film));
        const cases = (yield* Effect.forEach(
          [1, 2, 3].flatMap((z) => [0, 1.5, 3].map((blur) => [z, blur] as const)),
          ([z, blur]) => pushCases(loaded, shot, z, blur),
        )).flat();
        const worstSteady = Math.max(...cases.map((c) => c.steady));
        const leastChanged = Math.min(...cases.map((c) => c.changed));
        yield* Effect.log(
          `render-height push property: ${cases.length} cases, worst steady spread ${worstSteady.toFixed(4)}, least changed spread ${leastChanged.toFixed(4)}`,
        );
        expect(cases.length).toBe(9 * PUSH_VIEWS.length * loaded.figures.length);
        expect(cases.flatMap((c) => c.misses)).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
      ),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the case launches headless Chrome nine times and renders about 1600 frames (spawn budget).
    900_000,
  );
});

describe('render-height in the full verify', () => {
  it.effect(
    'passes the library lead holding steady while the camera trucks up past its crown, its head and then its body cut off at the top (round 3 receipts, topcut-verify: 17.2358 before)',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const lead = figuresOf(feastCourtyard).find((f) => f.figure.name === 'lead');
        expect(lead).toBeDefined();
        if (!lead) return;
        const shot: Shot = {
          ...feastCourtyard,
          id: 'height-regression',
          size: { width: 640, height: 480 },
          fps: 6,
          duration: 2,
          headPx: 100,
          camera: [
            { t: 0, x: 320, y: 240, zoom: 1 },
            { t: 0.5, x: 320, y: 600, zoom: 1 },
          ],
          layers: [
            {
              name: 'lead',
              z: 1,
              blur: 0,
              items: [
                {
                  ...lead.figure,
                  at: { x: 320, ground: 400 },
                  worn: [],
                  spans: [hold(0, 2, 'front')],
                },
              ],
            },
          ],
        };
        const { verdict, info } = yield* verifyShot(shot, `${tmp}/verify`, 1);
        const height = verdict.checks.find((c) => c.id === 'render-height');
        expect(height?.pass).toBe(true);
        expect(Number(height?.value)).toBeLessThanOrEqual(0.008);
        expect(info.some((line) => line.startsWith('render-height cut: lead read whole'))).toBe(
          true,
        );
      }).pipe(Effect.scoped, Effect.provide([BunServices.layer, BunCrypto.layerDigest])),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the run launches headless Chrome twice and ffmpeg once (spawn budget).
    600_000,
  );

  it.effect(
    'fails cold-ouch when its lead breathes 4 % taller from 1.4 s while its key holds (verifier round 2, M3: passed at 38cff0803)',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const code = yield* spawner.exitCode(
          ChildProcess.make(
            'bun',
            ['--preload', GROWTH, CLI, 'verify', 'in-its-order/cold-ouch', '--quick', '--out', tmp],
            { forceKillAfter: '5 seconds' },
          ),
        );
        expect(Number(code)).not.toBe(0);
        const height = yield* heightCheck(yield* fs.readFileString(`${tmp}/quick/verdict.json`));
        expect(height?.pass).toBe(false);
        expect(Number(height?.value)).toBeGreaterThan(0.02);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    900_000,
  );

  it.effect(
    'fails the real milk-row baby held in sit breathing 3 % taller at 200 px and 3 % shorter at 300 px, whole and cut by the left edge, and passes it held steady (verifier round 1, M1: passed at 0.0194 and 0.0168 at bc3d58886)',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const run = (px: number, factor: number, cut: string) =>
          Effect.gen(function* () {
            const out = `${tmp}/${px}-${factor}-${cut}`;
            const code = yield* spawner.exitCode(
              ChildProcess.make('bun', ['--preload', GROWTH, BABY], {
                env: {
                  HEIGHT_BABY_PX: String(px),
                  HEIGHT_BREATH_FACTOR: String(factor),
                  HEIGHT_BABY_CUT: cut,
                  HEIGHT_BABY_OUT: out,
                },
                extendEnv: true,
                forceKillAfter: '5 seconds',
              }),
            );
            expect(Number(code)).toBe(0);
            return yield* heightCheck(yield* fs.readFileString(`${out}/verdict.json`));
          });
        for (const [px, factor] of [
          [200, 1.03],
          [300, 0.97],
        ] as const)
          for (const cut of ['whole', 'left']) {
            const height = yield* run(px, factor, cut);
            expect(height?.pass).toBe(false);
            expect(Number(height?.value)).toBeGreaterThan(0.02);
          }
        const steady = yield* run(300, 1, 'left');
        expect(steady?.pass).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    900_000,
  );

  it.effect(
    'fails the real milk-row lead on a layer blurred 3 px shrinking 3 %, whole and cut by the left edge, and growing 3 %, while the camera pushes from zoom 0.856 to 1.512, and fails it unblurred shrinking 3 %; passes it blurred and held steady, whole and cut (verifier round 2, M1: passed at 0.017 and 0.0167 at 1683e0c07)',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const run = (blur: number, factor: number, cut: string) =>
          Effect.gen(function* () {
            const out = `${tmp}/${blur}-${factor}-${cut}`;
            const code = yield* spawner.exitCode(
              ChildProcess.make('bun', ['--preload', GROWTH, BLURRED], {
                env: {
                  HEIGHT_BLUR: String(blur),
                  HEIGHT_BREATH_FACTOR: String(factor),
                  HEIGHT_BLUR_CUT: cut,
                  HEIGHT_BLUR_OUT: out,
                },
                extendEnv: true,
                forceKillAfter: '5 seconds',
              }),
            );
            expect(Number(code)).toBe(0);
            const height = yield* heightCheck(yield* fs.readFileString(`${out}/verdict.json`));
            return { at: `blur ${blur} × ${factor} ${cut}`, height };
          });
        const changed = yield* Effect.forEach(
          [
            [3, 0.97, 'whole'],
            [3, 0.97, 'left'],
            [3, 1.03, 'whole'],
            [0, 0.97, 'whole'],
          ] as const,
          ([blur, factor, cut]) => run(blur, factor, cut),
        );
        const steady = yield* Effect.forEach(['whole', 'left'], (cut) => run(3, 1, cut));
        expect(
          changed
            .filter((r) => r.height?.pass !== false || !(Number(r.height?.value) > 0.02))
            .map((r) => `${r.at}: ${r.height?.value}`),
        ).toEqual([]);
        expect(
          steady.filter((r) => r.height?.pass !== true).map((r) => `${r.at}: ${r.height?.value}`),
        ).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    900_000,
  );
});
