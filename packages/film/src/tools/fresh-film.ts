import {
  Array as Arr,
  Console,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { type ScriptBeat, ScriptBeats, ServerFailed } from '../core/api.ts';
import { LONGEST_WAIT } from '../core/wait.ts';
import { Project } from '../core/catalogue.ts';
import { ChoicePoint, type ChoiceVerb } from '../core/choice.ts';
import { UnknownAct, UnknownScene } from '../core/errors.ts';
import { FilmClock } from '../core/timeline-schema.ts';
import {
  CatalogueInvalid,
  ChoiceUnknown,
  FilmUnknown,
  FreshProcessFailed,
  RecordingInvalid,
  SceneNotLocated,
  SceneNotRendered,
  SourceShared,
  TakeMismatch,
  TakeUnknown,
  VariantUnknown,
  VerbRefused,
} from '../core/refusals.ts';
import { CheckLine, CuePatch, ResolvedCue, Timeline, VoiceTiming } from '../core/schema.ts';
import { StudioReading } from '../core/studio.ts';
import type { FilmName } from './film-repo.ts';
import { type Finished, collectWithin } from './process.ts';

export class OptionsListed extends Schema.TaggedClass<OptionsListed>()('OptionsListed', {
  points: Schema.Array(ChoicePoint),
}) {}

export class OptionsChecked extends Schema.TaggedClass<OptionsChecked>()('OptionsChecked', {
  points: Schema.Array(ChoicePoint),
  findings: Schema.Array(CheckLine),
}) {}

export class OptionsMixed extends Schema.TaggedClass<OptionsMixed>()('OptionsMixed', {}) {}

export class OptionsSounded extends Schema.TaggedClass<OptionsSounded>()('OptionsSounded', {}) {}

export class OptionsKept extends Schema.TaggedClass<OptionsKept>()('OptionsKept', {
  take: Schema.optionalKey(VoiceTiming),
  heard: Schema.optionalKey(Schema.String),
  wer: Schema.optionalKey(Schema.Finite),
  mixed: Schema.Boolean,
}) {}

export class OptionsTaken extends Schema.TaggedClass<OptionsTaken>()('OptionsTaken', {}) {}

export class ProjectRead extends Schema.TaggedClass<ProjectRead>()('ProjectRead', {
  project: Project,
}) {}

export const TimelineJson = Schema.fromJsonString(Timeline);
const encodeTimeline = Schema.encodeEffect(TimelineJson);

export const CuePatchJson = Schema.fromJsonString(CuePatch);
const encodeCuePatch = Schema.encodeEffect(CuePatchJson);

export class VoiceRead extends Schema.TaggedClass<VoiceRead>()('VoiceRead', {
  reading: StudioReading,
}) {}

export class ScriptRead extends Schema.TaggedClass<ScriptRead>()('ScriptRead', {
  beats: ScriptBeats.fields.beats,
}) {}

export class CueRead extends Schema.TaggedClass<CueRead>()('CueRead', {
  resolved: Schema.optionalKey(ResolvedCue),
  unresolved: Schema.optionalKey(Schema.String),
}) {}

const FieldAccess = Schema.Union([
  Schema.TaggedStruct('Writable', {}),
  Schema.TaggedStruct('Refused', { error: Schema.Union([SceneNotLocated, SourceShared]) }),
]);

export const SceneSite = Schema.Struct({
  scene: Schema.String,
  file: Schema.String,
  shown: Schema.String,
  exportName: Schema.String,
  access: Schema.Struct({ timeline: FieldAccess, knobs: FieldAccess }),
});
export type SceneSite = typeof SceneSite.Type;

export class SitesRead extends Schema.TaggedClass<SitesRead>()('SitesRead', {
  sites: Schema.Array(SceneSite),
  unlocated: Schema.Array(SceneNotLocated),
}) {}

export class CuesRead extends Schema.TaggedClass<CuesRead>()('CuesRead', {
  lines: Schema.Array(Schema.String),
  late: Schema.Int,
}) {}

export class ClockRead extends Schema.TaggedClass<ClockRead>()('ClockRead', {
  clock: FilmClock,
}) {}

export class ScenesRead extends Schema.TaggedClass<ScenesRead>()('ScenesRead', {
  scenes: Schema.Array(Schema.String),
}) {}

const FreshRefusal = Schema.Union([
  FilmUnknown,
  ChoiceUnknown,
  VariantUnknown,
  VerbRefused,
  TakeUnknown,
  TakeMismatch,
  RecordingInvalid,
  SceneNotRendered,
  UnknownScene,
  UnknownAct,
  CatalogueInvalid,
]);
type FreshRefusal = typeof FreshRefusal.Type;

const FreshLine = Schema.Union([
  OptionsListed,
  OptionsChecked,
  OptionsMixed,
  OptionsSounded,
  OptionsKept,
  OptionsTaken,
  ProjectRead,
  VoiceRead,
  ScriptRead,
  CueRead,
  SitesRead,
  CuesRead,
  ScenesRead,
  ClockRead,
  FreshRefusal,
  ServerFailed,
]);
type FreshLine = typeof FreshLine.Type;

const FreshLineJson = Schema.fromJsonString(FreshLine);

export const printLine = (line: FreshLine) =>
  Effect.flatMap(Schema.encodeEffect(FreshLineJson)(line), (text) => Console.log(text));

const isFreshRefusal = Schema.is(FreshRefusal);

interface Named {
  readonly _tag: string;
  readonly message: string;
}

const isNamed = (u: unknown): u is Named =>
  Predicate.hasProperty(u, '_tag') &&
  Predicate.isString(u._tag) &&
  Predicate.hasProperty(u, 'message') &&
  Predicate.isString(u.message);

const failureLine = (error: Named): FreshRefusal | ServerFailed => {
  if (isFreshRefusal(error)) return error;
  return ServerFailed.make({ tag: error._tag, reason: error.message });
};

export const answering = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.tapError(effect, (error) => {
    if (isNamed(error)) return printLine(failureLine(error));
    return Effect.void;
  });

const isFailureLine = Schema.is(Schema.Union([FreshRefusal, ServerFailed]));

export const CheckLineJson = Schema.fromJsonString(CheckLine);

const decodeCheckLine = Schema.decodeUnknownEffect(CheckLineJson);

export const checkLines = Effect.fn('FreshFilm.checkLines')(function* (
  command: string,
  stdout: string,
) {
  const lines = stdout.split('\n').filter((line) => line.trim() !== '');
  return yield* Effect.forEach(lines, (line) =>
    decodeCheckLine(line).pipe(
      Effect.mapError(() => FreshProcessFailed.make({ command, reason: `not a finding: ${line}` })),
    ),
  );
});

export const failedCheck = (error: FreshProcessFailed): ReadonlyArray<CheckLine> => [
  { level: 'error', tag: error._tag, message: error.message },
];

export const encodeCheckLine = Schema.encodeSync(CheckLineJson);

export const answeringCheck = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  input: { readonly json: boolean },
) => {
  if (!input.json) return effect;
  return Effect.tapError(effect, (error) => {
    if (!isNamed(error) || error._tag === 'CheckFailed') return Effect.void;
    return Console.log(
      encodeCheckLine({ level: 'error', tag: error._tag, message: error.message }),
    );
  });
};

