// Every file a film's board sends as a cast member's library reference
// travels with the repository: a board run reads it in any checkout, so none
// may lie where `.gitignore` keeps it out (a fresh checkout's `film board`
// would refuse with `CastReferenceMissing`). The members are those the beats
// of every film's script name; each is found as the board finds it, the
// film's own role first, then the library's.

import { BunServices } from '@effect/platform-bun';
import { castLock, CastSheetJson } from '@bible/film/core';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Boolean as Bool, Effect, FileSystem, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { script as coldStudies } from './src/films/cold-studies/script.ts';
import { script as inItsOrder } from './src/films/in-its-order/script.ts';
import { script as righteousnessByFaith } from './src/films/righteousness-by-faith/script.ts';

/** Each film's script: every folder under `src/films` with a `script.ts`. */
const scripts = {
  'cold-studies': coldStudies,
  'in-its-order': inItsOrder,
  'righteousness-by-faith': righteousnessByFaith,
};

/** The files `member`'s library reference sends for `film`, as paths from this folder. */
const lockFiles = (film: string, member: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const own = `src/films/${film}/cast/${member}/cast-sheet`;
    const folder = Bool.match(yield* fs.exists(`${own}/cast-sheet.json`), {
      onTrue: () => own,
      onFalse: () => `src/library/cast/${member}/cast-sheet`,
    });
    const record = Schema.decodeUnknownSync(CastSheetJson)(
      yield* fs.readFileString(`${folder}/cast-sheet.json`),
    );
    return castLock(record, folder).files;
  });

/** Of `files`, those git ignores (a tracked file is never ignored). */
const ignored = (files: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', ['check-ignore', ...files], { forceKillAfter: '5 seconds' }),
      );
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      yield* handle.exitCode;
      return out.split('\n').filter((line) => line !== '');
    }),
  );

describe("the cast's library references", () => {
  it.effect('that a beat sends are never ignored by git, so every checkout has them', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const films = Arr.filter(yield* fs.readDirectory('src/films'), (name) => !name.includes('.'));
      const scripted = yield* Effect.filter(films, (film) =>
        fs.exists(`src/films/${film}/script.ts`),
      );
      expect(Object.keys(scripts).toSorted()).toEqual(scripted.toSorted());
      const files: Array<string> = [];
      for (const [film, script] of Object.entries(scripts)) {
        const beats: ReadonlyArray<{ readonly cast?: ReadonlyArray<string> }> = script;
        for (const member of Arr.dedupe(beats.flatMap((beat) => beat.cast ?? [])))
          files.push(...(yield* lockFiles(film, member)));
      }
      expect(files.length).toBeGreaterThan(0);
      expect(yield* ignored(files)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
