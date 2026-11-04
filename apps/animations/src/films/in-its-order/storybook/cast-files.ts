import { decodePng } from '@manna/film/tools';
import { Effect, FileSystem, Option } from 'effect';

/** The film's own roles' folders, then the library's: where a member's `cast-sheet/` lies (`castFolder`'s order). */
const ROOTS = [`${import.meta.dir}/../cast`, `${import.meta.dir}/../../../library/cast`] as const;

/** A member's folder: the first root that holds its `cast-sheet/look.md`. */
export const folderOf = Effect.fn('Act1CastFiles.folderOf')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* Effect.findFirst(ROOTS, (root) =>
    fs.exists(`${root}/${member}/cast-sheet/look.md`),
  );
  return `${Option.getOrElse(found, () => ROOTS[0])}/${member}`;
});

/** A PNG of a member's folder, decoded. */
export const pngIn = Effect.fn('Act1CastFiles.pngIn')(function* (member: string, file: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.fromResult(
    decodePng(yield* fs.readFile(`${yield* folderOf(member)}/${file}`)),
  );
});
