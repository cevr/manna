import { Array as Arr, Effect, FileSystem, Option, Path } from 'effect';
import { PagesBroken } from '../core/easel.ts';
import { importFilmModule } from './film-repo.ts';
import { bunModule } from './lab-page.ts';

export const wedgedModule = Effect.fn('wedge.module')(function* (
  file: string,
  swaps: ReadonlyMap<string, string>,
) {
  const broken = (reason: string) => PagesBroken.make({ reason });
  if (swaps.size === 0)
    return yield* Effect.tryPromise({
      try: (): Promise<unknown> => importFilmModule(file),
      catch: (cause) => broken(String(cause)),
    });
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const into = yield* fs
    .makeTempDirectoryScoped({ prefix: 'film-wedge-' })
    .pipe(Effect.mapError((error) => broken(error.message)));
  const outputs = yield* bunModule(path, file, swaps, into).pipe(
    Effect.mapError((failed) => broken(failed.reason)),
  );
  yield* Effect.forEach(outputs, (out) => fs.writeFile(path.join(into, out.path), out.bytes)).pipe(
    Effect.mapError((error) => broken(error.message)),
  );
  const entry = Arr.findFirst(outputs, (out) => out.path.endsWith('.js'));
  if (Option.isNone(entry)) return yield* broken(`the build of ${file} made no module`);
  yield* Effect.log(
    `check.wedge.built module=${path.basename(file)} into=${into} swaps=${[...swaps.keys()].map((f) => path.basename(f)).join(',')}`,
  );
  return yield* Effect.tryPromise({
    try: (): Promise<unknown> => importFilmModule(path.join(into, entry.value.path)),
    catch: (cause) => broken(String(cause)),
  });
});
