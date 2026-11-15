import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { describe, expect, it } from 'effect-bun-test';

import { linkExactModules, writeGenerated } from './prepare.ts';

/** Module names a case draws from. */
const NAMES = ['speech-synthesis', 'speech-recognition', 'media-capture', 'audio'] as const;

/** What sits at a module's place before the run, and whether the clone has the module. */
const Place = Schema.Struct({
  at: Schema.Literals(['absent', 'right link', 'wrong link', 'folder', 'file']),
  cloned: Schema.Boolean,
});
type Place = typeof Place.Type;

const LinkCase = Arbitrary.all({
  places: Arbitrary.all({
    'speech-synthesis': Arbitrary.schema(Place),
    'speech-recognition': Arbitrary.schema(Place),
    'media-capture': Arbitrary.schema(Place),
    audio: Arbitrary.schema(Place),
  }),
  count: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))),
});

/** What a module's place holds: absent, a link and its target, a folder or a file. */
const placeOf = (at: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const link = yield* Effect.option(fs.readLink(at));
    if (Option.isSome(link)) return `link ${link.value}`;
    const info = yield* Effect.option(fs.stat(at));
    return Option.match(info, { onNone: () => 'absent', onSome: (i) => i.type });
  });

/** A scratch app and clone laid out as `places` say, in a fresh folder under `scratch`. */
const layOut = (scratch: string, run: number, places: Readonly<Record<string, Place>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.join(scratch, String(run));
    const app = path.join(root, 'app');
    const clone = path.join(root, 'clone');
    const elsewhere = path.join(root, 'elsewhere');
    yield* fs.makeDirectory(elsewhere, { recursive: true });
    yield* fs.makeDirectory(path.join(app, 'node_modules', '@exact'), { recursive: true });
    for (const [name, place] of Object.entries(places)) {
      const target = path.join(clone, 'packages', name);
      const at = path.join(app, 'node_modules', '@exact', name);
      if (place.cloned) yield* fs.makeDirectory(target, { recursive: true });
      if (place.at === 'right link') yield* fs.symlink(target, at);
      if (place.at === 'wrong link') yield* fs.symlink(elsewhere, at);
      if (place.at === 'folder')
        yield* fs.makeDirectory(path.join(at, 'kept'), { recursive: true });
      if (place.at === 'file') yield* fs.writeFileString(at, 'kept');
    }
    return { app, clone, at: (name: string) => path.join(app, 'node_modules', '@exact', name) };
  });

describe('prepare', () => {
  it.effect(
    "links each name to the clone's package, or names every problem and writes nothing",
    () =>
      Effect.gen(function* () {
        const scratch = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
        let runs = 0;
        const result = yield* Arbitrary.checkEffect(
          LinkCase,
          ({ places, count }) =>
            Effect.scoped(
              Effect.gen(function* () {
                const path = yield* Path.Path;
                const names = NAMES.slice(0, count);
                runs += 1;
                const { app, clone, at } = yield* layOut(scratch, runs, places);
                const before = yield* Effect.forEach(names, (name) => placeOf(at(name)));
                const problems = linkExactModules(app, names, clone);
                const after = yield* Effect.forEach(names, (name) => placeOf(at(name)));
                const blocked = names.filter(
                  (name) => !places[name].cloned || ['folder', 'file'].includes(places[name].at),
                );
                if (blocked.length > 0)
                  return (
                    problems.length === blocked.length &&
                    blocked.every((name) => problems.some((p) => p.includes(name))) &&
                    Bun.deepEquals(after, before)
                  );
                const again = linkExactModules(app, names, clone);
                return (
                  problems.length === 0 &&
                  again.length === 0 &&
                  after.every(
                    (place, i) => place === `link ${path.join(clone, 'packages', names[i] ?? '')}`,
                  )
                );
              }),
            ),
          { runs: 60 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('writes a generated module only when it changed, keeping its time when equal', () =>
    Effect.gen(function* () {
      const scratch = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
      let runs = 0;
      const result = yield* Arbitrary.checkEffect(
        Arbitrary.all({
          held: Arbitrary.schema(Schema.Union([Schema.Literal('absent'), Schema.String])),
          source: Arbitrary.schema(Schema.String),
          same: Arbitrary.schema(Schema.Boolean),
        }),
        ({ held, source: drawn, same }) =>
          Effect.scoped(
            Effect.gen(function* () {
              const source = drawn.toWellFormed();
              const fs = yield* FileSystem.FileSystem;
              const path = yield* Path.Path;
              runs += 1;
              const file = path.join(scratch, `today-${runs}.ts`);
              const oldSeconds = 2_000_000_000;
              const before = Option.map(
                Option.liftPredicate(held.toWellFormed(), (text) => text !== 'absent'),
                (text) =>
                  Option.getOrElse(
                    Option.liftPredicate(source, () => same),
                    () => text,
                  ),
              );
              if (Option.isSome(before)) {
                yield* fs.writeFileString(file, before.value);
                yield* fs.utimes(file, oldSeconds, oldSeconds);
              }
              const wrote = writeGenerated(file, source);
              const text = yield* fs.readFileString(file);
              const mtime = (yield* fs.stat(file)).mtime;
              const unchanged = Option.exists(before, (b) => b === source);
              return (
                text === source &&
                wrote === !unchanged &&
                (!unchanged || Option.exists(mtime, (m) => m.getTime() === oldSeconds * 1000))
              );
            }),
          ),
        { runs: 60 },
      );
      expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
