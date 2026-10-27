// The fit rows (`core/fit-rows.ts`) on lead-feast's real renders
// (`core/fixtures/fit/`: his kept turnaround's front and three-quarter left,
// and renders 40, 95 and 155 of them, copied from in-its-order's cast
// renders): each defect an art review measured fails its row, and the render
// it was fixed in passes it. The crops are PNGs, so they are decoded here,
// past core.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import { type FitRow, type FitSpec, fitPasses, fitRows } from '../core/fit-rows.ts';
import { decodePng } from './png.ts';

const crop = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(
      new URL(`../core/fixtures/fit/${name}.png`, import.meta.url).pathname,
    );
    return Result.getOrThrow(decodePng(bytes));
  }).pipe(Effect.provide(BunServices.layer));

/** `view`'s rows on render `n` against its kept crop, held to `spec`. */
const rowsOf = (view: string, n: number, spec: FitSpec = {}) =>
  Effect.gen(function* () {
    return fitRows(yield* crop(`${view}.concept`), yield* crop(`r${n}-${view}.render`), spec);
  });

/** lead-feast's colour classes, his sheet's samples and the papers that paint them (In Its Order's `FIT_CLASSES`), and his front's face label (`labels.ts`). */
const LABELLED: FitSpec = {
  classes: {
    cream: {
      sheet: ['#fde1bc', '#e3bea0', '#feecca', '#f7d8b2'],
      paper: [
        '#fde1bc',
        '#e8c3ad',
        '#fff0d8',
        '#fbe0bb',
        '#fbddb6',
        '#fde8c8',
        '#f1d2b0',
        '#e1bda0',
      ],
    },
    teal: {
      sheet: ['#4e7182', '#58859b', '#61898d', '#4e768b', '#3f5f73'],
      paper: ['#608989', '#435770', '#729c99', '#4f7a85', '#456079', '#4a6479', '#476c7b'],
    },
    skin: {
      sheet: ['#fdaf70', '#e58a62', '#f3996a', '#f8a062'],
      paper: [
        '#fdaf72',
        '#fec48e',
        '#f59d66',
        '#e8906a',
        '#f8a466',
        '#e58a62',
        '#e27f55',
        '#f2a06c',
      ],
    },
  },
  labels: { face: { classes: ['skin'] } },
};

const failing = (rows: ReadonlyArray<FitRow>, name: string) =>
  rows.filter((r) => r.name === name && !r.pass);

const headTurns = (rows: ReadonlyArray<FitRow>) =>
  rows.find((r) => r.name === 'outline.turns' && r.band === 'head');

describe('fit rows on lead-feast', () => {
  for (const view of ['turnaround-front', 'turnaround-threeQuarterLeft'])
    it.effect(
      `${view}: render 40's 4.5 px offset fails silhouette.edge, render 155 passes every row`,
      () =>
        Effect.gen(function* () {
          expect(failing(yield* rowsOf(view, 40), 'silhouette.edge').length).toBeGreaterThan(0);
          const r155 = yield* rowsOf(view, 155);
          expect(r155.filter((r) => !r.pass)).toEqual([]);
          expect(fitPasses(r155)).toBe(true);
        }),
    );

  it.effect(
    "render 40's offset fails the front's face by its part rows, render 155's face passes them",
    () =>
      Effect.gen(function* () {
        const face = (rows: ReadonlyArray<FitRow>) =>
          rows.filter((r) => r.part === 'face').map((r) => `${r.name} ${r.pass}`);
        expect(face(yield* rowsOf('turnaround-front', 40, LABELLED))).toEqual([
          'part.iou false',
          'part.edge false',
        ]);
        expect(face(yield* rowsOf('turnaround-front', 155, LABELLED))).toEqual([
          'part.iou true',
          'part.edge true',
        ]);
      }),
  );

  it.effect(
    "render 95's kink in the front's head fails outline.turns there, render 155's head passes",
    () =>
      Effect.gen(function* () {
        const r95 = headTurns(yield* rowsOf('turnaround-front', 95));
        expect(r95?.pass).toBe(false);
        expect(r95?.where).toMatch(/^right row/);
        expect(headTurns(yield* rowsOf('turnaround-front', 155))?.pass).toBe(true);
      }),
  );
});
