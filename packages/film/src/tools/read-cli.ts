import {
  Array as Arr,
  Boolean as Bool,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import type { ScriptBeat } from '../core/api.ts';
import type { LineError, UnknownVoice } from '../core/errors.ts';
import { filmClock } from '../core/film-timeline.ts';
import { type Placed, layout, sceneClock, sceneOf } from '../core/layout.ts';
import { FilmUnknown, SceneNotLocated, SourceShared } from '../core/refusals.ts';
import type { CuePatch, Span, Timed } from '../core/schema.ts';
import { Segment } from '../core/segment.ts';
import { type Quote, type ScriptLine, sheetBeats } from '../core/sheet.ts';
import type { StudioReading } from '../core/studio.ts';
import { patchSpan, resolveTimeline, writtenPatch } from '../core/timeline.ts';
import { ContentStore } from './content-store.ts';
import { sceneReport } from './cues.ts';
import { FilmModuleInvalid, type TalkUnvoiced } from './errors.ts';
import {
  FilmFolder,
  FilmRepo,
  type LoadedFilm,
  importFilmModule,
  placeFilm,
  readerOf,
} from './film-repo.ts';
import {
  CuePatchJson,
  CueRead,
  ClockRead,
  CuesRead,
  type SceneSite,
  ScenesRead,
  ScriptRead,
  SitesRead,
  TimelineJson,
  VoiceRead,
  answering,
  printLine,
} from './fresh-film.ts';
import { beatsOf } from './narrator.ts';
import { type DrawingSite, drawingSites, parseModule } from './scene-source.ts';
import { type Field, type Located, SceneSources } from './scene-sources.ts';
import { quotesOf } from './script-sheet.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

const studioReading = (
  loaded: LoadedFilm,
  script: Option.Option<ReadonlyArray<ScriptLine>>,
  quotes: ReadonlyArray<Quote>,
): Result.Result<StudioReading, UnknownVoice | LineError | TalkUnvoiced> =>
  Result.gen(function* () {
    const lines = Option.getOrElse(script, () =>
      loaded.scenes.map((scene) => ({ ...scene, cite: [] })),
    );
    return {
      voice: yield* readerOf(loaded),
      heardAs: loaded.heardAs,
      beats: yield* beatsOf(loaded),
      sheet: yield* sheetBeats(lines, quotes),
    };
  });

export const readingOf = Effect.fn('film.read.voice.reading')(function* (loaded: LoadedFilm) {
  const script = yield* (yield* FilmRepo).script(loaded.paths.name);
  return yield* Effect.fromResult(studioReading(loaded, script, yield* quotesOf(loaded)));
});

const patched = (
  timeline: Option.Option<Readonly<Record<string, Span>>>,
  spans: Readonly<Record<string, Span>>,
  cue: string,
  patch: Option.Option<CuePatch>,
): Readonly<Record<string, Span>> =>
  Option.match(
    Option.zipWith(
      Option.filter(patch, () => !Object.hasOwn(spans, cue)),
      Option.flatMap(timeline, (own) => Option.fromUndefinedOr(own[cue])),
      (q, span) => patchSpan(span, writtenPatch(q)),
    ),
    { onNone: () => ({}), onSome: (span) => ({ [cue]: span }) },
  );

export const cueOf = (
  placed: ReadonlyArray<Placed>,
  scene: string,
  cue: string,
  spans: Readonly<Record<string, Span>>,
  patch: Option.Option<CuePatch>,
): CueRead =>
  Result.match(sceneOf(placed, scene), {
    onFailure: () => CueRead.make({}),
    onSuccess: (p) =>
      Result.match(
        resolveTimeline(
          {
            ...p.spec.timeline,
            ...spans,
            ...patched(Option.fromNullishOr(p.spec.timeline), spans, cue, patch),
          },
          sceneClock(p),
        ),
        {
          onFailure: (e) => CueRead.make({ unresolved: e.message }),
          onSuccess: (cues) =>
            CueRead.make(
              Option.match(Option.fromUndefinedOr(cues.get(cue)), {
                onNone: () => ({}),
                onSome: (r) => ({ resolved: r }),
              }),
            ),
        },
      ),
  });

const Owner = Schema.Struct({
  timeline: Schema.optionalKey(Schema.Unknown),
  knobs: Schema.optionalKey(Schema.Unknown),
});
const Registry = Schema.Struct({
  scenes: Schema.Array(Schema.Struct({ id: Schema.String, ...Owner.fields })),
});
const ModuleExports = Schema.Record(Schema.String, Schema.Unknown);

const decodeOwner = Schema.decodeUnknownOption(Owner);
const decodeExports = Schema.decodeUnknownOption(ModuleExports);

const FIELDS: ReadonlyArray<Field> = ['timeline', 'knobs'];

type FieldAccess = SceneSite['access'][Field];

const WRITABLE: FieldAccess = { _tag: 'Writable' };

interface Owned {
  readonly file: string;
  readonly exportName: string;
  readonly at: number;
}

const identity = (owner: typeof Owner.Type, field: Field): Option.Option<object> =>
  Option.liftPredicate(owner[field], Predicate.isObject);

type Owners = Record<Field, Map<object, Array<Owned>>>;

const addOwners = (
  owners: Owners,
  file: string,
  sites: ReadonlyArray<DrawingSite>,
  exports: Option.Option<typeof ModuleExports.Type>,
): void => {
  for (const site of sites)
    for (const exportName of site.exports) {
      const drawing = Option.flatMap(exports, (m) =>
        Option.flatMap(Option.fromUndefinedOr(m[exportName]), decodeOwner),
      );
      for (const field of FIELDS)
        for (const obj of Option.toArray(Option.flatMap(drawing, (d) => identity(d, field)))) {
          const list = owners[field].get(obj) ?? [];
          list.push({ file, exportName, at: site.at });
          owners[field].set(obj, list);
        }
    }
};

export const locateHere = Effect.fn('film.read.sites.locate')(function* (film: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* FilmFolder;
  const importModule = (file: string) =>
    Effect.tryPromise({
      try: () => importFilmModule(file),
      catch: (cause) =>
        FilmModuleInvalid.make({ film, module: path.basename(file), reason: String(cause) }),
    });
  const dir = folder.paths(film).dir;
  if (!(yield* fs.exists(dir)))
    return yield* FilmUnknown.make({ film, known: yield* folder.names });
  const files = (yield* fs.readDirectory(dir, { recursive: true }))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(dir, f))
    .sort();
  const parsed = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(file), (source) =>
        Result.match(parseModule(file, source), {
          onFailure: () => ({ file, sites: [] }),
          onSuccess: (program) => ({ file, sites: drawingSites(source, program) }),
        }),
      ),
    { concurrency: 8 },
  );
  const withSites = parsed.filter((p) => p.sites.length > 0);
  const owners = {
    timeline: new Map<object, Array<Owned>>(),
    knobs: new Map<object, Array<Owned>>(),
  } satisfies Owners;
  for (const { file, sites } of withSites)
    addOwners(owners, file, sites, decodeExports(yield* importModule(file)));
  const registry = yield* Schema.decodeUnknownEffect(Registry)(
    yield* importModule(path.join(dir, 'scenes', 'index.ts')),
  ).pipe(
    Effect.mapError((error) =>
      FilmModuleInvalid.make({ film, module: 'scenes/index.ts', reason: error.message }),
    ),
  );
  const readers = (field: Field, scene: (typeof registry.scenes)[number]) =>
    registry.scenes
      .filter((s) =>
        Option.exists(identity(scene, field), (obj) => Option.contains(identity(s, field), obj)),
      )
      .map((s) => s.id);
  const sites = new Map<string, SceneSite>();
  const unlocated: Array<SceneNotLocated> = [];
  for (const scene of registry.scenes) {
    const objects = FIELDS.flatMap((field) =>
      Option.toArray(Option.map(identity(scene, field), (obj) => ({ field, obj }))),
    );
    if (objects.length === 0) continue;
    const calls = Arr.dedupeWith(
      objects.flatMap(({ field, obj }) => owners[field].get(obj) ?? []),
      (a, b) => a.file === b.file && a.at === b.at,
    );
    const found = Option.filter(Arr.head(calls), () => calls.length === 1);
    if (Option.isSome(found)) {
      const { file, exportName, at } = found.value;
      const where = `${path.relative(dir, file)}#${exportName}`;
      const accessOf = (field: Field): FieldAccess =>
        Option.match(identity(scene, field), {
          onNone: () => WRITABLE,
          onSome: (obj): FieldAccess => {
            const own = (owners[field].get(obj) ?? []).some((o) => o.file === file && o.at === at);
            if (!own)
              return {
                _tag: 'Refused',
                error: SceneNotLocated.make({
                  film,
                  scene: scene.id,
                  reason: `the ${field} scene "${scene.id}" reads is not the one ${where} declares (the registry builds or overrides it), so no literal in source is what it plays`,
                }),
              };
            const shared = readers(field, scene);
            if (shared.length > 1)
              return {
                _tag: 'Refused',
                error: SourceShared.make({ film, field, file: where, scenes: shared }),
              };
            return WRITABLE;
          },
        });
      sites.set(scene.id, {
        scene: scene.id,
        file,
        shown: path.relative(dir, file),
        exportName,
        access: { timeline: accessOf('timeline'), knobs: accessOf('knobs') },
      });
      continue;
    }
    const names = calls.map((c) => `${path.relative(dir, c.file)}#${c.exportName}`);
    unlocated.push(
      SceneNotLocated.make({
        film,
        scene: scene.id,
        reason: Option.match(Arr.head(calls), {
          onNone: () =>
            'no exported drawing({...}) in the film folder declares the timeline or knobs it reads',
          onSome: () => `more than one drawing declares it: ${names.join(', ')}`,
        }),
      }),
    );
  }
  yield* Effect.logDebug(
    `scene-sources.locate film=${film} located=${sites.size} unlocated=${unlocated.length}`,
  );
  return { sites, unlocated } satisfies Located;
});

