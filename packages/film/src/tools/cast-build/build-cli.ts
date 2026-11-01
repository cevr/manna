// `film concept build <film> (<member> | --cast) [--plan] [--touch <path> …]
// [--spend okra,modal] [--json]`: build each member's stages (`stages.ts`)
// over the cast cache (`graph.ts`), and print each stage's state, its wall
// time and its key. A stage spends only when `--spend` names what it spends;
// one that would spend otherwise waits (`waiting-spend`), and one that needs
// a drawing drawn or kept waits on the owner (`waiting-owner`), as does every
// stage below either. `--plan` runs nothing and prints what would run;
// `--touch` plans as if that file changed. The cache is `FILM_CAST_CACHE`,
// else `~/.cache/bible-film/cast`. It exits non-zero only when a stage fails.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Config, Console, Effect, Layer, Option, Path, Schema } from 'effect';
import type { CritiqueRule } from '../../core/critique.ts';
import { PuppetImagesBun } from '../../puppet/images-bun.ts';
import { castFolder } from '../cast-library.ts';
import { Counsel } from '../counsel.ts';
import { Critic } from '../critique.ts';
import { FilmFolder, filmNamed } from '../film-repo.ts';
import type { Pages } from '../pages.ts';
import { coverageFacts } from './coverage-facts.ts';
import { cutoutMembers, manifestOf, toStderr } from './coverage-cli.ts';
import { BuildReport, Spend, type StageReport, buildGraph } from './graph.ts';
import { CastReader } from './reader.ts';
import {
  type MemberStages,
  askStage,
  clipStages,
  evalStage,
  memberStages,
  ownerNeeds,
  rendersOf,
  trainStage,
  trainsetStage,
} from './stages.ts';

class BuildAsked extends Schema.TaggedError<BuildAsked>()('BuildAsked', {}) {
  override get message() {
    return 'name one member, or --cast for every member with a cutout folder, not both';
  }
}

class BuildFailed extends Schema.TaggedError<BuildFailed>()('BuildFailed', {
  stages: Schema.Array(Schema.String),
}) {
  override get message() {
    return `stages failed: ${this.stages.join(', ')}`;
  }
}

const ReportJson = Schema.fromJsonString(BuildReport);
const SpendList = Schema.Array(Spend);

/** The cast cache: `FILM_CAST_CACHE`, else `~/.cache/bible-film/cast`. */
export const castCache = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
  return yield* Config.String('FILM_CAST_CACHE').pipe(
    Config.withDefault(path.join(home, '.cache', 'bible-film', 'cast')),
  );
});

/** A stage's line: its state, id, wall time and, when it waits or failed, why. */
const stageLine = (s: StageReport) =>
  [
    s.state.padEnd(13),
    s.id,
    `${s.ms}ms`,
    ...Option.toArray(Option.map(s.reason, (r) => `(${r})`)),
  ].join(' ');

export const build = <E, R>(pages: Layer.Layer<Pages, E, R>, rules: ReadonlyArray<CritiqueRule>) =>
  Command.make(
    'build',
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
      plan: Flag.Boolean('plan').pipe(
        Flag.withDefault(false),
        Flag.withDescription('run nothing; print what would run'),
      ),
      touch: Flag.String('touch').pipe(
        Flag.atLeast(0),
        Flag.withDescription('with --plan, plan as if this file changed'),
      ),
      spend: Flag.String('spend').pipe(
        Flag.optional,
        Flag.withDescription('what the build may spend, comma-separated: okra, modal'),
      ),
      json: Flag.Boolean('json').pipe(Flag.withDefault(false), Flag.withDescription('print JSON')),
    },
    Effect.fn('film.concept.build')(function* (input) {
      const film = yield* filmNamed(input.film);
      if (Option.isSome(input.member) === input.cast) return yield* BuildAsked.make({});
      const path = yield* Path.Path;
      const spend = new Set(
        yield* Schema.decodeUnknownEffect(SpendList)(
          Option.match(input.spend, {
            onNone: () => [],
            onSome: (s) => s.split(',').map((one) => one.trim()),
          }),
        ),
      );
      const names = yield* Option.match(input.member, {
        onSome: (m) => Effect.succeed([m]),
        onNone: () => cutoutMembers(film),
      });
      const libraryPuppets = path.join(
        (yield* FilmFolder).paths(film).dir,
        '..',
        '..',
        'library',
        'cutout',
        'puppets.ts',
      );
      const members: Array<MemberStages> = [];
      for (const member of names) {
        const memberDir = path.dirname(yield* castFolder(film, member));
        const manifest = yield* manifestOf(memberDir);
        if (Option.isNone(manifest)) {
          yield* Console.error(`build ${member}: no cutout/coverage.ts, no stages`);
          continue;
        }
        const { coverage } = manifest.value;
        const facts = yield* coverageFacts(memberDir, coverage, {});
        members.push({ film, member, memberDir, libraryPuppets, coverage, facts });
      }
      const built = (yield* Effect.forEach(members, memberStages)).flat();
      const renders = rendersOf(built);
      const reader = yield* CastReader;
      const cache = yield* castCache;
      const stages = [
        ...built,
        trainsetStage(renders),
        trainStage(renders, reader.sources),
        ...Object.values(renders).map(evalStage),
        ...members.flatMap((m) => clipStages(m, built, cache)),
        askStage(ownerNeeds(members)),
      ];
      const report = yield* toStderr(
        buildGraph(stages, {
          cache,
          plan: input.plan,
          touch: input.touch,
          spend,
        }),
      );
      if (input.json) yield* Console.log(yield* Schema.encodeEffect(ReportJson)(report));
      else {
        for (const s of report.stages) yield* Console.log(stageLine(s));
        yield* Console.log(
          `build: ${report.stages.length} stages; okra ${report.okraCalls}, modal ${report.modalCalls}, $${report.spendUsd}`,
        );
      }
      const failed = report.stages.filter((s) => s.state === 'failed').map((s) => s.id);
      if (failed.length > 0) return yield* BuildFailed.make({ stages: failed });
    }),
  ).pipe(
    Command.provide(
      Layer.mergeAll(
        pages,
        Critic.layer(rules).pipe(Layer.provide(Counsel.layer)),
        PuppetImagesBun,
        CastReader.layer,
      ),
    ),
    Command.withDescription(
      "Build each cast member's stages (drawing, parts, cut, fit, renders), the training set, its train and each drawing's eval over the cast cache, rerunning only what changed; spends okra or Modal only when --spend names it",
    ),
  );
