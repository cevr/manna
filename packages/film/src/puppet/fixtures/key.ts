// A beat's key as the renderer reads it (`tools/stamp.ts`), for a scene that
// draws a puppet: a fixture film (`sceneFixture`) whose `hand` scene imports
// a puppet module laid beside it by `lay` (its part PNGs among the files),
// keyed by the real `Stamps` with no checkout. A puppet's part PNG is in the
// beat's key when changing its bytes changes the key: what the puppet's slow
// test and the parity receipt run.

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer, Path, Result, Schema, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { layout } from '../../core/layout.ts';
import { ContentStore } from '../../tools/content-store.ts';
import { FilmRepo } from '../../tools/film-repo.ts';
import { scenesLocatedHere } from '../../tools/read-cli.ts';
import { sceneFixture } from '../../tools/scene-sources/testing.ts';
import { Stamps } from '../../tools/stamp.ts';

/** `git` as it answers outside a checkout: no commit, no process. */
const outsideACheckout = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(128)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    ),
  ),
);

/**
 * The `hand` beat's key in a fixture film whose `hand` scene imports
 * `module` (a path relative to the film's `scenes/` folder), after `lay`
 * has written the module and its files under the film's folder.
 */
export const handBeatKey = (
  module: string,
  lay: (film: string) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
      const film = path.join(films, 'f');
      yield* lay(film);
      const hand = path.join(film, 'scenes', 'hand.ts');
      const quoted = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(module);
      yield* fs.writeFileString(
        hand,
        `import * as PUPPET from ${quoted};\nexport const puppet = PUPPET;\n${yield* fs.readFileString(hand)}`,
      );
      const placed = Result.getOrThrow(
        layout(
          [
            { id: 'hand', min: 2 },
            { id: 'beta', min: 2 },
            { id: 'built', min: 2 },
            { id: 'plain', min: 2 },
          ],
          { voice: '', scenes: {} },
          30,
        ),
      );
      const stamps = Stamps.layer.pipe(
        Layer.provide(outsideACheckout),
        Layer.provideMerge(scenesLocatedHere),
        Layer.provide(FilmRepo.layer(films)),
        Layer.provide(ContentStore.layer),
      );
      const keys = yield* Effect.gen(function* () {
        const s = yield* Stamps;
        return yield* s.scenes(
          { paths: { name: 'f', dir: film }, timings: { voice: '', scenes: {} } },
          placed,
        );
        // oxlint-disable-next-line effect/noInlineProvide -- the fixture film's Stamps are made over the folder this call lays, so they are provided here
      }).pipe(Effect.provide(stamps));
      return keys.beats.get('hand') ?? '';
    }),
  ).pipe(Effect.provide(BunServices.layer));
