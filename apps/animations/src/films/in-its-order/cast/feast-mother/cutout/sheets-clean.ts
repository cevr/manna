// Clears the paper rim of the feast mother's drawings beside her part sheets
// (`DRAWINGS`, her shut eyes): kept drawings of a part, not cut from a view,
// so `film concept parts` does not make them and her cut table's clean rule
// (`cut.ts`, `CLEAN`) never sees them. Each is laid in its part's place among
// the view's parts as `concept parts` writes them, front to back, and the
// paper rim of that figure (`library/cutout/clean.ts`, `paperRimOf`, with the
// view's `PAPER_RIMS`) is cleared from it. The build does not run it: a
// drawing is a kept input, cleaned once when it is kept, by hand from the
// repo root with
// `bun apps/animations/src/films/in-its-order/cast/feast-mother/cutout/sheets-clean.ts`.
// Clearing is idempotent, so a kept drawing is the step's own answer: the
// cast reproduce test (`library/cutout/reproduce.slow.test.ts`) holds that
// the step clears nothing from each committed drawing.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, decodePng, encodePng } from '@manna/film/tools';
import { Console, Effect, FileSystem, Schema } from 'effect';
import { clearedBy, paperRimOf } from '../../../../../library/cutout/clean.ts';
import { PAPER_RIMS } from './cut.ts';

const here = import.meta.dir;

/** Drawings of a part kept beside a view's parts, each laid in its part's place. */
export const DRAWINGS = [{ view: 'poses-1', file: 'head-closed', part: 'head' }] as const;

/** A drawing of `DRAWINGS`. */
type Drawing = (typeof DRAWINGS)[number];

/** The part sheet's record as kept: its parts front to back, by name. */
const RecordJson = Schema.fromJsonString(
  Schema.Struct({ parts: Schema.Array(Schema.Struct({ name: Schema.String })) }),
);

/** How many pixels of `before` the clear left with alpha above 0 that it cleared. */
const clearedCount = (before: Uint8Array, after: Uint8Array): number => {
  let count = 0;
  for (let i = 3; i < before.length; i += 4)
    if ((before[i] ?? 0) > 0 && (after[i] ?? 0) === 0) count++;
  return count;
};

/** `drawing` as its view's committed parts clear it, and how many of its pixels that clears. */
export const drawingCleaned = (drawing: Drawing) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = `${here}/sheets/${drawing.view}`;
    const record = yield* Schema.decodeEffect(RecordJson)(
      yield* fs.readFileString(`${dir}/record.json`),
    );
    const read = (name: string) =>
      Effect.flatMap(fs.readFile(`${dir}/${name}.png`), (b) => Effect.fromResult(decodePng(b)));
    const names = record.parts.map((p) => p.name);
    const key = yield* read(drawing.file);
    const laid = yield* Effect.forEach(names, (name) =>
      Effect.suspend(() => {
        if (name === drawing.part) return Effect.succeed(key);
        return read(name);
      }),
    );
    const rgba = clearedBy(key.rgba, paperRimOf(laid, PAPER_RIMS[drawing.view]));
    const raster: Raster = { width: key.width, height: key.height, rgba };
    return { raster, count: clearedCount(key.rgba, rgba) };
  });

const clean = Effect.forEach(DRAWINGS, (drawing) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const out = yield* drawingCleaned(drawing);
    if (out.count > 0)
      yield* fs.writeFile(
        `${here}/sheets/${drawing.view}/${drawing.file}.png`,
        encodePng(out.raster),
      );
    yield* Console.log(`  ${drawing.view}/${drawing.file}.png: cleared ${out.count} px`);
  }),
);

if (import.meta.main) clean.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
