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
