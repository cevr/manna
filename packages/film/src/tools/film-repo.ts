import {
  Array as Arr,
  Boolean as Bool,
  Config,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Result,
  Schema,
  Struct,
} from 'effect';
import {
  EMPTY_FOOTAGE_LOCK,
  type FootageLock,
  FootageLockJson,
  FootageTranscriptJson,
  VOICE_RECIPE,
  copiesIn,
} from '../core/footage.ts';
import { type LayoutError, type Placed, layout } from '../core/layout.ts';
import type { VoicePieces } from '../core/mix.ts';
import {
  TALK_FPS,
  Talk,
  type TalkCut,
  type TalkTake,
  talkCut,
  talkTakes,
  talkTranscripts,
} from '../core/talk.ts';
import { type CodeError, FitUnreadable } from '../core/errors.ts';
import {
  Library,
  type Lock,
  LockJson,
  type MeasuredSounds,
  NO_SOUNDS,
  type SoundFit,
  SoundFitJson,
  type Sounds,
} from '../core/sfx.ts';
import { resolveCode } from '../core/synth/resolve.ts';
import { StoreConfig } from '../core/store.ts';
import {
  Beat,
  HeardAs,
  Look,
  Looks,
  Sound,
  type SoundManifest,
  SoundManifestJson,
  Shorts,
  Timed,
  type Timings,
  TimingsJson,
  Voice,
} from '../core/schema.ts';
import type { PlatformError } from 'effect/PlatformError';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { FilmUnknown } from '../core/refusals.ts';
import { Segment, isSegment } from '../core/segment.ts';
import { FilmModuleInvalid, TalkUnvoiced } from './errors.ts';
import { Credit } from '../canvas/credits.ts';
import { type PrivateFile, type Scores, scoreKey } from './media-store.ts';

export interface FilmPaths {
  readonly name: string;
  readonly dir: string;
  readonly narration: string;
  readonly sound: string;
  readonly out: string;
  readonly timings: Manifest<Timings>;
  readonly manifest: Manifest<SoundManifest>;
}

export const masterFile = (paths: FilmPaths): string => `${paths.narration}/full.wav`;

export interface LoadedFilm {
  readonly paths: FilmPaths;
  readonly fps: number;
  readonly scenes: ReadonlyArray<Timed>;
  readonly voice: Option.Option<Voice>;
  readonly sound: Option.Option<Sound>;
  readonly shorts: Shorts;
  readonly timings: Timings;
  readonly manifest: SoundManifest;
  readonly heardAs: HeardAs;
  readonly look: Option.Option<Look>;
  readonly looks: Looks;
  readonly sounds: Sounds;
  readonly talk: Option.Option<LoadedTalk>;
  readonly credits: Option.Option<ReadonlyArray<Credit>>;
}

export interface MeasuredFilm extends LoadedFilm {
  readonly sounds: MeasuredSounds;
}

export interface LoadedTalk {
  readonly talk: Talk;
  readonly takes: Readonly<Record<string, TalkTake>>;
  readonly cut: TalkCut;
  readonly copies: string;
}

export const readerOf = (film: LoadedFilm): Result.Result<Voice, TalkUnvoiced> =>
  Result.fromOption(film.voice, () => TalkUnvoiced.make({ film: film.paths.name }));

export const voicePiecesOf = (film: LoadedFilm): ReadonlyMap<string, VoicePieces> =>
  new Map(
    Option.match(film.talk, {
      onNone: () => [],
      onSome: ({ cut, takes, copies }) =>
        cut.sections.flatMap((section) =>
          Option.toArray(
            Option.map(Rec.get(takes, section.take), (take) => [
              section.id,
              {
                file: `${copies}/${section.voice.file}`,
                content: `${take.source} ${VOICE_RECIPE}`,
                pieces: section.pieces,
              },
            ]),
          ),
        ),
    }),
  );

type LoadError = FilmUnknown | FilmModuleInvalid | StoreError | CodeError;

export const FilmName = Segment.pipe(Schema.brand('FilmName'));
export type FilmName = typeof FilmName.Type;

