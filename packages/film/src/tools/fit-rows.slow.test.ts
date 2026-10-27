// The fit rows (`core/fit-rows.ts`) on lead-feast's real renders
// (`core/fixtures/fit/`: his kept turnaround's front and three-quarter left,
// and renders 40, 95 and 155 of them, copied from in-its-order's cast
// renders): each defect an art review measured fails its row, and the render
// it was fixed in passes it. The crops are PNGs, so they are decoded here,
// past core.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import { type FitRow, fitPasses, fitRows } from '../core/fit-rows.ts';
import { decodePng } from './png.ts';

const crop = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(
      new URL(`../core/fixtures/fit/${name}.png`, import.meta.url).pathname,
    );
    return Result.getOrThrow(decodePng(bytes));
  }).pipe(Effect.provide(BunServices.layer));

/** `view`'s rows on render `n` against its kept crop. */
const rowsOf = (view: string, n: number) =>
  Effect.gen(function* () {
    return fitRows(yield* crop(`${view}.concept`), yield* crop(`r${n}-${view}.render`));
  });

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
