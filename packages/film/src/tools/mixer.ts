import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  type Result,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type Pcm, levels } from '../core/audio.ts';
import type { Placed } from '../core/layout.ts';
import {
  type BedSpan,
  type InPlace,
  MIX_RATE,
  type MixPlan,
  type MixPlanError,
  type Mixed,
  type Placement,
  type ScoreBed,
  type Take,
  mixKey,
  mixPlan,
  renderMix,
} from '../core/mix.ts';
import { repoJson } from '../core/schema.ts';
import {
  type DerivedSource,
  type Measure,
  type SoundSource,
  type Sounds,
  derivedPlayable,
  fileSource,
  heardSource,
  variantPlayable,
} from '../core/sfx.ts';
import {
  ContentStore,
  type Manifest,
  type StoreError,
  writeWhole,
  writeWholeWith,
} from './content-store.ts';
import type { CodeError } from '../core/errors.ts';
import { type FilmUnknown, type MediaFailed, TakeUnknown } from '../core/refusals.ts';
import { AudioMissing, AudioStale, type FilmModuleInvalid, SampleRateMismatch } from './errors.ts';
import {
  type FilmPaths,
  FilmRepo,
  type LoadedFilm,
  type MeasuredFilm,
  type PlaceError,
  masterFile,
  placeFilm,
  voicePiecesOf,
} from './film-repo.ts';
import { Media, type MediaService } from './media.ts';
import { SoundRender, measuredFilm } from './sound-render.ts';

export const stampFile = (paths: FilmPaths): string => `${paths.narration}/full.json`;

export const MasterStampJson = repoJson(Schema.Struct({ key: Schema.String }));

export const stampManifest = (paths: FilmPaths): Manifest<string> => ({
  file: stampFile(paths),
  codec: Schema.String,
  empty: '',
});

export interface Master {
  readonly length: number;
  readonly key: Option.Option<string>;
}

export const readMaster = (
  fs: FileSystem.FileSystem,
  media: MediaService,
  paths: FilmPaths,
): Effect.Effect<Option.Option<Master>, MediaFailed | PlatformError> =>
  Effect.gen(function* () {
    const file = masterFile(paths);
    if (!(yield* fs.exists(file))) return Option.none();
    const { seconds: length } = yield* media.timing(file);
    const key = yield* fs.readFileString(stampFile(paths)).pipe(
      Effect.flatMap(Schema.decodeEffect(MasterStampJson)),
      Effect.map((stamp) => stamp.key),
      Effect.option,
    );
    return Option.some({ length, key });
  });

export const masterFinding = (
  file: string,
  master: Option.Option<Master>,
  film: { readonly seconds: number; readonly key: Option.Option<string> },
  tolerance: number,
): Option.Option<AudioMissing | AudioStale> =>
  Option.match(master, {
    onNone: () => Option.some(AudioMissing.make({ file })),
    onSome: ({ length, key }) => {
      const stale = (reason: AudioStale['reason']) =>
        Option.some(AudioStale.make({ file, reason, length, film: film.seconds }));
      if (Math.abs(length - film.seconds) > tolerance) return stale('length');
      const another = Option.exists(film.key, (now) => !Option.contains(key, now));
      if (another) return stale('mixed for another plan');
      return Option.none();
    },
  });

interface MixOptions {
  readonly stems: boolean;
  readonly score: Option.Option<string>;
}

type MixError =
  | MixPlanError
  | PlaceError
  | FilmUnknown
  | FilmModuleInvalid
  | StoreError
  | MediaFailed
  | SampleRateMismatch
  | TakeUnknown
  | CodeError;

interface RenderOptions {
  readonly warn: boolean;
  readonly score: Option.Option<string>;
  readonly take: Option.Option<TakeInPlace>;
}

interface TakeInPlace {
  readonly sound: string;
  readonly take: string;
}

interface PlanOptions {
  readonly score: Option.Option<string>;
  readonly inPlace: Option.Option<InPlace>;
}

const inPlaceOf = (
  measure: (source: DerivedSource) => Effect.Effect<Measure>,
  sounds: Sounds,
  take: TakeInPlace,
): Effect.Effect<InPlace, TakeUnknown> => {
  const kept = Option.flatMap(Option.fromUndefinedOr(sounds.lock[take.sound]), (entry) =>
    Arr.findFirst([...entry.variants, ...entry.candidates], (v) => v.sha256 === take.take),
  );
  if (Option.isSome(kept))
    return Effect.succeed({ sound: take.sound, playable: variantPlayable(sounds, kept.value) });
  return Option.match(heardSource(sounds, take.sound, take.take), {
    onNone: () => Effect.fail(TakeUnknown.make(take)),
    onSome: (source) =>
      Effect.map(measure(source), (measured) => ({
        sound: take.sound,
        playable: derivedPlayable(source, measured),
      })),
  });
};