export const scenesLocatedHere = Layer.effect(
  SceneSources,
  Effect.gen(function* () {
    const context = yield* Effect.context<FileSystem.FileSystem | Path.Path | FilmFolder>();
    return yield* SceneSources.over((film) => Effect.provideContext(locateHere(film), context));
  }),
);

const voice = Command.make(
  'voice',
  { film },
  Effect.fn('film.read.voice')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* printLine(VoiceRead.make({ reading: yield* readingOf(loaded) }));
  }, answering),
).pipe(
  Command.withDescription(
    "What the lab's studio reads of the film (its voice, each beat's line, the reading sheet), as one line of JSON",
  ),
);

const scriptBeatsOf = (
  script: Option.Option<
    ReadonlyArray<ScriptLine & { readonly picture?: string; readonly cast?: ReadonlyArray<string> }>
  >,
): ReadonlyArray<ScriptBeat> =>
  Option.getOrElse(script, () => []).map(({ id, say, cite, picture, cast }): ScriptBeat => ({
    id,
    cite,
    ...Option.match(Option.fromUndefinedOr(cast), {
      onNone: () => ({}),
      onSome: (members) => ({ cast: members }),
    }),
    ...Option.match(Option.fromUndefinedOr(say), {
      onNone: () => ({}),
      onSome: (line) => ({ say: line }),
    }),
    ...Option.match(Option.fromUndefinedOr(picture), {
      onNone: () => ({}),
      onSome: (brief) => ({ picture: brief }),
    }),
  }));

