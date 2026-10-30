// Every file a film's board can send as a cast member's library reference
// travels with the repository: a board run reads it in any checkout, so none
// may be left untracked, as `.gitignore` would keep it (a fresh checkout's
// `film board` would refuse with `CastReferenceMissing`). A record that keeps
// a sheet sends its kept sheets or its own views of them (`kept/`, `views/`);
// a record that keeps none sends its own references (`castLock`). Every record
// is held, the library's and each film's own roles, whether a beat names the
// member yet or not.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, FileSystem, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** A kept sheet's views, by name. */
const KeptSheet = Schema.Struct({
  views: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
});

/**
 * What of a `cast-sheet.json` names the files it can send: each kind keeps one
 * sheet (`kept/<kind>.png`), or, for single drawings, a list of them, each
 * kept under its one view's name (`kept/<name>.png`).
 */
const SentBy = Schema.fromJsonString(
  Schema.Struct({
    refs: Schema.Array(Schema.Struct({ file: Schema.String })),
    kept: Schema.optional(
      Schema.Record(Schema.String, Schema.Union([KeptSheet, Schema.Array(KeptSheet)])),
    ),
  }),
);

/** The files one kind's kept entry names, relative to its folder. */
const keptFiles = (
  kind: string,
  kept: typeof KeptSheet.Type | ReadonlyArray<typeof KeptSheet.Type>,
): ReadonlyArray<string> => {
  const views = (sheet: typeof KeptSheet.Type) => (sheet.views ?? []).map((view) => view.name);
  if ('length' in kept)
    return kept.flatMap(views).flatMap((name) => [`kept/${name}.png`, `views/${name}.png`]);
  return [`kept/${kind}.png`, ...views(kept).map((name) => `views/${name}.png`)];
};

/** The files git reports for `args`, after git's own exit code is checked. */
const git = (args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', ['ls-files', ...args], { forceKillAfter: '5 seconds' }),
      );
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      expect(yield* handle.exitCode).toBe(0);
      return out.split('\n').filter((line) => line !== '');
    }),
  );

/** Whether `file` is on disk (a path under a file is not). */
const there = (file: string) =>
  FileSystem.FileSystem.use((fs) => fs.exists(file).pipe(Effect.orElseSucceed(() => false)));

/** Every cast-sheet folder: the library's members and each film's own roles. */
const sheetFolders = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const under = (root: string) =>
    Effect.map(fs.readDirectory(root), (names) =>
      names.map((name) => `${root}/${name}/cast-sheet`),
    );
  const films = yield* fs.readDirectory('src/films');
  const roots = ['src/library/cast', ...films.map((film) => `src/films/${film}/cast`)];
  const folders = (yield* Effect.forEach(yield* Effect.filter(roots, there), under)).flat();
  return yield* Effect.filter(folders, (folder) => there(`${folder}/cast-sheet.json`));
});

/**
 * The files `folder`'s record names, whether on disk or not: each kept sheet
 * (`kept/<kind>.png`) and each view it keeps (`views/<name>.png`), or its refs
 * when it keeps none. A lock sends some of them, whichever it sends.
 */
const named = (folder: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const record = Schema.decodeUnknownSync(SentBy)(
      yield* fs.readFileString(`${folder}/cast-sheet.json`),
    );
    const kept = Object.entries(record.kept ?? {});
    const files = Bool.match(kept.length === 0, {
      onTrue: () => record.refs.map((ref) => ref.file),
      onFalse: () => kept.flatMap(([kind, sheet]) => keptFiles(kind, sheet)),
    });
    return files.map((file) => `${folder}/${file}`);
  });

describe("the cast's library references", () => {
  it.effect('that a record names are tracked by git, so every checkout has them', () =>
    Effect.gen(function* () {
      const folders = yield* sheetFolders;
      expect(folders).toContain('src/library/cast/christ/cast-sheet');
      const files = (yield* Effect.forEach(folders, named)).flat();
      const tracked = new Set(yield* git(['--', ...files]));
      expect(files.filter((file) => !tracked.has(file))).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
