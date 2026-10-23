// Every file a film's board sends as a cast member's library reference
// travels with the repository: a board run reads it in any checkout, so none
// may be left untracked, as `.gitignore` would keep it (a fresh checkout's `film board`
// would refuse with `CastReferenceMissing`). The members are those the beats
// of every film's script name; each is found as the board finds it, the
// film's own role first, then the library's.

import { BunServices } from '@effect/platform-bun';
import { castReference, FilmFolder } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Stream } from 'effect';
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
  Effect.map(castReference(film, member), (lock) => lock.files).pipe(
    Effect.provide(FilmFolder.layer('src/films')),
  );

/** Of `files`, those git does not track, after git's own exit code is checked. */
const untracked = (files: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', ['ls-files', '--', ...files], { forceKillAfter: '5 seconds' }),
      );
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      expect(yield* handle.exitCode).toBe(0);
      const tracked = new Set(out.split('\n'));
      return files.filter((file) => !tracked.has(file));
    }),
  );

describe("the cast's library references", () => {
  it.effect('that a beat sends are tracked by git, so every checkout has them', () =>
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
      expect(yield* untracked(files)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