interface FilmFolderService {
  readonly paths: (film: string, folder?: Segment) => FilmPaths;
  readonly names: Effect.Effect<ReadonlyArray<string>>;
  readonly sounds: Option.Option<string>;
  readonly footage: Option.Option<string>;
  readonly stamp: (film: string) => Effect.Effect<number, PlatformError>;
}

interface FilmRepoService {
  readonly load: (film: string, folder?: Segment) => Effect.Effect<LoadedFilm, LoadError>;
  readonly script: (
    film: string,
    folder?: Segment,
  ) => Effect.Effect<Option.Option<ScriptModule['script']>, LoadError>;
  readonly sound: (film: string) => Effect.Effect<Option.Option<Sound>, LoadError>;
  readonly scores: Effect.Effect<Scores, StoreError>;
}

const ScenesModule = Schema.Struct({ scenes: Schema.Array(Timed) });
const ScriptModule = Schema.Struct({
  script: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      say: Schema.optionalKey(Schema.String),
      ...Struct.pick(Timed.fields, ['lead', 'tail', 'min', 'enter']),
      cite: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
      picture: Schema.optionalKey(Schema.String),
      cast: Beat.fields.cast,
    }),
  ),
  heardAs: HeardAs.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
});
type ScriptModule = typeof ScriptModule.Type;
const VoiceModule = Schema.Struct({ voice: Voice });
const SoundModule = Schema.Struct({ sound: Sound });
const FilmModule = Schema.Struct({ look: Schema.optionalKey(Look) });
const FilmRate = Schema.Struct({ fps: Schema.Finite.check(Schema.isGreaterThan(0)) });
const ShortsModule = Schema.Struct({ shorts: Shorts });
const TalkModule = Schema.Struct({ talk: Talk });
const PaletteModule = Schema.Struct({ looks: Schema.optionalKey(Looks) });
const CreditsModule = Schema.Struct({ CREDITS: Schema.Array(Credit) });

export const importFilmModule = (file: string) => import(file);

const LibraryModule = Schema.Struct({ library: Library, store: StoreConfig });

export const libraryModule = (file: string) =>
  Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (cause) =>
      FilmModuleInvalid.make({ film: 'sounds', module: 'library.ts', reason: String(cause) }),
  }).pipe(
    Effect.flatMap((module) =>
      Schema.decodeUnknownEffect(LibraryModule)(module).pipe(
        Effect.mapError((error) =>
          FilmModuleInvalid.make({ film: 'sounds', module: 'library.ts', reason: error.message }),
        ),
      ),
    ),
  );

export const lockManifest = (dir: string): Manifest<Lock> => ({
  file: `${dir}/library.lock.json`,
  codec: LockJson,
  empty: {},
});

export const fitFile = (dir: string, name: string): string => `${dir}/fits/${name}.json`;

export const fitsIn = Effect.fn('Library.fits')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.join(dir, 'fits');
  const unreadable = (file: string) => (error: { readonly message: string }) =>
    FitUnreadable.make({ file, reason: error.message });
  if (!(yield* fs.exists(folder).pipe(Effect.mapError(unreadable(folder)))))
    return new Map<string, SoundFit>();
  const files = (yield* fs.readDirectory(folder).pipe(Effect.mapError(unreadable(folder))))
    .filter((file) => file.endsWith('.json'))
    .toSorted();
  const fits = yield* Effect.forEach(files, (file) =>
    fs.readFileString(path.join(folder, file)).pipe(
      Effect.flatMap(Schema.decodeEffect(SoundFitJson)),
      Effect.mapError(unreadable(fitFile(dir, file.slice(0, -'.json'.length)))),
      Effect.map((fit) => [file.slice(0, -'.json'.length), fit] as const),
    ),
  );
  return new Map<string, SoundFit>(fits);
});

export type PlaceError = LayoutError;

export const placeFilm = (film: LoadedFilm): Effect.Effect<ReadonlyArray<Placed>, PlaceError> =>
  Effect.fromResult(layout(film.scenes, film.timings, film.fps));

const asFilmName = Schema.decodeSync(FilmName);

export const filmNamed = Effect.fn('FilmFolder.named')(function* (name: string) {
  const known = yield* (yield* FilmFolder).names;
  return yield* Effect.fromOption(
    Option.map(
      Arr.findFirst(known, (film) => film === name),
      asFilmName,
    ),
    () => FilmUnknown.make({ film: name, known }),
  );
});