const READ_LIMIT = Duration.seconds(LONGEST_WAIT);
const MIX_LIMIT = Duration.minutes(10);

type CheckLeg = 'static' | 'sound' | 'draw';

const CHECK_LIMITS: Record<CheckLeg, Duration.Duration> = {
  static: Duration.seconds(30),
  sound: Duration.minutes(5),
  draw: Duration.minutes(5),
};

export type FreshError = FreshProcessFailed | FreshRefusal | ServerFailed;

export interface FreshFilmService {
  readonly choices: (film: FilmName) => Effect.Effect<ReadonlyArray<ChoicePoint>, FreshError>;
  readonly checked: (film: FilmName) => Effect.Effect<OptionsChecked, FreshError>;
  readonly mix: (
    film: FilmName,
    point: string,
    variant: string,
    to: string,
  ) => Effect.Effect<void, FreshError>;
  readonly sound: (
    film: FilmName,
    point: string,
    variant: string,
    to: string,
  ) => Effect.Effect<void, FreshError>;
  readonly keepVoice: (
    film: FilmName,
    beat: string,
    file: string,
    options: { readonly acceptMismatch: boolean },
  ) => Effect.Effect<OptionsKept, FreshError>;
  readonly take: (
    film: FilmName,
    point: string,
    take: string,
    verb: ChoiceVerb,
  ) => Effect.Effect<void, FreshError>;
  readonly reading: (film: FilmName) => Effect.Effect<StudioReading, FreshError>;
  readonly script: (film: FilmName) => Effect.Effect<ReadonlyArray<ScriptBeat>, FreshError>;
  readonly cue: (
    film: FilmName,
    scene: string,
    cue: string,
    spans: Option.Option<Timeline>,
    patch: Option.Option<CuePatch>,
  ) => Effect.Effect<CueRead, FreshError>;
  readonly sites: (film: FilmName) => Effect.Effect<SitesRead, FreshError>;
  readonly cues: (
    film: FilmName,
    scene: Option.Option<string>,
  ) => Effect.Effect<CuesRead, FreshError>;
  readonly scenes: (film: FilmName) => Effect.Effect<ReadonlyArray<string>, FreshError>;
  readonly clock: (
    film: FilmName,
    folder: Option.Option<string>,
  ) => Effect.Effect<FilmClock, FreshError>;
  readonly remix: (film: FilmName) => Effect.Effect<void, FreshProcessFailed>;
  readonly project: (args: ReadonlyArray<string>) => Effect.Effect<Project, FreshError>;
  readonly check: (
    film: string,
    leg: CheckLeg,
    scenes?: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<CheckLine>>;
}

const decodeLine = Schema.decodeUnknownOption(FreshLineJson);

const answerIn = (stdout: string): Option.Option<FreshLine> =>
  Option.firstSomeOf(
    stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .toReversed()
      .map((line) => decodeLine(line)),
  );

const tailOf = (done: Finished) => done.stderr.trim().split('\n').slice(-3).join(' | ');

export class FreshFilm extends Context.Service<FreshFilm, FreshFilmService>()(
  '@manna/film/tools/FreshFilm',
) {
  static readonly layer = (command: ReadonlyArray<string>) =>
    Layer.effect(
      FreshFilm,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const [program = 'bun', ...prefix] = command;

        const run = Effect.fn('FreshFilm.run')(function* (
          name: string,
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
        ) {
          return yield* collectWithin(
            spawner,
            name,
            ChildProcess.make(program, [...prefix, ...args], { forceKillAfter: '5 seconds' }),
            limit,
          ).pipe(
            Effect.mapError((error) =>
              FreshProcessFailed.make({ command: name, reason: error.message }),
            ),
          );
        });

        const answer = Effect.fn('FreshFilm.answer')(function* (
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
        ) {
          const name = `film ${args.slice(0, 2).join(' ')}`;
          const done = yield* run(name, args, limit);
          const line = yield* Effect.fromOption(answerIn(done.stdout), () =>
            FreshProcessFailed.make({
              command: name,
              reason: `exit ${done.exitCode}, no answer: ${tailOf(done)}`,
            }),
          );
          if (isFailureLine(line)) return yield* line;
          return line;
        });

        const ask = <A extends FreshLine>(
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
          answered: Schema.Schema<A>,
        ) =>
          Effect.filterOrFail(answer(args, limit), Schema.is(answered), (line) =>
            FreshProcessFailed.make({
              command: `film ${args.slice(0, 2).join(' ')}`,
              reason: `answered ${line._tag}`,
            }),
          );

        const choices = Effect.fn('FreshFilm.choices')(function* (film: FilmName) {
          return (yield* ask(['options', 'list', film], READ_LIMIT, OptionsListed)).points;
        });

        const checked = Effect.fn('FreshFilm.checked')(function* (film: FilmName) {
          return yield* ask(['options', 'list', film, '--check'], READ_LIMIT, OptionsChecked);
        });

        const mix = Effect.fn('FreshFilm.mix')(function* (
          film: FilmName,
          point: string,
          variant: string,
          to: string,
        ) {
          yield* ask(
            ['options', 'mix', film, '--point', point, '--variant', variant, '--to', to],
            MIX_LIMIT,
            OptionsMixed,
          );
        });

        const sound = Effect.fn('FreshFilm.sound')(function* (
          film: FilmName,
          point: string,
          variant: string,
          to: string,
        ) {
          yield* ask(
            ['options', 'sound', film, '--point', point, '--variant', variant, '--to', to],
            READ_LIMIT,
            OptionsSounded,
          );
        });

        const keepVoice = Effect.fn('FreshFilm.keepVoice')(function* (
          film: FilmName,
          beat: string,
          file: string,
          options: { readonly acceptMismatch: boolean },
        ) {
          const accept = Arr.filter(['--accept-mismatch'], () => options.acceptMismatch);
          return yield* ask(
            ['options', 'keep-voice', film, beat, file, ...accept],
            MIX_LIMIT,
            OptionsKept,
          );
        });

        const take = Effect.fn('FreshFilm.take')(function* (
          film: FilmName,
          point: string,
          sha: string,
          verb: ChoiceVerb,
        ) {
          yield* ask(
            ['options', 'take', film, '--point', point, '--variant', sha, '--verb', verb],
            READ_LIMIT,
            OptionsTaken,
          );
        });

        const reading = Effect.fn('FreshFilm.reading')(function* (film: FilmName) {
          return (yield* ask(['read', 'voice', film], READ_LIMIT, VoiceRead)).reading;
        });

        const script = Effect.fn('FreshFilm.script')(function* (film: FilmName) {
          return (yield* ask(['read', 'script', film], READ_LIMIT, ScriptRead)).beats;
        });

        const cue = Effect.fn('FreshFilm.cue')(function* (
          film: FilmName,
          scene: string,
          name: string,
          spans: Option.Option<Timeline>,
          patch: Option.Option<CuePatch>,
        ) {
          const given = yield* Option.match(spans, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (s) => Effect.map(Effect.orDie(encodeTimeline(s)), (json) => ['--spans', json]),
          });
          const write = yield* Option.match(patch, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (q) => Effect.map(Effect.orDie(encodeCuePatch(q)), (json) => ['--patch', json]),
          });
          return yield* ask(
            ['read', 'cue', film, scene, name, ...given, ...write],
            READ_LIMIT,
            CueRead,
          );
        });

