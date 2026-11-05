import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { decodePng, encodePng, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Option, Result, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';
import type { PaintFigure, PaintRequest, PaintScene } from '../painter.ts';
import { dataUrlOf, storybookPage, StorybookFailed } from '../render.ts';
import { alphaAt, type Box, paintsOf, type Palette } from '../sheet.ts';
import { figuresOf, hold, type Shot } from '../shot.ts';
import { feastCourtyard } from '../shots/feast-courtyard.ts';
import { planeOf } from './covers.ts';
import { type FrameRead, heightSamples, observeHeight, readFigure } from './measures.ts';
import { analysisBoxOf } from './rows.ts';
import { verifyShot } from './run.ts';

const CLI = `${import.meta.dir}/../cli.ts`;
const GROWTH = `${import.meta.dir}/height-growth.preload.ts`;

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

/** A figure of the receipts' cell, named `name`. */
const figureOf = (name: string): PaintFigure => ({
  _tag: 'Figure',
  name,
  palette: PALETTE,
  share: 1,
  cells: { a: { image: dataUrlOf(encodePng(CELL)), size: [62, 202], ...ANCHOR } },
  worn: [],
  blinks: [],
  dress: [],
});

const decoded = (png: Uint8Array) =>
  Effect.fromResult(decodePng(png)).pipe(
    Effect.mapError((e) => StorybookFailed.make({ reason: e.message })),
  );

/** One figure alone in a frame of `scene`: over the frame, and over its analysis surface at `z` with `blur`. */
const both = (
  render: (req: PaintRequest, box?: Box) => Effect.Effect<Uint8Array, StorybookFailed>,
  scene: PaintScene,
  req: PaintRequest,
  z: number,
  blur: number,
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
    const box = analysisBoxOf(place, { width: 62, height: 202, ...ANCHOR }, blur);
    return {
      box,
      frame: yield* decoded(yield* render(req)),
      analysis: yield* decoded(yield* render(req, box)),
    };
  });

/** The bytes of the frame render and the analysis render that differ where they overlap, more than `inset` px inside the frame's edges (a blur reads past the frame there). */
const differing = (frame: Raster, analysis: Raster, box: Box, inset: number): number => {
  let n = 0;
  for (let y = Math.max(inset, box.y); y < Math.min(frame.height - inset, box.y + box.height); y++)
    for (
      let x = Math.max(inset, box.x);
      x < Math.min(frame.width - inset, box.x + box.width);
      x++
    ) {
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

describe('render-height in Chrome: the analysis surface', () => {
  it.effect(
    'reads a whole render stretched 4 % (200 → 208 px half covered; 210 to its faint fringe) as growth, with a steady side-cut frame added and with the growth cut at the top, and a steady whole and side-cut key as steady (round 3 receipts, height-live)',
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
              height: observeHeight(r.analysis, PAINTS),
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
          [whole, grown, sideCut, topCutGrown].map((r) => Result.getOrElse(r.height, () => -1)),
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
    'paints every pixel the frame paints, byte for byte, through a pushed camera, a far blurred plane, a draw scale, breath and subpixel places, and paints the figure past the frame whole',
    () =>
      Effect.gen(function* () {
        const scene: PaintScene = {
          width: 320,
          height: 240,
          paper: '#fdf7e5',
          light: NO_LIGHT,
          layers: [
            { name: 'far', z: 2, blur: 1.5, items: [figureOf('g')] },
            { name: 'near', z: 1, blur: 0, items: [figureOf('f')] },
          ],
        };
        const render = yield* storybookPage(scene);
        const camera = { x: 170.3, y: 110.7, zoom: 1.37 };
        const figures = [
          { name: 'f', cell: 'a', x: 60.37, y: 230.81, sx: 1, sy: 1.003, scale: 0.83 },
          { name: 'g', cell: 'a', x: 290.6, y: 140.2, sx: 1, sy: 1, scale: 0.9 },
        ];
        const cases = [
          { only: 'f', z: 1, blur: 0 },
          { only: 'g', z: 2, blur: 1.5 },
        ];
        for (const c of cases) {
          const r = yield* both(
            render,
            scene,
            { t: 0, camera, figures, only: c.only },
            c.z,
            c.blur,
          );
          expect(readFigure(r.frame, PAINTS).whole).toBe(false);
          expect(Result.isSuccess(observeHeight(r.analysis, PAINTS))).toBe(true);
          expect(drawn(r.analysis)).toBeGreaterThan(drawn(r.frame));
          expect(differing(r.frame, r.analysis, r.box, Math.ceil(3 * c.blur))).toBe(0);
        }
      }).pipe(Effect.scoped),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the case launches headless Chrome once and renders eight frames (spawn budget).
    120_000,
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
});