export class Stamped extends Data.Class<{ readonly film: FilmName; readonly stamp: number }> {}

export const keptWhenMade = <A, E>(exit: Exit.Exit<A, E>): Duration.Duration =>
  Exit.match(exit, { onFailure: () => Duration.zero, onSuccess: () => Duration.infinity });

const NOT_SOURCE: ReadonlyArray<string> = ['out', 'node_modules', '.git'];

export const filmMarks = (films: string, name: string): ReadonlyArray<string> => {
  if (!isSegment(name)) return [];
  return [`${films}/${name}/scenes/index.ts`, `${films}/${name}/talk.ts`];
};

export const footageLockManifest = (dir: string): Manifest<FootageLock> => ({
  file: `${dir}/library.lock.json`,
  codec: FootageLockJson,
  empty: EMPTY_FOOTAGE_LOCK,
});

export const filmsOut = Effect.gen(function* () {
  const path = yield* Path.Path;
  return yield* Config.String('FILMS_OUT').pipe(Config.withDefault(path.resolve('out')));
});

export class FilmFolder extends Context.Service<FilmFolder, FilmFolderService>()(
  '@manna/film/tools/FilmFolder',
) {
  static readonly layer = (
    films: string,
    sounds: Option.Option<string> = Option.none(),
    footage: Option.Option<string> = Option.none(),
  ) =>
    Layer.effect(
      FilmFolder,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outputs = yield* filmsOut;

        const paths = (name: string, folder?: Segment): FilmPaths => {
          const dir = path.join(films, name, ...Option.toArray(Option.fromUndefinedOr(folder)));
          const narration = path.join(dir, 'narration');
          const sound = path.join(dir, 'sound');
          return {
            name,
            dir,
            narration,
            sound,
            out: path.join(outputs, name),
            timings: {
              file: path.join(narration, 'timings.json'),
              codec: TimingsJson,
              empty: { voice: '', scenes: {} },
            },
            manifest: {
              file: path.join(sound, 'manifest.json'),
              codec: SoundManifestJson,
              empty: {},
            },
          };
        };

        const names = fs.readDirectory(films).pipe(
          Effect.flatMap((entries) =>
            Effect.filter(entries, (name) =>
              Effect.map(
                Effect.forEach(filmMarks(films, name), (mark) =>
                  fs.exists(mark).pipe(Effect.orElseSucceed(() => false)),
                ),
                (found) => found.includes(true),
              ),
            ),
          ),
          Effect.map((found) => [...found].sort()),
          Effect.orElseSucceed((): ReadonlyArray<string> => []),
        );

        const stamp = Effect.fn('FilmFolder.stamp')(function* (film: string) {
          const dir = paths(film).dir;
          const files = yield* fs.readDirectory(dir, { recursive: true });
          const made = files.filter((f) => !NOT_SOURCE.includes(f.split('/')[0] ?? ''));
          const library = Option.match(sounds, {
            onNone: () => [],
            onSome: (at) => [path.join(at, 'library.ts'), lockManifest(at).file],
          });
          const heard = yield* Option.match(footage, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (at) =>
              fs.readDirectory(path.join(at, 'transcripts')).pipe(
                Effect.map((files) => [
                  footageLockManifest(at).file,
                  ...files.map((f) => path.join(at, 'transcripts', f)),
                ]),
                Effect.orElseSucceed(() => [footageLockManifest(at).file]),
              ),
          });
          const times = yield* Effect.forEach(
            [...made.map((f) => path.join(dir, f)), ...library, ...heard],
            (file) =>
              fs.stat(file).pipe(
                Effect.map((info) =>
                  Option.match(info.mtime, { onNone: () => 0, onSome: (d) => d.getTime() }),
                ),
                Effect.orElseSucceed(() => 0),
              ),
            { concurrency: 16 },
          );
          return Math.max(0, ...times);
        });

        return FilmFolder.of({ paths, names, sounds, footage, stamp });
      }),
    );
}

