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
import { Array as Arr, Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import type { SheetKind } from '../../core/cast-sheet.ts';
import type { CritiqueRule } from '../../core/critique.ts';
import { PuppetImagesBun } from '../../puppet/images-bun.ts';
import { castFolder } from '../cast-library.ts';
import { CAST_LANES, castLine, makeCastSheet } from '../cast-sheet-make.ts';
import { Counsel } from '../counsel.ts';
import { Critic } from '../critique.ts';
import { FilmFolder, filmNamed } from '../film-repo.ts';
import { ImageRoute } from '../image-route.ts';
import type { Pages } from '../pages.ts';
import type { AskStore } from '../ask-store.ts';
import { castCache, memberOf, readerLockOf } from './built.ts';
import { cutoutMembers, toStderr } from './coverage-cli.ts';
import { viewOfId } from './coverage-facts.ts';
import {
  BuildReport,
  Spend,
  type Stage,
  StageFailed,
  type StageReport,
  buildGraph,
} from './graph.ts';
import { drawingSetLive } from './drawing-set.ts';
import {
  type DrawingSet,
  type OwnerNeed,
  askStage,
  drawStage,
  needName,
  ownerNeeds,
} from './owner-ask.ts';
import { lockStage } from './lock.ts';
import { CastReader } from './reader.ts';
import {
  type MemberStages,
  type StageServices,
  candidatesOf,
  clipStages,
  evalStage,
  buildSources,
  memberStages,
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

/** The app's house look: the block every concept prompt opens with, and its image. */
interface HouseLook {
  readonly text: string;
  readonly image: string;
}

/**
 * The needs not drawn, drawn as sheet tries on the image route (each
 * member's sheet kind once, its default tries); a key's drawing is its own
 * tool's (the held keys), so it is named and left.
 */
const drawTries = (house: HouseLook) => (needs: ReadonlyArray<OwnerNeed>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sheets = new Map<string, OwnerNeed & { readonly kind: SheetKind }>();
    for (const need of needs)
      yield* Option.match(viewOfId(need.id), {
        onNone: () => Console.error(`draw ${needName(need)}: drawn by its own tool, not a sheet`),
        onSome: ({ kind }) =>
          Effect.sync(() => sheets.set(`${need.member}/${kind}`, { ...need, kind })),
      });
    const text = yield* fs.readFileString(house.text);
    for (const sheet of sheets.values()) {
      const folder = yield* castFolder(sheet.film, sheet.member);
      const out = path.join((yield* FilmFolder).paths(sheet.film).out, 'cast', sheet.member);
      yield* makeCastSheet(
        { folder, out },
        {
          kind: sheet.kind,
          tries: 3,
          lanes: CAST_LANES,
          dryRun: false,
          house: text,
          houseImage: path.resolve(house.image),
        },
        (line) => Console.error(castLine(line)),
      );
    }
  }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `draw: ${e.message}` })));
type DrawServices = Effect.Services<ReturnType<ReturnType<typeof drawTries>>>;

const ReportJson = Schema.fromJsonString(BuildReport);
const SpendList = Schema.Array(Spend);

/** A stage's line: its state, id, wall time and, when it waits or failed, why. */
const stageLine = (s: StageReport) =>
  [
    s.state.padEnd(13),
    s.id,
    `${s.ms}ms`,
    ...Option.toArray(Option.map(s.reason, (r) => `(${r})`)),
  ].join(' ');

export const build = <E, R>(
  house: HouseLook,
  pages: Layer.Layer<Pages, E, R>,
  rules: ReadonlyArray<CritiqueRule>,
  renderPage: string,
) =>
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
      const members: Array<MemberStages> = [];
      for (const member of names) {
        const found = yield* memberOf(film, member);
        if (Option.isNone(found)) {
          yield* Console.error(`build ${member}: no cutout/coverage.ts, no stages`);
          continue;
        }
        members.push(found.value.stages);
      }
      const src = yield* buildSources(film, renderPage);
      const built = (yield* Effect.forEach(members, (m) => memberStages(m, src))).flat();
      const candidates = members.flatMap(candidatesOf);
      const sources = src.stage;
      const reader = yield* CastReader;
      const cache = yield* castCache;
      const needs = ownerNeeds(members);
      const stages: ReadonlyArray<
        Stage<StageServices | CastReader | AskStore | DrawingSet | DrawServices>
      > = [
        ...built,
        trainsetStage(candidates),
        trainStage(candidates, reader.sources),
        ...candidates.map((c) => evalStage(c.renders, sources.eval)),
        ...members.flatMap((m) => clipStages(m, cache, sources.chain)),
        lockStage({
          file: yield* readerLockOf(film),
          candidates,
          sources: reader.sources,
          // the lock reports the build's first clip (today the one: lead-feast's raise/clip-b)
          clip: Arr.head(
            members.flatMap((m) =>
              (m.coverage.clips ?? []).map((c) => ({ member: m.member, clip: c.id })),
            ),
          ),
        }),
        askStage(
          film,
          members.map((m) => m.member),
          needs,
        ),
        drawStage(needs, drawTries(house)),
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
        ImageRoute.layer,
        drawingSetLive,
      ),
    ),
    Command.withDescription(
      "Build each cast member's stages (drawing, parts, cut, fit, renders), the training set, its train and each drawing's eval over the cast cache, rerunning only what changed; spends okra or Modal only when --spend names it",
    ),
  );