interface Rendered {
  readonly plan: MixPlan<Pcm>;
  readonly mixed: Mixed;
  readonly key: string;
}

interface MixerService {
  readonly mix: (film: string, options: MixOptions) => Effect.Effect<void, MixError>;
  readonly render: (
    film: string,
    options: RenderOptions,
  ) => Effect.Effect<Rendered, MixError | PlatformError>;
}

const isFile = (source: SoundSource): source is Extract<SoundSource, { readonly _tag: 'File' }> =>
  source._tag === 'File';

const decodePlan = (
  media: MediaService,
  rendered: (source: DerivedSource) => Effect.Effect<Pcm>,
  plan: MixPlan<SoundSource>,
): Effect.Effect<MixPlan<Pcm>, MediaFailed | SampleRateMismatch> => {
  const decodeAt = (source: SoundSource): Effect.Effect<Pcm, MediaFailed | SampleRateMismatch> => {
    if (source._tag !== 'File') return rendered(source);
    return Effect.filterOrFail(
      media.decode(source.file),
      (pcm) => pcm.rate === MIX_RATE,
      (pcm) => SampleRateMismatch.make({ file: source.file, rate: pcm.rate, expected: MIX_RATE }),
    );
  };
  const place = (p: Placement<SoundSource>) =>
    Effect.map(decodeAt(p.sound), (sound): Placement<Pcm> => ({ ...p, sound }));
  const read = (take: Take<SoundSource>) =>
    Effect.map(decodeAt(take.sound), (sound): Take<Pcm> => ({ ...take, sound }));
  const lay = (score: ScoreBed<SoundSource>) =>
    Effect.map(decodeAt(score.sound), (sound): ScoreBed<Pcm> => ({ ...score, sound }));
  const span = (bed: BedSpan<SoundSource>) =>
    Effect.map(decodeAt(bed.sound), (sound): BedSpan<Pcm> => ({ ...bed, sound }));
  const voiceFiles = [
    ...new Set(
      plan.voice
        .map((t) => t.sound)
        .filter(isFile)
        .map((s) => s.file),
    ),
  ];
  return Effect.gen(function* () {
    const once = new Map(
      yield* Effect.forEach(
        voiceFiles,
        (file) => Effect.map(decodeAt(fileSource(file)), (pcm) => [file, pcm] as const),
        { concurrency: 4 },
      ),
    );
    const readOnce = (take: Take<SoundSource>) =>
      Option.match(
        Option.flatMap(Option.liftPredicate(take.sound, isFile), (s) =>
          Option.fromUndefinedOr(once.get(s.file)),
        ),
        {
          onNone: () => read(take),
          onSome: (sound) => Effect.succeed<Take<Pcm>>({ ...take, sound }),
        },
      );
    const decoded: MixPlan<Pcm> = {
      ...plan,
      voice: yield* Effect.forEach(plan.voice, readOnce, { concurrency: 4 }),
      score: yield* Effect.transposeOption(Option.map(plan.score, lay)),
      beds: yield* Effect.forEach(plan.beds, span, { concurrency: 4 }),
      effects: yield* Effect.forEach(plan.effects, place, { concurrency: 4 }),
    };
    return decoded;
  });
};

const presentOnly = (
  exists: (file: string) => Effect.Effect<boolean, PlatformError>,
  plan: MixPlan<SoundSource>,
): Effect.Effect<MixPlan<SoundSource>, PlatformError> =>
  Effect.gen(function* () {
    const absent = new Set<string>();
    const sources = [
      ...Option.toArray(Option.map(plan.score, (s) => s.sound)),
      ...plan.beds.map((b) => b.sound),
      ...plan.effects.map((e) => e.sound),
    ];
    for (const source of sources)
      if (source._tag === 'File' && !absent.has(source.file) && !(yield* exists(source.file)))
        absent.add(source.file);
    const here = (source: SoundSource) => source._tag !== 'File' || !absent.has(source.file);
    return {
      ...plan,
      score: Option.filter(plan.score, (s) => here(s.sound)),
      beds: plan.beds.filter((b) => here(b.sound)),
      effects: plan.effects.filter((e) => here(e.sound)),
      warnings: [
        ...plan.warnings,
        ...[...absent].map((file) => `mix.missing file=${file} hint="run sfx pull"`),
      ],
    };
  });

export const planOf = (
  film: MeasuredFilm,
  placed: ReadonlyArray<Placed>,
  options: PlanOptions,
): Result.Result<MixPlan<SoundSource>, MixPlanError> =>
  mixPlan({
    film: film.paths.name,
    placed,
    sound: film.sound,
    manifest: film.manifest,
    sounds: film.sounds,
    narration: film.paths.narration,
    soundDir: film.paths.sound,
    play: options.score,
    inPlace: options.inPlace,
    pieces: voicePiecesOf(film),
  });