export class FilmRepo extends Context.Service<FilmRepo, FilmRepoService>()(
  '@manna/film/tools/FilmRepo',
) {
  static readonly layer = (
    films: string,
    sounds: Option.Option<string> = Option.none(),
    footage: Option.Option<string> = Option.none(),
  ) =>
    Layer.effect(
      FilmRepo,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const { paths, names, sounds, footage: footageDir } = yield* FilmFolder;
        const outputs = yield* filmsOut;

        const unknown = (film: string) =>
          Effect.flatMap(names, (known) => Effect.fail(FilmUnknown.make({ film, known })));

        const loadModule = <A, I>(film: string, file: string, schema: Schema.Codec<A, I>) =>
          Effect.tryPromise({
            try: () => importFilmModule(file),
            catch: (cause) =>
              FilmModuleInvalid.make({ film, module: path.basename(file), reason: String(cause) }),
          }).pipe(
            Effect.flatMap((module) => Schema.decodeUnknownEffect(schema)(module)),
            Effect.mapError((error) => {
              if (error._tag === 'FilmModuleInvalid') return error;
              return FilmModuleInvalid.make({
                film,
                module: path.basename(file),
                reason: error.message,
              });
            }),
          );

        const loadTalk = (name: string, at: FilmPaths) =>
          Effect.gen(function* () {
            const invalid = (reason: string) =>
              FilmModuleInvalid.make({ film: name, module: 'talk.ts', reason });
            const { talk } = yield* loadModule(name, path.join(at.dir, 'talk.ts'), TalkModule);
            const dir = yield* Effect.fromOption(footageDir, () =>
              invalid('it plays footage, but the app keeps no footage library'),
            );
            const lock = yield* store.read(footageLockManifest(dir));
            const transcripts = new Map(
              yield* Effect.forEach(talkTranscripts(talk, lock), (file) =>
                fs.readFileString(path.join(dir, 'transcripts', file)).pipe(
                  Effect.flatMap(Schema.decodeEffect(FootageTranscriptJson)),
                  Effect.map((heard) => [file, heard] as const),
                  Effect.mapError((error) =>
                    invalid(`its transcript ${file} does not read: ${error.message}`),
                  ),
                ),
              ),
            );
            const takes = yield* Effect.fromResult(talkTakes(talk, lock, transcripts)).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const cut = yield* Effect.fromResult(talkCut(talk, takes)).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const loaded: LoadedTalk = { talk, takes, cut, copies: copiesIn(outputs) };
            return loaded;
          });

        const soundIn = (name: string, at: FilmPaths) =>
          Effect.gen(function* () {
            const file = path.join(at.dir, 'sound.ts');
            if (!(yield* fs.exists(file))) return Option.none<Sound>();
            return Option.some((yield* loadModule(name, file, SoundModule)).sound);
          });

        const creditsIn = (name: string, at: FilmPaths) =>
          Effect.gen(function* () {
            const file = path.join(at.dir, 'credits.ts');
            if (!(yield* fs.exists(file))) return Option.none<ReadonlyArray<Credit>>();
            return Option.some((yield* loadModule(name, file, CreditsModule)).CREDITS);
          });

        const load = Effect.fn('FilmRepo.load')(function* (name: string, folder?: Segment) {
          if (!(yield* fs.exists(paths(name).dir))) return yield* unknown(name);
          const at = paths(name, folder);
          const ownOrFilm = (file: string) =>
            Effect.map(fs.exists(path.join(at.dir, file)), (own) =>
              path.join(
                Bool.match(own, { onTrue: () => at.dir, onFalse: () => paths(name).dir }),
                file,
              ),
            );
          if (
            Option.isNone(Option.fromUndefinedOr(folder)) &&
            !(yield* fs.exists(path.join(at.dir, 'scenes', 'index.ts'))) &&
            (yield* fs.exists(path.join(at.dir, 'talk.ts')))
          ) {
            const talk = yield* loadTalk(name, at);
            const sound = yield* soundIn(name, at);
            const loaded: LoadedFilm = {
              paths: at,
              fps: TALK_FPS,
              scenes: talk.cut.scenes,
              voice: Option.none(),
              sound,
              shorts: [],
              timings: talk.cut.timings,
              manifest: yield* store.read(at.manifest),
              heardAs: {},
              look: Option.none(),
              looks: {},
              sounds: yield* loadSounds,
              talk: Option.some(talk),
              credits: yield* creditsIn(name, at),
            };
            return loaded;
          }
          const { scenes } = yield* loadModule(
            name,
            path.join(at.dir, 'scenes', 'index.ts'),
            ScenesModule,
          );
          const { voice } = yield* loadModule(name, yield* ownOrFilm('voice.ts'), VoiceModule);
          const sound = yield* soundIn(name, at);
          const shortsFile = path.join(at.dir, 'shorts.ts');
          let shorts: Shorts = [];
          if (yield* fs.exists(shortsFile))
            shorts = (yield* loadModule(name, shortsFile, ShortsModule)).shorts;
          const timings = yield* store.read(at.timings);
          const manifest = yield* store.read(at.manifest);
          const scriptFile = path.join(at.dir, 'script.ts');
          let heardAs: HeardAs = {};
          if (yield* fs.exists(scriptFile))
            heardAs = (yield* loadModule(name, scriptFile, ScriptModule)).heardAs;
          const filmFile = path.join(at.dir, 'film.ts');
          const actsFile = path.join(at.dir, 'acts.ts');
          let look = Option.none<Look>();
          if (yield* fs.exists(filmFile))
            look = Option.fromNullishOr((yield* loadModule(name, filmFile, FilmModule)).look);
          else if (yield* fs.exists(actsFile))
            look = Option.fromNullishOr((yield* loadModule(name, actsFile, FilmModule)).look);
          const paletteFile = yield* ownOrFilm('palette.ts');
          let looks: Looks = {};
          if (yield* fs.exists(paletteFile))
            looks = Option.getOrElse(
              Option.fromUndefinedOr((yield* loadModule(name, paletteFile, PaletteModule)).looks),
              (): Looks => ({}),
            );
          const library = yield* loadSounds;
          const loaded: LoadedFilm = {
            paths: at,
            fps: (yield* loadModule(name, path.join(paths(name).dir, 'film.ts'), FilmRate)).fps,
            scenes,
            voice: Option.some(voice),
            sound,
            shorts,
            timings,
            manifest,
            heardAs,
            look,
            looks,
            sounds: library,
            talk: Option.none(),
            credits: yield* creditsIn(name, at),
          };
          return loaded;
        });

        const loadSounds = Effect.gen(function* () {
          const dir = Option.getOrElse(sounds, () => '');
          const file = path.join(dir, 'library.ts');
          if (Option.isNone(sounds) || !(yield* fs.exists(file))) return NO_SOUNDS;
          const { library } = yield* libraryModule(file);
          const lock = yield* store.read(lockManifest(dir));
          const fits = yield* fitsIn(dir).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          const { code, trials } = yield* Effect.fromResult(resolveCode(library, fits));
          const loaded: Sounds = { library, lock, dir, code, trials };
          return loaded;
        });

        const script = Effect.fn('FilmRepo.script')(function* (name: string, folder?: Segment) {
          if (!(yield* fs.exists(paths(name).dir))) return yield* unknown(name);
          const file = path.join(paths(name, folder).dir, 'script.ts');
          if (!(yield* fs.exists(file))) return Option.none<ScriptModule['script']>();
          return Option.some((yield* loadModule(name, file, ScriptModule)).script);
        });

        const sound = Effect.fn('FilmRepo.sound')(function* (name: string) {
          const at = paths(name);
          if (!(yield* fs.exists(at.dir))) return yield* unknown(name);
          return yield* soundIn(name, at);
        });

        const readScores = Effect.fn('FilmRepo.scores')(function* () {
          const found = yield* names;
          const files: Array<PrivateFile> = [];
          for (const name of found) {
            const at = paths(name);
            const manifest = yield* store.read(at.manifest);
            for (const asset of Object.values(manifest.scores ?? {}))
              files.push({
                key: scoreKey(name, asset.file),
                file: path.join(at.sound, asset.file),
                sha256: asset.sha256,
              });
          }
          const scores: Scores = { files };
          return scores;
        });
        const scores = readScores();

        return FilmRepo.of({ load, script, sound, scores });
      }),
    ).pipe(Layer.provideMerge(FilmFolder.layer(films, sounds, footage)));
}