        const sites = Effect.fn('FreshFilm.sites')(function* (film: FilmName) {
          return yield* ask(['read', 'sites', film], READ_LIMIT, SitesRead);
        });

        const cues = Effect.fn('FreshFilm.cues')(function* (
          film: FilmName,
          scene: Option.Option<string>,
        ) {
          return yield* ask(['read', 'cues', film, ...Option.toArray(scene)], READ_LIMIT, CuesRead);
        });

        const sceneIds = Effect.fn('FreshFilm.scenes')(function* (film: FilmName) {
          return (yield* ask(['read', 'scenes', film], READ_LIMIT, ScenesRead)).scenes;
        });

        const clock = Effect.fn('FreshFilm.clock')(function* (
          film: FilmName,
          folder: Option.Option<string>,
        ) {
          const only = Option.match(folder, { onNone: () => [], onSome: (f) => ['--folder', f] });
          return (yield* ask(['read', 'clock', film, ...only], READ_LIMIT, ClockRead)).clock;
        });

        const remix = Effect.fn('FreshFilm.remix')(function* (film: FilmName) {
          const done = yield* run('film mix', ['mix', film], MIX_LIMIT);
          if (done.exitCode !== 0)
            return yield* FreshProcessFailed.make({
              command: 'film mix',
              reason: `exit ${done.exitCode}: ${tailOf(done)}`,
            });
          yield* Effect.log(`fresh.remix film=${film}`);
        });

