import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Option, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import {
  blinkOf,
  changedOutsideBand,
  eyeBandOf,
  paintsOf,
} from '../../../library/storybook/sheet.ts';
import { figuresOf } from '../../../library/storybook/shot.ts';
import { SHEET_CELLS } from './cells.ts';
import { inItsOrder } from './index.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const placed = await Effect.runPromise(
  shotsOf(inItsOrder).pipe(
    Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
  ),
);

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

/** A cell of a declared sheet with its pixels, its anchor and its sheet's paints. */
const cellOf = (sheet: string, key: string) =>
  Effect.gen(function* () {
    const s = SHEET_CELLS.get(sheet);
    const c = s?.cells[key];
    if (!s || !c) return yield* Effect.die(`${sheet} has no cell ${key}`);
    return {
      raster: yield* rasterOf(c.png),
      at: [c.ax, c.ay] as const,
      paints: paintsOf(s.palette),
    };
  });

/** Every blink the film's holds show, `[sheet, cell, blink]`, each once. */
const blinks = [
  ...new Map(
    placed.flatMap(({ shot }) =>
      figuresOf(shot).flatMap(({ figure: f }) =>
        f.spans.flatMap((s) => {
          if (s._tag !== 'Hold' || !s.blink || s.blink === s.cell) return [];
          const sheet = `${f.member}/${f.sheet}`;
          return [[`${sheet} ${s.cell}~${s.blink}`, [sheet, s.cell, s.blink] as const] as const];
        }),
      ),
    ),
  ).values(),
];

describe("In Its Order's storybook blinks keep the body (round 3, M1)", () => {
  it.effect(
    'changes no pixel outside the eye band in any blink a hold of the film shows, each blink built as the store builds it and set on its open cell’s anchor',
    () =>
      Effect.gen(function* () {
        const moved = yield* Effect.forEach(
          blinks,
          ([sheet, cell, blink]) =>
            Effect.gen(function* () {
              const open = yield* cellOf(sheet, cell);
              const shut = yield* cellOf(sheet, blink);
              const band = eyeBandOf(open.raster, shut.raster, open.paints);
              const built = blinkOf(open.raster, shut.raster, open.paints);
              if (Option.isNone(band) || Result.isFailure(built))
                return [`${sheet} ${cell}~${blink}: no blink`];
              const n = changedOutsideBand(
                open.raster,
                open.at,
                built.success,
                open.at,
                band.value,
              );
              return [`${sheet} ${cell}~${blink}: ${n} px outside the eye band`].filter(
                () => n > 0,
              );
            }),
          { concurrency: 8 },
        );
        expect(blinks.length).toBeGreaterThan(10);
        expect(moved.flat()).toEqual([]);
      }),
  );

  it.effect(
    'counts the whole-drawing blink round 2 showed (the lead’s `downBlink` cell in place of `down`, verifier r2 M1) as a body that moves: 4,243 painted px outside the eye band, 3,100 of them in his lowest 350 rows (the verifier’s 23,285 there count clear px whose hidden colour differs too)',
    () =>
      Effect.gen(function* () {
        const down = yield* cellOf('lead-feast/iio-table', 'down');
        const shut = yield* cellOf('lead-feast/iio-table', 'downBlink');
        const band = Option.getOrThrow(eyeBandOf(down.raster, shut.raster, down.paints));
        const lowest = { top: 0, bottom: down.at[1] - 351 };
        expect([
          changedOutsideBand(down.raster, down.at, shut.raster, shut.at, band),
          changedOutsideBand(down.raster, down.at, shut.raster, shut.at, lowest),
        ]).toEqual([4243, 3100]);
      }),
  );
});