const filmPlan = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  options: PlanOptions,
): Effect.Effect<
  MixPlan<SoundSource>,
  MixPlanError | PlatformError,
  FileSystem.FileSystem | SoundRender
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const measured = yield* measuredFilm(film);
    const planned = yield* Effect.fromResult(planOf(measured, placed, options));
    return yield* presentOnly((file) => fs.exists(file), planned);
  });

export const planKey = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | SoundRender> =>
  filmPlan(film, placed, { score: Option.none(), inPlace: Option.none() }).pipe(
    Effect.map(mixKey),
    Effect.option,
  );

interface Bus {
  readonly bus: string;
  readonly pcm: Pcm;
}

const db = (value: number) =>
  Option.match(Option.liftPredicate(value, Number.isFinite), {
    onNone: () => '-inf',
    onSome: (finite) => finite.toFixed(1),
  });

export class Mixer extends Context.Service<Mixer, MixerService>()('@manna/film/tools/Mixer') {
  static readonly layer = Layer.effect(
    Mixer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repo = yield* FilmRepo;
      const media = yield* Media;
      const store = yield* ContentStore;
      const made = yield* SoundRender;

      const writeWav = (file: string, pcm: Pcm) =>
        writeWhole(fs, file, (partial) => media.writeWav(partial, pcm));

      const renderFilm = Effect.fn('Mixer.render')(function* (
        film: LoadedFilm,
        options: RenderOptions,
      ) {
        const placed = yield* placeFilm(film);
        const inPlace = yield* Effect.transposeOption(
          Option.map(options.take, (take) => inPlaceOf(made.measure, film.sounds, take)),
        );
        const present = yield* filmPlan(film, placed, { score: options.score, inPlace }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(SoundRender, made),
        );
        if (options.warn) for (const warning of present.warnings) yield* Effect.logWarning(warning);
        const plan = yield* decodePlan(media, made.pcm, present);
        const rendered: Rendered = { plan, mixed: renderMix(plan), key: mixKey(present) };
        return rendered;
      });

      const render = (name: string, options: RenderOptions) =>
        Effect.flatMap(repo.load(name), (film) => renderFilm(film, options));

      const mix = Effect.fn('Mixer.mix')(function* (name: string, options: MixOptions) {
        const film = yield* repo.load(name);
        const { plan, mixed, key } = yield* renderFilm(film, {
          warn: true,
          score: options.score,
          take: Option.none(),
        });
        const option = Option.map(plan.score, (s) => s.option);
        const music = Option.match(option, {
          onNone: () => 'music',
          onSome: (o) => `music.${o}`,
        });
        const buses: ReadonlyArray<Bus> = [
          { bus: 'voice', pcm: mixed.voice },
          ...Option.toArray(Option.map(mixed.music, (pcm) => ({ bus: music, pcm }))),
          ...Option.toArray(Option.map(mixed.beds, (pcm) => ({ bus: 'beds', pcm }))),
          ...Option.toArray(Option.map(mixed.effects, (pcm) => ({ bus: 'effects', pcm }))),
        ];
        for (const { bus, pcm } of [{ bus: 'master', pcm: mixed.master }, ...buses]) {
          const { mean, peak } = levels(pcm);
          yield* Effect.log(`mix.levels bus=${bus} mean=${db(mean)}dB peak=${db(peak)}dB`);
        }
        yield* Effect.log(`mix.master gain=${mixed.masterGain.toFixed(1)}dB`);

        const master = masterFile(film.paths);
        const stamp = yield* Effect.orDie(Schema.encodeEffect(MasterStampJson)({ key }));
        yield* fs.makeDirectory(film.paths.narration, { recursive: true });
        yield* writeWholeWith(
          fs,
          master,
          (partial) => media.writeWav(partial, mixed.master),
          (partial) =>
            store.transact(stampManifest(film.paths), () =>
              Effect.as(fs.rename(partial, master), [master, stamp] as const),
            ),
        );
        if (options.stems) {
          const dir = `${film.paths.out}/stems`;
          yield* fs.makeDirectory(dir, { recursive: true });
          yield* Effect.forEach(buses, ({ bus, pcm }) => writeWav(`${dir}/${bus}.wav`, pcm), {
            discard: true,
          });
          yield* Effect.log(`mix.stems names=${buses.map(({ bus }) => bus).join(',')} dir=${dir}`);
        }
        yield* Effect.log(
          `mix.track takes=${plan.voice.length} score=${Option.getOrElse(option, () => 'none')} beds=${plan.beds.length} effects=${plan.effects.length} secs=${plan.seconds.toFixed(1)} file=${master}`,
        );
      });

      return Mixer.of({ mix, render });
    }),
  );
}
