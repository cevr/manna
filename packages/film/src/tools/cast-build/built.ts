import { Config, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { castFolder } from '../cast-library.ts';
import { FilmFolder, type FilmName, importFilmModule } from '../film-repo.ts';
import { Coverage } from './coverage.ts';
import { type Measured, coverageFacts } from './coverage-facts.ts';
import { type Stage, type StageReport, buildGraph, builtOutput } from './graph.ts';
import { type MemberStages, fitPasses } from './stages.ts';

export const castCache = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
  return yield* Config.String('FILM_CAST_CACHE').pipe(
    Config.withDefault(path.join(home, '.cache', 'bible-film', 'cast')),
  );
});

export const castRoot = new URL('../../../../../', import.meta.url).pathname;

const CoverageModule = Schema.Struct({ COVERAGE: Coverage });

export const manifestOf = Effect.fn('film.cast.manifest')(function* (memberDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(memberDir, 'cutout', 'coverage.ts');
  if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) return Option.none();
  const loaded = yield* Effect.tryPromise(() => importFilmModule(file));
  const coverage = yield* Schema.decodeUnknownEffect(CoverageModule)(loaded);
  return Option.some({ file, coverage: coverage.COVERAGE });
});

const libraryPuppetsOf = Effect.fn('film.cast.libraryPuppets')(function* (film: FilmName) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  return path.join(dir, '..', '..', 'library', 'cutout', 'puppets.ts');
});

export const readerLockOf = Effect.fn('film.cast.readerLock')(function* (film: FilmName) {
  const path = yield* Path.Path;
  return path.join(path.dirname(yield* libraryPuppetsOf(film)), 'reader.lock.json');
});

export const memberOf = Effect.fn('film.cast.member')(function* (film: FilmName, member: string) {
  const path = yield* Path.Path;
  const memberDir = path.dirname(yield* castFolder(film, member));
  const manifest = yield* manifestOf(memberDir);
  if (Option.isNone(manifest)) return Option.none();
  const { file, coverage } = manifest.value;
  const facts = yield* coverageFacts(memberDir, coverage, {});
  return Option.some({
    file,
    stages: { film, member, memberDir, coverage, facts } satisfies MemberStages,
  });
});

const FREE = ['drawing:', 'parts:', 'cut:', 'fit:'];

const answerOf = <E, R>(
  report: Option.Option<StageReport>,
  read: (key: string) => Effect.Effect<boolean, E, R>,
): Effect.Effect<Option.Option<boolean>, E, R> => {
  if (Option.isNone(report) || report.value.state === 'stale') return Effect.succeedNone;
  const { state, key } = report.value;
  if (state !== 'cached' && state !== 'ran') return Effect.succeedSome(false);
  return Option.match(key, {
    onNone: () => Effect.succeedNone,
    onSome: (k) => Effect.asSome(read(k)),
  });
};

export const measuredOf = Effect.fn('cast.build.measured')(function* <R>(
  stages: ReadonlyArray<Stage<R>>,
  coverage: Coverage,
  member: string,
  o: { readonly root: string; readonly cache: string; readonly run: boolean },
) {
  const free = stages.filter((s) => FREE.some((prefix) => s.id.startsWith(prefix)));
  const report = yield* buildGraph(free, {
    root: o.root,
    cache: o.cache,
    plan: !o.run,
    touch: [],
    spend: new Set(),
  });
  const byId = new Map(report.stages.map((s) => [s.id, s]));
  const reportOf = (id: string) => Option.fromUndefinedOr(byId.get(id));
  const measured: Record<string, Measured> = {};
  for (const entry of coverage.entries) {
    if (entry.cut !== 'puppet') continue;
    const cut = yield* answerOf(reportOf(`cut:${entry.fitted ?? entry.id}@${member}`), () =>
      Effect.succeed(true),
    );
    const fit = yield* answerOf(reportOf(`fit:${entry.id}@${member}`), (key) =>
      builtOutput(o.cache, key).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(false),
            onSome: fitPasses,
          }),
        ),
      ),
    );
    measured[entry.id] = { cut, fit };
  }
  return measured;
});