const script = Command.make(
  'script',
  { film },
  Effect.fn('film.read.script')(function* (input) {
    const beats = scriptBeatsOf(yield* (yield* FilmRepo).script(input.film));
    yield* printLine(ScriptRead.make({ beats }));
  }, answering),
).pipe(
  Command.withDescription(
    "What the lab's words reader reads of the film's script (each beat's line, picture and sources), as one line of JSON",
  ),
);

const cue = Command.make(
  'cue',
  {
    film,
    scene: Argument.String('scene').pipe(Argument.withDescription('the scene, by id')),
    cue: Argument.String('cue').pipe(Argument.withDescription('the cue, by name')),
    spans: Flag.String('spans').pipe(
      Flag.withSchema(TimelineJson),
      Flag.optional,
      Flag.withDescription("spans (JSON) in place of the scene's own: a write not made yet"),
    ),
    patch: Flag.String('patch').pipe(
      Flag.withSchema(CuePatchJson),
      Flag.optional,
      Flag.withDescription(
        "the write (a CuePatch, JSON) applied to the cue's own span when --spans has none for it",
      ),
    ),
  },
  Effect.fn('film.read.cue')(function* (input) {
    const placed = yield* placeFilm(yield* (yield* FilmRepo).load(input.film));
    const spans = Option.getOrElse(input.spans, () => ({}));
    yield* printLine(cueOf(placed, input.scene, input.cue, spans, input.patch));
  }, answering),
).pipe(
  Command.withDescription(
    "A cue on its scene's clock as the scene file declares it (or with --spans in its place, and --patch over its own span), or why its timeline does not resolve, as one line of JSON",
  ),
);

