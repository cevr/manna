import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer } from 'effect';
import { filmCast, filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import type { SheetDecl } from '../../../library/storybook/scene.ts';
import { paintsOf } from '../../../library/storybook/sheet.ts';
import { cellsMisses, loadFigures } from '../../../library/storybook/store.ts';
import { type Coverage, coversOf, picturesOver } from '../../../library/storybook/verify/covers.ts';
import { SHEET_CELLS } from './cells.ts';
import { inItsOrder } from './index.ts';

/** What covers a face in each named shot of the film, by shot id (`coversOf`, its first five lines): each shot's figures as stored, and every plate drawn over one. */
export const faceCovers = (ids: ReadonlyArray<string>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const cast = yield* filmCast(inItsOrder);
      const placed = yield* shotsOf(inItsOrder);
      const read = new Map<string, Coverage>();
      return yield* Effect.forEach(
        placed.filter(({ shot }) => ids.includes(shot.id)),
        ({ shot }) =>
          Effect.gen(function* () {
            const figures = yield* loadFigures(cast, shot);
            const pictures = yield* picturesOver(shot, read);
            return [shot.id, coversOf(shot, figures, pictures).slice(0, 5)] as const;
          }),
      );
    }).pipe(Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer])),
  );

/** Where a sheet lies: the film's own roles first, then the library's (`castFolder`'s order). */
const dirOf = Effect.fn('Act1Testing.dirOf')(function* (member: string, id: string) {
  const fs = yield* FileSystem.FileSystem;
  const own = `${import.meta.dir}/../cast/${member}/shot-sheets/${id}`;
  const library = `${import.meta.dir}/../../../library/cast/${member}/shot-sheets/${id}`;
  return [library, own][Number(yield* fs.exists(own))] ?? own;
});

/** Every way the declared sheets' cells modules differ from their declarations and records: a sheet with no cells, keys out of the declared order, and each `cellsMisses`. */
export const sheetsMisses = Effect.fn('Act1Testing.sheetsMisses')(function* (
  decls: ReadonlyArray<SheetDecl>,
) {
  const misses = yield* Effect.forEach(decls, (decl) =>
    Effect.gen(function* () {
      const name = `${decl.member}/${decl.id}`;
      const sheet = SHEET_CELLS.get(name);
      if (!sheet) return [`${name} has no cells`];
      const keys = Object.keys(sheet.cells).join();
      return [
        ...[`${name} declares ${decl.keys.join()}, draws ${keys}`].filter(
          () => decl.keys.join() !== keys,
        ),
        ...(yield* cellsMisses(
          yield* dirOf(decl.member, decl.id),
          paintsOf(sheet.palette),
          sheet.cells,
        )),
      ];
    }),
  );
  return misses.flat();
});
