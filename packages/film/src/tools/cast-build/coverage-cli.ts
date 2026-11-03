import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Schema,
} from 'effect';
import type { CritiqueRule } from '../../core/critique.ts';
import { PuppetImagesBun } from '../../puppet/images-bun.ts';
import { Counsel } from '../counsel.ts';
import { Critic } from '../critique.ts';
import { FilmFolder, type FilmName, filmNamed } from '../film-repo.ts';
import type { Pages } from '../pages.ts';
import { castCache, castRoot, measuredOf, memberOf } from './built.ts';
import { CutKind, Requirement, coverageOf } from './coverage.ts';
import { coverageFacts } from './coverage-facts.ts';
import { buildSources, memberStages } from './stages.ts';

const MemberReport = Schema.Struct({
  member: Schema.String,
  manifest: Schema.OptionFromNullOr(Schema.String),
  complete: Schema.Boolean,
  entries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      cut: CutKind,
      missing: Schema.Array(Requirement),
      unmeasured: Schema.Array(Requirement),
      trainable: Schema.Boolean,
    }),
  ),
});
interface MemberReport extends Schema.Schema.Type<typeof MemberReport> {}

const MemberJson = Schema.fromJsonString(MemberReport);
const CastJson = Schema.fromJsonString(Schema.Struct({ members: Schema.Array(MemberReport) }));

class CoverageIncomplete extends Schema.TaggedError<CoverageIncomplete>()('CoverageIncomplete', {
  members: Schema.Array(Schema.String),
}) {
  override get message() {
    return `coverage incomplete: ${this.members.join(', ')}`;
  }
}

class CoverageAsked extends Schema.TaggedError<CoverageAsked>()('CoverageAsked', {}) {
  override get message() {
    return 'name one member, or --cast for every member with a cutout folder, not both';
  }
}

export const cutoutMembers = Effect.fn('film.cast.cutoutMembers')(function* (film: FilmName) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  const roots = [path.join(dir, 'cast'), path.join(dir, '..', '..', 'library', 'cast')];
  const found = new Set<string>();
  for (const root of roots) {
    const names = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => []));
    for (const name of names.toSorted())
      if (yield* fs.exists(path.join(root, name, 'cutout')).pipe(Effect.orElseSucceed(() => false)))
        found.add(name);
  }
  return [...found];
});

export const toStderr = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const current = yield* Console.Console;
    return yield* Effect.provideService(
      effect,
      Console.Console,
      Object.assign(Object.create(current), {
        log: (...args: ReadonlyArray<unknown>) => current.error(...args),
        info: (...args: ReadonlyArray<unknown>) => current.error(...args),
      }),
    );
  });

const reportOf = Effect.fn('film.cast.coverageReport')(function* (
  film: FilmName,
  member: string,
  run: boolean,
  renderPage: string,
) {
  const path = yield* Path.Path;
  const found = yield* memberOf(film, member);
  if (Option.isNone(found))
    return { member, manifest: Option.none(), complete: false, entries: [] } satisfies MemberReport;
  const { file, stages: m } = found.value;
  const cache = yield* castCache;
  const results = yield* toStderr(
    measuredOf(yield* memberStages(m, yield* buildSources(film, renderPage)), m.coverage, member, {
      root: castRoot,
      cache,
      run,
    }),
  );
  const facts = yield* coverageFacts(m.memberDir, m.coverage, results);
  return {
    ...coverageOf(m.coverage, facts),
    member,
    manifest: Option.some(path.relative(m.memberDir, file)),
  } satisfies MemberReport;
});

const entryLine = (e: MemberReport['entries'][number]): string =>
  [
    `  ${e.id} ${e.cut}`,
    ...Arr.match(e.missing, {
      onEmpty: () => ['complete'],
      onNonEmpty: (m) => [`missing=${m.join(',')}`],
    }),
    ...Arr.match(e.unmeasured, {
      onEmpty: () => [],
      onNonEmpty: (u) => [`unmeasured=${u.join(',')}`],
    }),
    ...Arr.filter(['trainable'], () => e.trainable),
  ].join(' ');

const linesOf = (r: MemberReport): ReadonlyArray<string> =>
  Option.match(r.manifest, {
    onNone: () => [`coverage ${r.member} no manifest (cutout/coverage.ts)`],
    onSome: () => [
      `coverage ${r.member} ${Match.value(r.complete).pipe(
        Match.when(true, () => 'complete'),
        Match.orElse(() => 'incomplete'),
      )} entries=${r.entries.length} trainable=${r.entries.filter((e) => e.trainable).length}`,
      ...r.entries.map(entryLine),
    ],
  });

export const coverage = <E, R>(
  pages: Layer.Layer<Pages, E, R>,
  rules: ReadonlyArray<CritiqueRule>,
  renderPage: string,
) =>
  Command.make(
    'coverage',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film whose cast holds them'),
      ),
      member: Argument.String('member').pipe(
        Argument.optional,
        Argument.withDescription('the cast member, by its id'),
      ),
      cast: Flag.Boolean('cast').pipe(
        Flag.withDefault(false),
        Flag.withDescription('every member of the film with a cutout folder'),
      ),
      measure: Flag.Boolean('measure').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "run the free stages first (each cut puppet's parts check, the fit rows), so cut and fit are measured",
        ),
      ),
      json: Flag.Boolean('json').pipe(Flag.withDefault(false), Flag.withDescription('print JSON')),
    },
    Effect.fn('film.concept.coverage')(function* (input) {
      const film = yield* filmNamed(input.film);
      if (Option.isSome(input.member) === input.cast) return yield* CoverageAsked.make({});
      const members = Option.match(input.member, {
        onSome: (m) => Effect.succeed([m]),
        onNone: () => cutoutMembers(film),
      });
      const reports = yield* Effect.forEach(yield* members, (m) =>
        reportOf(film, m, input.measure, renderPage),
      );
      if (!input.json) for (const line of reports.flatMap(linesOf)) yield* Console.log(line);
      else
        yield* Console.log(
          yield* Option.match(
            Option.fromNullishOr(reports[0]).pipe(Option.filter(() => !input.cast)),
            {
              onSome: (one) => Schema.encodeEffect(MemberJson)(one),
              onNone: () => Schema.encodeEffect(CastJson)({ members: reports }),
            },
          ),
        );
      const incomplete = reports.filter((r) => !r.complete).map((r) => r.member);
      if (incomplete.length > 0) return yield* CoverageIncomplete.make({ members: incomplete });
    }),
  ).pipe(
    Command.provide(
      Layer.mergeAll(
        pages,
        Critic.layer(rules).pipe(Layer.provide(Counsel.layer)),
        PuppetImagesBun,
      ),
    ),
    Command.withDescription(
      "What each cast member's coverage manifest (cutout/coverage.ts) still lacks: each drawing the pipeline needs, a puppet view (drawn, kept, cut, its bars and fit rows passed) or a drawn key (drawn, kept), and which puppet views the reader trains on (drawn, kept, cut, fit rows passed); exits non-zero when one is incomplete",
    ),
  );
