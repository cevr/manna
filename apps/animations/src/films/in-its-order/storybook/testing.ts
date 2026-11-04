import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { filmCast, filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import type { SheetDecl } from '../../../library/storybook/scene.ts';
import { anchorOf, faceBoxOf, paintsOf } from '../../../library/storybook/sheet.ts';
import { frameAt, type Plate, type Shot } from '../../../library/storybook/shot.ts';
import {
  cellsMisses,
  drawnCellOf,
  headsOf,
  loadFigures,
  sharesOf,
  type StoredFigure,
} from '../../../library/storybook/store.ts';
import { type Coverage, coversOf, picturesOver } from '../../../library/storybook/verify/covers.ts';
import { SHEET_CELLS } from './cells.ts';
import { inItsOrder } from './index.ts';

/** The coverage of a picture of one opaque pixel: a probe plate's. */
const OPAQUE: Coverage = { width: 1, height: 1, sums: new Int32Array([0, 0, 0, 1]) };

/**
 * Whether `coversOf` faults a still 2×2 opaque plate laid inside each
 * figure's lower face at the shot's first frame, by figure name: the plate
 * placed where the page paints that face (`frameAt` with the figures' head
 * shares), on the figure's own layer after it; none for a figure whose face
 * reads none.
 */
const lowerFaceProbes = (shot: Shot, figures: ReadonlyArray<StoredFigure>) => {
  const frame = frameAt(shot, headsOf(figures), 0, sharesOf(figures));
  return figures.flatMap((stored) => {
    const f = frame.figures.find((g) => g.name === stored.figure.name);
    if (!f) return [];
    const placed = Option.all([
      Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))),
      Option.flatMap(drawnCellOf(stored, f.cell), (cell) => faceBoxOf(cell, stored.paints)),
    ]);
    return Option.toArray(
      Option.map(placed, ([lines, face]) => {
        const { ax, ay } = anchorOf(lines);
        const x = f.x + (face.x + face.width / 2 - ax) * f.scale * f.sx;
        const y = f.y + (face.y + face.height * 0.75 - ay) * f.scale * f.sy * f.breath;
        const plate: Plate = {
          _tag: 'Plate',
          file: 'probe',
          testArt: true,
          place: { x: x - 1, y: y - 1, width: 2, height: 2 },
        };
        const layer = { ...stored.layer, items: [stored.figure, plate] };
        const probe: Shot = { ...shot, from: 0, duration: 1 / shot.fps, layers: [layer] };
        const faulted = coversOf(probe, [{ ...stored, layer }], new Map([['probe', OPAQUE]]));
        return [stored.figure.name, faulted.faults.length > 0] as const;
      }),
    );
  });
};

/** What covers a face in each named shot of the film, by shot id (`coversOf`: its first five faults, then its moving plates' INFO lines, then whether a still plate laid inside each figure's lower face is faulted, `lowerFaceProbes`): each shot's figures as stored, and every plate drawn over one. */
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
            const covers = coversOf(shot, figures, pictures);
            return [
              shot.id,
              covers.faults.slice(0, 5),
              covers.moving,
              lowerFaceProbes(shot, figures),
            ] as const;
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
