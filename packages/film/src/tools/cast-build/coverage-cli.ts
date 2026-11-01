// `film concept coverage <film> (<member> | --cast) [--measure] [--json]`:
// what each cast member's coverage manifest (`<member>/cutout/coverage.ts`)
// still lacks. A member is one with a `cutout/` folder in the film's cast or
// the library's (the film's own first, as `castFolder` reads him). It exits
// non-zero when any member reported is incomplete or has no manifest.
// `--measure` first runs the free stages whose results the facts read: each
// cut puppet's `concept parts --check` and the member's fit rows
// (`concept render --figure cutout --fit-only`); without it they are
// reported `unmeasured`.

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
import { castFolder } from '../cast-library.ts';
import { renderCast } from '../cast-render.ts';
import { Counsel } from '../counsel.ts';
import { Critic } from '../critique.ts';
import { FilmFolder, type FilmName, filmNamed, importFilmModule } from '../film-repo.ts';
import type { Pages } from '../pages.ts';
import { parts } from '../part-sheet-cli.ts';
import { Coverage, CutKind, Requirement, coverageOf } from './coverage.ts';
import { type Measured, coverageFacts, sheetOf, viewOfId } from './coverage-facts.ts';

/** A member reported: his manifest's file (`null` in JSON when he has none), and what it lacks. */
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
    }),
  ),
});
interface MemberReport extends Schema.Schema.Type<typeof MemberReport> {}

/** One member's report as `--json` prints it. */
const MemberJson = Schema.fromJsonString(MemberReport);
/** The cast's reports as `--cast --json` prints them. */
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

/** Every member of `film`'s cast with a `cutout/` folder: the film's own, then the library's. */
const cutoutMembers = Effect.fn('film.cast.cutoutMembers')(function* (film: FilmName) {
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

/** The member's manifest, decoded, or none when his folder has no `cutout/coverage.ts`. */
const manifestOf = Effect.fn('film.cast.manifest')(function* (memberDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(memberDir, 'cutout', 'coverage.ts');
  if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) return Option.none();
  const loaded = yield* Effect.tryPromise(() => importFilmModule(file));
  const coverage = yield* Schema.decodeUnknownEffect(CoverageModule)(loaded);
  return Option.some({ file, coverage: coverage.COVERAGE });
});

const CoverageModule = Schema.Struct({ COVERAGE: Coverage });

/** Stage output written to stderr, so `--json` keeps stdout to its report. */
const toStderr = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
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

/** The free stages' results: each cut puppet's parts check, and the member's fit rows over his puppet views. */
const measure = Effect.fn('film.cast.measure')(function* (
  film: FilmName,
  member: string,
  memberDir: string,
  coverage: Coverage,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const puppets = coverage.entries.filter((e) => e.cut === 'puppet');
  const checked = new Map<string, boolean>();
  for (const entry of puppets) {
    const sheet = sheetOf(entry);
    const id = entry.fitted ?? entry.id;
    if (checked.has(id)) continue;
    const record = path.join(memberDir, 'cutout', 'sheets', sheet, 'record.json');
    if (!(yield* fs.exists(record).pipe(Effect.orElseSucceed(() => false)))) continue;
    const ok = yield* Command.runWith(parts, { version: 'coverage' })([
      film,
      member,
      '--view',
      id,
      '--check',
    ]).pipe(
      toStderr,
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    checked.set(id, ok);
  }
  const views = puppets.map((e) => e.id).filter((id) => Option.isSome(viewOfId(id)));
  const fits = yield* Effect.scoped(
    renderCast(film, member, {
      kinds: [],
      views,
      critique: false,
      fitOnly: true,
      figure: 'cutout',
    }),
  ).pipe(
    toStderr,
    Effect.map(
      (made) =>
        new Map(
          made.render.views.map((v) => [
            `${v.kind}-${v.view}`,
            (v.fit ?? []).length > 0 && (v.fit ?? []).every((r) => r.pass),
          ]),
        ),
    ),
    Effect.orElseSucceed(() => new Map<string, boolean>()),
  );
  const measured: Record<string, Measured> = {};
  for (const entry of puppets) {
    measured[entry.id] = {
      cut: Option.fromNullishOr(checked.get(entry.fitted ?? entry.id)),
      fit: Option.fromNullishOr(fits.get(entry.id)),
    };
  }
  return measured;
});

/** One member's report: his manifest's facts, measured first when asked. */
const reportOf = Effect.fn('film.cast.coverageReport')(function* (
  film: FilmName,
  member: string,
  measured: boolean,
) {
  const path = yield* Path.Path;
  const memberDir = path.dirname(yield* castFolder(film, member));
  const manifest = yield* manifestOf(memberDir);
  return yield* Option.match(manifest, {
    onNone: () =>
      Effect.succeed<MemberReport>({
        member,
        manifest: Option.none(),
        complete: false,
        entries: [],
      }),
    onSome: ({ file, coverage }) =>
      Effect.gen(function* () {
        const results = yield* Effect.when(
          measure(film, member, memberDir, coverage),
          Effect.succeed(measured),
        );
        const facts = yield* coverageFacts(
          memberDir,
          coverage,
          Option.getOrElse(results, () => ({})),
        );
        return {
          ...coverageOf(coverage, facts),
          member,
          manifest: Option.some(path.relative(memberDir, file)),
        };
      }),
  });
});

/** An entry's line: its id, its cut, what it lacks and what of that is unmeasured. */
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
  ].join(' ');

/** A report's lines: the member, then each entry and what it lacks. */
const linesOf = (r: MemberReport): ReadonlyArray<string> =>
  Option.match(r.manifest, {
    onNone: () => [`coverage ${r.member} no manifest (cutout/coverage.ts)`],
    onSome: () => [
      `coverage ${r.member} ${Match.value(r.complete).pipe(
        Match.when(true, () => 'complete'),
        Match.orElse(() => 'incomplete'),
      )} entries=${r.entries.length}`,
      ...r.entries.map(entryLine),
    ],
  });

export const coverage = <E, R>(
  pages: Layer.Layer<Pages, E, R>,
  rules: ReadonlyArray<CritiqueRule>,
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
        reportOf(film, m, input.measure),
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
      "What each cast member's coverage manifest (cutout/coverage.ts) still lacks: each drawing the pipeline needs, a puppet view (drawn, kept, cut, its bars and fit rows passed) or a drawn key (drawn, kept); exits non-zero when one is incomplete",
    ),
  );