        const project = Effect.fn('FreshFilm.project')(function* (args: ReadonlyArray<string>) {
          return (yield* ask(['project', ...args], READ_LIMIT, ProjectRead)).project;
        });

        const findings = Effect.fn('FreshFilm.findings')(function* (
          film: string,
          leg: CheckLeg,
          scenes: ReadonlyArray<string>,
        ) {
          const name = `film check --${leg}`;
          const only = Arr.match(scenes, {
            onEmpty: () => [],
            onNonEmpty: (named) => ['--scene', named.join(',')],
          });
          const done = yield* run(
            name,
            ['check', film, `--${leg}`, ...only, '--allow-stale', '--json'],
            CHECK_LIMITS[leg],
          );
          const lines = yield* checkLines(name, done.stdout);
          if (done.exitCode !== 0 && lines.every((l) => l.level !== 'error'))
            return yield* FreshProcessFailed.make({
              command: name,
              reason: `exit ${done.exitCode}: ${tailOf(done)}`,
            });
          yield* Effect.log(`fresh.check film=${film} leg=${leg} findings=${lines.length}`);
          return lines;
        });

        const check = (film: string, leg: CheckLeg, scenes: ReadonlyArray<string> = []) =>
          findings(film, leg, scenes).pipe(
            Effect.catchTag('FreshProcessFailed', (error) =>
              Effect.logWarning(
                `fresh.check.failed film=${film} leg=${leg} reason="${error.reason}"`,
              ).pipe(Effect.as(failedCheck(error))),
            ),
          );

        return FreshFilm.of({
          choices,
          checked,
          mix,
          sound,
          keepVoice,
          take,
          reading,
          script,
          cue,
          sites,
          cues,
          scenes: sceneIds,
          clock,
          remix,
          project,
          check,
        });
      }),
    );
}