const sites = Command.make(
  'sites',
  { film },
  Effect.fn('film.read.sites')(function* (input) {
    const located = yield* locateHere(input.film);
    yield* printLine(
      SitesRead.make({ sites: [...located.sites.values()], unlocated: located.unlocated }),
    );
  }, answering),
).pipe(
  Command.withDescription(
    "Where each scene's drawing is declared and what of it the lab may write, or why a scene is not located, as one line of JSON",
  ),
);

const cues = Command.make(
  'cues',
  {
    film,
    scene: Argument.String('scene').pipe(
      Argument.optional,
      Argument.withDescription('only this scene'),
    ),
  },
  Effect.fn('film.read.cues')(function* (input) {
    const placed = yield* placeFilm(yield* (yield* FilmRepo).load(input.film));
    const report = yield* Effect.fromResult(sceneReport(placed, input.scene));
    yield* printLine(CuesRead.make({ lines: report.lines, late: report.late }));
  }, answering),
).pipe(
  Command.withDescription(
    "Each scene's placement, marks and named cues as `film cues` prints them (or one scene's), and how many cues end after their scene, as one line of JSON",
  ),
);

const scenes = Command.make(
  'scenes',
  { film },
  Effect.fn('film.read.scenes')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* printLine(ScenesRead.make({ scenes: loaded.scenes.map((scene) => scene.id) }));
  }, answering),
).pipe(
  Command.withDescription(
    "The film's scenes by id, in order, as `film lab journal` knows them (no timeline resolved), as one line of JSON",
  ),
);

const untimed = <S extends Timed>(scenes: ReadonlyArray<S>): ReadonlyArray<Omit<S, 'timeline'>> =>
  scenes.map(({ timeline: _timeline, ...scene }) => scene);

const clock = Command.make(
  'clock',
  {
    film,
    folder: Flag.String('folder').pipe(
      Flag.withSchema(Segment),
      Flag.optional,
      Flag.withDescription('a version folder (`v2`): its scenes, takes, acts and score'),
    ),
  },
  Effect.fn('film.read.clock')(function* (input) {
    const repo = yield* FilmRepo;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const at = (yield* FilmFolder).paths(input.film, Option.getOrUndefined(input.folder));
    const scriptAlone =
      Option.isSome(input.folder) && !(yield* fs.exists(path.join(at.dir, 'scenes', 'index.ts')));
    const read = yield* Bool.match(scriptAlone, {
      onTrue: () =>
        Effect.gen(function* () {
          const script = yield* repo.script(input.film, Option.getOrUndefined(input.folder));
          const timings = yield* (yield* ContentStore).read(at.timings);
          const { fps } = yield* repo.load(input.film);
          return yield* Effect.fromResult(
            Result.flatMap(
              layout(
                Option.getOrElse(script, () => []),
                timings,
                fps,
              ),
              (placed) => filmClock(placed, fps, { acts: [], movements: [], drawn: () => false }),
            ),
          );
        }),
      onFalse: () =>
        Effect.gen(function* () {
          const loaded = yield* repo.load(input.film, Option.getOrUndefined(input.folder));
          return yield* Effect.fromResult(
            Result.flatMap(layout(untimed(loaded.scenes), loaded.timings, loaded.fps), (placed) =>
              filmClock(placed, loaded.fps, {
                acts: Option.match(loaded.look, { onNone: () => [], onSome: (look) => look.acts }),
                movements: Option.getOrElse(
                  Option.flatMap(
                    Option.flatMap(loaded.sound, (sound) => Option.fromUndefinedOr(sound.score)),
                    (score) =>
                      Option.map(
                        Option.fromUndefinedOr(score.options[score.play]),
                        (m) => m.movements,
                      ),
                  ),
                  () => [],
                ),
                drawn: (p) => p.spec.storyboard !== true,
              }),
            ),
          );
        }),
    });
    yield* printLine(ClockRead.make({ clock: read }));
  }, answering),
).pipe(
  Command.withDescription(
    "A version's clock (each beat's span, speech, marks and voice, its acts and its score's movements), as one line of JSON",
  ),
);

export const read = Command.make('read').pipe(
  Command.withDescription(
    'What the lab reads of a film, fresh from disk, as one line of JSON (the lab runs these)',
  ),
  Command.withSubcommands([voice, script, cue, sites, cues, scenes, clock]),
);
