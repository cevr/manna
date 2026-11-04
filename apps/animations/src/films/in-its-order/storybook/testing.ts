import { Effect, FileSystem } from 'effect';
import type { SheetDecl } from '../../../library/storybook/scene.ts';
import { paintsOf } from '../../../library/storybook/sheet.ts';
import { cellsMisses } from '../../../library/storybook/store.ts';
import { SHEET_CELLS } from './cells.ts';

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
