// A cast sheet kept (`film concept keep`), on the owner's answer: the try
// he chose copied into the member's folder as `kept/<kind>.png`, each view
// cut from it at 1:1 as `views/<name>.png` (the source a rig view is traced
// from and its match held to), cut on white as the measure reads the sheet
// (the trace and the match read colour, and a sheet painted with no paper is
// transparent round the figures; `kept/<kind>.png` keeps the try's bytes as
// drawn), and the keep recorded in `cast-sheet.json`
// with his why and the ask he answered. Both folders are committed beside the
// record: a lock's source survives a clean checkout. A kind already kept is
// refused (`SheetKept`): a kept sheet sets the member's look for every film
// that draws him, so it is never drawn again; a missing view is an addition.
// The owner's answer on an ask is the one authority that replaces it
// (`--replace --ask <id>`; `cast-sheet-filing.ts` sets the old keep aside in
// the member's history and files the new one). This module reads and
// measures the try and cuts its views.

import { Effect, FileSystem, Path, Result } from 'effect';
import { viewName } from '../core/cast-record.ts';
import { measureSheet } from '../core/cast-sheet.ts';
import { opaqueOf } from '../core/cast-sheet-pixels.ts';
import { cropRaster } from '../core/raster.ts';
import { type CastKeep, fileCastKeep } from './cast-sheet-filing.ts';
import { decodePng, encodePng } from './png.ts';

/** Keep try `keep.n` of the member's `keep.kind` sheet: its image and views into the folder, the keep into the record. */
export const keepCastSheet = Effect.fn('Cast.keep')(function* (
  place: { readonly folder: string; readonly out: string },
  keep: CastKeep,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fileCastKeep(place, keep, ({ tried, plan, refused }) =>
    Effect.gen(function* () {
      const bytes = yield* fs.readFile(path.join(place.out, tried.file));
      const sheet = yield* Effect.fromResult(decodePng(bytes));
      const opaque = opaqueOf(sheet);
      const m = yield* Effect.fromResult(
        Result.mapError(measureSheet(sheet, plan.options), (e) => refused(e.message)),
      );
      return {
        bytes,
        views: m.views.map((v) => ({
          view: v.view,
          name: viewName(keep.kind, v.view),
          box: v.box,
          png: encodePng(cropRaster(opaque, v.box)),
        })),
      };
    }),
  );
});
