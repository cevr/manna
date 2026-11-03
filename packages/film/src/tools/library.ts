import {
  Array as Arr,
  Config,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Record as Rec,
  Result,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type Pcm, concat, gain, silence, slice } from '../core/audio.ts';
import { bedWrapAt } from '../core/mix.ts';
import {
  AUDIO_FILE,
  type Generated,
  type Library,
  type LibraryEntry,
  type Lock,
  type LockEntry,
  type DerivedSource,
  type MakeJob,
  type Playable,
  SFX_FORMAT,
  SFX_MODEL,
  type MeasuredSounds,
  type SoundSource,
  type SoundUse,
  type Sounds,
  type Trial,
  type SoundFit,
  SoundFitJson,
  type Variant,
  type VariantTiming,
  creditsOf,
  derivedPlayable,
  trialEntry,
  trialSources,
  influenceOf,
  gainFor,
  isDerived,
  isKeptFit,
  levelOf,
  lockLoudness,
  lockTiming,
  makePlan,
  pendingOf,
  playablesOf,
  requestKey,
  resolveSound,
  seedSource,
  soundState,
} from '../core/sfx.ts';
import { describeSound } from '../core/synth/analyse.ts';
import { type Profile, profileOf } from '../core/synth/compare.ts';
import { type FitSize, type Fitted, fitSound } from '../core/synth/fit/fit.ts';
import { EarshotModelJson } from '../core/synth/fit/model.ts';
import { loudness } from '../core/synth/loudness.ts';
import type { ResolvedSound } from '../core/synth/graph/plan.ts';
import { type ResolvedTrial, resolveCode } from '../core/synth/resolve.ts';
import { loopSeam, seamHeard, seamScore } from '../core/synth/seam.ts';
import { type Mark, sheetOf } from '../core/synth/sheet.ts';
import { TAKE_LEVEL } from '../core/recording.ts';
import { toMs } from '../core/time.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex, sha256OfFile } from './digest.ts';
import { Earshot } from './earshot.ts';
import { ElevenLabs } from './elevenlabs.ts';
import type { CodeError, CodeTooLong, UnknownSound } from '../core/errors.ts';
import { ElevenLabsFailed, type MediaFailed, TakeUnknown } from '../core/refusals.ts';
import {
  type ApiKeyMissing,
  CandidateMissing,
  CodeTrialMissing,
  type EarshotFailed,
  type EarshotMissing,
  FitModelInvalid,
  FitRefused,
  CreditsOverCap,
  type FilmModuleInvalid,
  LibraryMissing,
  LoopSeam,
  PaidUnconfirmed,
  SoundCorrupt,
  SoundFileMissing,
  TimingUnrecorded,
  SoundKindMismatch,
  CutEmpty,
  SoundLicence,
  ChangeUnsaid,
  SoundStale,
  SoundUnmade,
  StoreCopyFailed,
  type StoreFailed,
  TrialInvalid,
  VariantMissing,
} from './errors.ts';
import { filmsOut, fitFile, fitsIn, libraryModule, lockManifest } from './film-repo.ts';
import { Media } from './media.ts';
import { settleAll } from './settle.ts';
import {
  type MediaStoreService,
  type PrivateFile,
  type Scores,
  expandHome,
} from './media-store.ts';
import { PrivateStore, type StoreUnavailable } from './private-store.ts';
import type { FlagRule } from './render-plan.ts';
import { SoundRender } from './sound-render.ts';

interface SoundsPaths {
  readonly dir: string;
  readonly module: string;
  readonly lock: Manifest<Lock>;
  readonly files: string;
  readonly public: string;
  readonly out: string;
}

export interface LoadedLibrary {
  readonly paths: SoundsPaths;
  readonly library: Library;
  readonly lock: Lock;
  readonly code: ReadonlyMap<string, ResolvedSound>;
  readonly trials: ReadonlyMap<string, ResolvedTrial>;
}

const soundsOf = (loaded: LoadedLibrary): Sounds => ({
  library: loaded.library,
  lock: loaded.lock,
  dir: loaded.paths.dir,
  code: loaded.code,
  trials: loaded.trials,
});

export const channelsFor = (samples: number, rate: number, secs: number): Option.Option<number> => {
  const ratio = samples / (rate * secs);
  return Option.fromUndefinedOr([1, 2].find((n) => Math.abs(ratio / n - 1) <= 0.1));
};

export const pcmFromS16 = (bytes: Uint8Array, rate: number, channels: number): Pcm => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(bytes.byteLength / 2 / channels);
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++)
    for (const [c, plane] of planes.entries())
      plane[i] = view.getInt16((i * channels + c) * 2, true) / 32768;
  return { rate, frames, channels: planes };
};

const trimQuiet = (pcm: Pcm, floor: number, pad: number): Pcm => {
  const threshold = 10 ** (floor / 20);
  const loud = (i: number) => pcm.channels.some((plane) => Math.abs(plane[i] ?? 0) > threshold);
  let first = 0;
  while (first < pcm.frames && !loud(first)) first++;
  let last = pcm.frames - 1;
  while (last > first && !loud(last)) last--;
  if (first >= pcm.frames) return pcm;
  const from = Math.max(0, first - Math.round(pad * pcm.rate));
  const to = Math.min(pcm.frames, last + 1 + Math.round(pad * pcm.rate));
  return slice(pcm, from, to - from);
};

const TRIM_FLOOR = -60;
const TRIM_PAD = 0.01;

interface SourceCut {
  readonly from: number;
  readonly to: number;
}

export const IMPORT_RULES: ReadonlyArray<FlagRule> = [
  ['from', 'needs', 'to', 'a cut names both its ends'],
  ['to', 'needs', 'from', 'a cut names both its ends'],
];

const CUT_LEAD = 0.2;
const CUT_STEP = 2;

const autoCut = (pcm: Pcm, use: SoundUse, secs: number): Option.Option<SourceCut> => {
  const length = pcm.frames / pcm.rate;
  if (length <= secs) return Option.none();
  if (use === 'one-shot') {
    const from = Math.max(0, describeSound(pcm).hit - CUT_LEAD * secs);
    return Option.some({ from, to: Math.min(length, from + secs) });
  }
  const first = Number(length > secs + 2 * CUT_STEP) * CUT_STEP;
  const offsets = Arr.makeBy(
    Math.floor((length - secs - first) / CUT_STEP) + 1,
    (i) => first + i * CUT_STEP,
  );
  const scored = offsets.map((from) => ({
    from,
    score: seamScore(loopSeam(cutOf(pcm, { from, to: from + secs }))),
  }));
  return Option.map(
    Arr.head(
      Arr.sort(
        scored,
        Order.mapInput(Order.Number, (c: { readonly score: number }) => c.score),
      ),
    ),
    ({ from }) => ({ from, to: from + secs }),
  );
};

const clipCut = (pcm: Pcm, cut: SourceCut): Option.Option<SourceCut> => {
  const from = Math.min(pcm.frames, Math.max(0, Math.round(cut.from * pcm.rate)));
  const to = Math.min(pcm.frames, Math.round(cut.to * pcm.rate));
  if (to <= from) return Option.none();
  return Option.some({ from: from / pcm.rate, to: to / pcm.rate });
};

const cutOf = (pcm: Pcm, cut: SourceCut): Pcm => {
  const from = Math.min(pcm.frames, Math.max(0, Math.round(cut.from * pcm.rate)));
  const to = Math.min(pcm.frames, Math.max(from, Math.round(cut.to * pcm.rate)));
  return slice(pcm, from, to - from);
};

interface Levelled {
  readonly pcm: Pcm;
  readonly gain: number;
}

const levelOvers = (pcm: Pcm): Levelled => {
  const over = loudness(pcm).peak - TAKE_LEVEL.ceiling;
  if (!(over > 0)) return { pcm, gain: 0 };
  return { pcm: gain(pcm, -over), gain: -over };
};

interface Imported {
  readonly variant: Variant;
  readonly cut: Option.Option<SourceCut>;
  readonly gain: number;
  readonly rumble: number;
}

const AUDITION_GAP = 0.5;

const AB_BETWEEN = 1;

const CLIP_BED_SECS = 8;
const CLIP_BED_FADE = 0.25;

const LIBRARY_RATE = 44100;

export const talliedCredits = (text: string): number =>
  text
    .split('\n')
    .slice(1)
    .map((line) => Number(line.split('\t')[3]))
    .filter(Number.isFinite)
    .reduce((sum, credits) => sum + credits, 0);

export const TALLY_HEADER = 'name\tvariant\tseconds\tcredits\n';

interface MakeOptions extends SpendOptions {
  readonly names: Option.Option<ReadonlySet<string>>;
  readonly force: boolean;
}

interface Measured {
  readonly label: string;
  readonly profile: Profile;
}

export interface Comparison {
  readonly plays: Arr.NonEmptyReadonlyArray<Measured>;
  readonly trial: Arr.NonEmptyReadonlyArray<Measured>;
}

const playableLabel = (p: Playable, index: number): string => {
  if (p.source._tag === 'File') return `take ${index + 1}`;
  return `seed ${p.source.seed}`;
};

interface RenderWhich {
  readonly seed: Option.Option<number>;
  readonly trial: boolean;
  readonly sheet: boolean;
}

export type AuditionOf = 'plays' | 'candidates' | 'trial';

interface Block {
  readonly pcm: Pcm;
  readonly marks: ReadonlyArray<Mark>;
}

const lineUpOf = (blocks: ReadonlyArray<{ readonly block: Block; readonly gap: number }>) => {
  const parts: Array<Pcm> = [];
  const marks: Array<Mark> = [];
  let frames = 0;
  for (const { block, gap } of blocks) {
    const silent = silence(LIBRARY_RATE, Math.round(gap * LIBRARY_RATE), 1);
    const at = frames / LIBRARY_RATE;
    marks.push(...block.marks.map((mark) => ({ ...mark, at: at + mark.at })));
    parts.push(block.pcm, silent);
    frames += block.pcm.frames + silent.frames;
  }
  return { pcm: concat(LIBRARY_RATE, 1, parts), marks };
};

const spaced = (blocks: ReadonlyArray<Block>, last: number) =>
  blocks.map((block, i) => {
    if (i === blocks.length - 1) return { block, gap: last };
    return { block, gap: AUDITION_GAP };
  });

const clipped = (entry: LibraryEntry, pcm: Pcm): Pcm => {
  const frames = Math.round(CLIP_BED_SECS * pcm.rate);
  if (entry.use !== 'bed' || pcm.frames <= frames) return pcm;
  const fade = Math.round(CLIP_BED_FADE * pcm.rate);
  return {
    rate: pcm.rate,
    frames,
    channels: pcm.channels.map((plane) => {
      const cut = plane.slice(0, frames);
      for (let i = 0; i < fade; i++) cut[frames - 1 - i] = (cut[frames - 1 - i] ?? 0) * (i / fade);
      return cut;
    }),
  };
};

const momentMarks = (at: { readonly onset: number; readonly hit: number }): ReadonlyArray<Mark> => [
  { kind: 'onset', at: at.onset },
  { kind: 'hit', at: at.hit },
];

const renderMarks = (entry: LibraryEntry, pcm: Pcm): ReadonlyArray<Mark> => {
  if (entry.use === 'bed') return [{ kind: 'loop', at: bedWrapAt(pcm.frames / pcm.rate) }];
  return momentMarks(describeSound(pcm));
};

const clipMarks = (entry: LibraryEntry, p: Playable, pcm: Pcm): ReadonlyArray<Mark> => {
  if (entry.use === 'bed') return [];
  return momentMarks(
    Option.getOrElse(Option.all({ onset: p.onset, hit: p.hit }), () => describeSound(pcm)),
  );
};

interface SpendOptions {
  readonly yes: boolean;
  readonly cap: Option.Option<number>;
  readonly tally: Option.Option<string>;
}

type LibraryFinding =
  | SoundUnmade
  | SoundStale
  | SoundFileMissing
  | SoundCorrupt
  | SoundLicence
  | ChangeUnsaid
  | LoopSeam
  | TimingUnrecorded;

export const libraryLevel = (finding: LibraryFinding): 'error' | 'warning' => {
  switch (finding._tag) {
    case 'SoundFileMissing':
    case 'SoundCorrupt':
    case 'SoundLicence':
    case 'ChangeUnsaid':
      return 'error';
    default:
      return 'warning';
  }
};

type LibraryError = LibraryMissing | FilmModuleInvalid | StoreError | CodeError;

type MakeError =
  | LibraryError
  | CreditsOverCap
  | PaidUnconfirmed
  | ElevenLabsFailed
  | ApiKeyMissing
  | MediaFailed
  | PlatformError;

interface FitRequest {
  readonly size: FitSize;
  readonly from: Option.Option<string>;
}

interface Fit {
  readonly file: string;
  readonly model: string;
  readonly fitted: Fitted;
}

const FIT_SEEDS = 3;

interface PushReport {
  readonly sent: ReadonlyArray<string>;
  readonly had: number;
  readonly missing: ReadonlyArray<string>;
  readonly total: number;
}

interface PullReport {
  readonly fetched: number;
  readonly had: number;
  readonly missing: ReadonlyArray<string>;
}

interface SoundLibraryService {
  readonly paths: SoundsPaths;
  readonly load: Effect.Effect<LoadedLibrary, LibraryError>;
  readonly plan: (
    names: Option.Option<ReadonlySet<string>>,
    force: boolean,
  ) => Effect.Effect<ReadonlyArray<MakeJob>, LibraryError>;
  readonly make: (options: MakeOptions) => Effect.Effect<ReadonlyArray<Variant>, MakeError>;
  readonly trial: (
    name: string,
    trial: Trial,
    count: number,
    options: SpendOptions,
  ) => Effect.Effect<
    ReadonlyArray<Variant>,
    MakeError | UnknownSound | SoundKindMismatch | TrialInvalid
  >;
  readonly takesAt: (
    name: string,
    picks: ReadonlyArray<number>,
    among: 'candidates' | 'kept',
  ) => Effect.Effect<
    ReadonlyArray<string>,
    LibraryError | UnknownSound | SoundKindMismatch | CandidateMissing | VariantMissing
  >;
  readonly keep: (
    name: string,
    takes: ReadonlyArray<string>,
    replace?: boolean,
  ) => Effect.Effect<LockEntry, LibraryError | UnknownSound | SoundKindMismatch | TakeUnknown>;
  readonly unkeep: (
    name: string,
    takes: ReadonlyArray<string>,
  ) => Effect.Effect<LockEntry, LibraryError | UnknownSound | SoundKindMismatch | TakeUnknown>;
  readonly reject: (
    name: string,
    takes: ReadonlyArray<string>,
  ) => Effect.Effect<LockEntry, LibraryError | UnknownSound | SoundKindMismatch | TakeUnknown>;
  readonly importFile: (
    file: string,
    name: string,
    cut: Option.Option<SourceCut>,
  ) => Effect.Effect<
    Imported,
    LibraryError | UnknownSound | SoundKindMismatch | CutEmpty | MediaFailed | PlatformError
  >;
  readonly audition: (
    name: string,
    of: AuditionOf,
  ) => Effect.Effect<
    string,
    LibraryError | UnknownSound | CodeTrialMissing | MediaFailed | PlatformError
  >;
  readonly render: (
    name: string,
    which: RenderWhich,
  ) => Effect.Effect<
    ReadonlyArray<string>,
    LibraryError | UnknownSound | SoundKindMismatch | CodeTrialMissing | MediaFailed | PlatformError
  >;
  readonly compare: (
    name: string,
  ) => Effect.Effect<
    Comparison,
    LibraryError | UnknownSound | CodeTrialMissing | SoundUnmade | MediaFailed
  >;
  readonly ab: (
    name: string,
    out: string,
  ) => Effect.Effect<
    ReadonlyArray<string>,
    LibraryError | UnknownSound | SoundUnmade | MediaFailed | PlatformError
  >;
  readonly fit: (
    name: string,
    request: FitRequest,
  ) => Effect.Effect<
    Fit,
    | LibraryError
    | UnknownSound
    | FitRefused
    | SoundUnmade
    | FitModelInvalid
    | CodeTooLong
    | EarshotMissing
    | EarshotFailed
    | MediaFailed
    | PlatformError
  >;
  readonly describe: Effect.Effect<number, LibraryError | MediaFailed | PlatformError>;
  readonly check: Effect.Effect<
    ReadonlyArray<LibraryFinding>,
    LibraryError | MediaFailed | PlatformError
  >;
  readonly pull: (
    scores: Scores,
  ) => Effect.Effect<PullReport, LibraryError | PlatformError | StoreFailed | StoreUnavailable>;
  readonly push: (
    scores: Scores,
    from: Option.Option<string>,
  ) => Effect.Effect<
    PushReport,
    LibraryError | PlatformError | StoreCopyFailed | StoreFailed | StoreUnavailable
  >;
}

const timingOf = (v: Variant) =>
  Option.all({ onset: Option.fromUndefinedOr(v.onset), hit: Option.fromUndefinedOr(v.hit) });

const everyVariant = (lock: Lock) =>
  Object.entries(lock).flatMap(([name, entry]) =>
    [...entry.variants, ...entry.candidates].map((variant) => ({ name, variant })),
  );

const picked = <E>(
  offered: ReadonlyArray<Variant>,
  picks: ReadonlyArray<number>,
  missing: (index: number, count: number) => E,
): Effect.Effect<ReadonlyArray<Variant>, E> =>
  Effect.forEach(picks, (n) =>
    Option.match(
      Option.liftPredicate(n, (k) => k >= 1 && k <= offered.length),
      {
        onNone: () => Effect.fail(missing(n, offered.length)),
        onSome: (k) => Effect.succeed(Arr.getUnsafe(offered, k - 1)),
      },
    ),
  );

const byHash = (
  name: string,
  offered: ReadonlyArray<Variant>,
  takes: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Variant>, TakeUnknown> =>
  Result.all(
    takes.map((take) =>
      Result.fromOption(
        Arr.findFirst(offered, (v) => v.sha256 === take),
        () => TakeUnknown.make({ sound: name, take }),
      ),
    ),
  );

const emptyEntry: LockEntry = { variants: [], candidates: [], rejected: [] };

export class SoundLibrary extends Context.Service<SoundLibrary, SoundLibraryService>()(
  '@manna/film/tools/SoundLibrary',
) {
  static readonly layer = (dir: string) =>
    Layer.effect(
      SoundLibrary,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const media = yield* Media;
        const elevenLabs = yield* ElevenLabs;
        const earshot = yield* Earshot;
        const privateStore = yield* PrivateStore;
        const made = yield* SoundRender;
        const outputs = yield* filmsOut;
        const home = yield* Config.String('HOME').pipe(Config.withDefault('~'));

        const paths: SoundsPaths = {
          dir,
          module: path.join(dir, 'library.ts'),
          lock: lockManifest(dir),
          files: path.join(dir, 'files'),
          public: path.join(dir, 'public'),
          out: path.join(outputs, 'sounds'),
        };

        const loadLibrary = Effect.fn('SoundLibrary.load')(function* () {
          if (!(yield* fs.exists(paths.module)))
            return yield* LibraryMissing.make({ file: paths.module });
          const declared = yield* libraryModule(paths.module);
          const lock = yield* store.read(paths.lock);
          const fits = yield* fitsIn(dir).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          const { code, trials } = yield* Effect.fromResult(resolveCode(declared.library, fits));
          const loaded: LoadedLibrary = { paths, library: declared.library, lock, code, trials };
          return loaded;
        });
        const load = loadLibrary();

        const entryOf = (loaded: LoadedLibrary, name: string) =>
          Effect.fromResult(resolveSound(loaded.library, name));

        const plan = Effect.fn('SoundLibrary.plan')(function* (
          names: Option.Option<ReadonlySet<string>>,
          force: boolean,
        ) {
          const loaded = yield* load;
          return makePlan(loaded.library, loaded.lock, names, force);
        });

        const now = Effect.map(DateTime.now, DateTime.formatIso);

        const generate = (
          name: string,
          entry: Generated,
          credits: number,
          tally: Option.Option<string>,
        ) =>
          Effect.gen(function* () {
            const folder = path.join(paths.files, name);
            yield* fs.makeDirectory(folder, { recursive: true });
            const raw = yield* fs.makeTempFileScoped({ directory: folder, prefix: '.candidate-' });
            yield* elevenLabs.soundEffect(
              {
                prompt: entry.prompt,
                secs: entry.secs,
                influence: influenceOf(entry),
                loop: entry.loop === true,
                model: SFX_MODEL,
                format: SFX_FORMAT,
              },
              raw,
            );
            const bytes = yield* fs.readFile(raw);
            const channels = yield* Effect.fromOption(
              channelsFor(bytes.byteLength / 2, LIBRARY_RATE, entry.secs),
              () =>
                ElevenLabsFailed.make({
                  op: 'sfx',
                  exitCode: 0,
                  reason: `${bytes.byteLength} bytes of ${SFX_FORMAT} for ${entry.secs} s: neither mono nor stereo`,
                }),
            );
            const pcm = pcmFromS16(bytes, LIBRARY_RATE, channels);
            const variant = yield* keepFile(name, pcm, 'files', {
              request: requestKey(entry),
              model: SFX_MODEL,
              format: SFX_FORMAT,
              licence: 'elevenlabs-paid-sfx',
              credits,
            });
            yield* store.update(paths.lock, (lock) => {
              const had = Option.getOrElse(Option.fromUndefinedOr(lock[name]), () => emptyEntry);
              return { ...lock, [name]: { ...had, candidates: [...had.candidates, variant] } };
            });
            yield* Option.match(tally, {
              onNone: () => Effect.void,
              onSome: (file) =>
                fs.writeFileString(
                  file,
                  `${name}\t${variant.sha256.slice(0, 12)}\t${variant.secs.toFixed(3)}\t${credits}\n`,
                  { flag: 'a' },
                ),
            });
            yield* Effect.log(
              `sfx.made name=${name} file=${variant.file} secs=${variant.secs.toFixed(2)} influence=${influenceOf(entry)} channels=${channels} credits=${credits} momentary=${variant.loudness.momentaryMax}`,
            );
            return variant;
          }).pipe(Effect.scoped);

        const keepFile = (
          name: string,
          pcm: Pcm,
          under: 'files' | 'public',
          made: Pick<Variant, 'request' | 'model' | 'format' | 'licence' | 'credits'>,
        ) =>
          Effect.gen(function* () {
            const bytes = yield* media.encodeFlac(pcm);
            const hash = sha256Hex(bytes);
            const file = `${under}/${name}/${hash.slice(0, 12)}.flac`;
            yield* store.writeFile(path.join(dir, file), bytes);
            const variant: Variant = {
              ...made,
              file,
              sha256: hash,
              made: yield* now,
              secs: toMs(pcm.frames / pcm.rate),
              loudness: lockLoudness(loudness(pcm)),
              ...lockTiming(describeSound(pcm)),
            };
            return variant;
          });

        const make = Effect.fn('SoundLibrary.make')(function* (options: MakeOptions) {
          const loaded = yield* load;
          return yield* spend(
            makePlan(loaded.library, loaded.lock, options.names, options.force),
            options,
          );
        });

        const trial = Effect.fn('SoundLibrary.trial')(function* (
          name: string,
          settings: Trial,
          count: number,
          options: SpendOptions,
        ) {
          const loaded = yield* load;
          const declared = yield* entryOf(loaded, name);
          if (declared.kind !== 'generated')
            return yield* SoundKindMismatch.make({
              name,
              kind: declared.kind,
              wanted: 'generated',
            });
          const entry = yield* Effect.mapError(
            Effect.fromResult(trialEntry(declared, settings)),
            (issue) => TrialInvalid.make({ name, reason: String(issue) }),
          );
          yield* Effect.log(
            `sfx.trial name=${name} secs=${entry.secs} influence=${influenceOf(entry)} count=${count} prompt="${entry.prompt}"`,
          );
          return yield* spend([{ name, entry, count, credits: count * creditsOf(entry) }], options);
        });

        const spend = Effect.fn('SoundLibrary.spend')(function* (
          jobs: ReadonlyArray<MakeJob>,
          options: SpendOptions,
        ) {
          const credits = jobs.reduce((sum, job) => sum + job.credits, 0);
          for (const job of jobs)
            yield* Effect.log(
              `sfx.plan name=${job.name} candidates=${job.count} credits=${job.credits}`,
            );
          yield* Effect.log(`sfx.plan sounds=${jobs.length} credits=${credits}`);
          if (jobs.length === 0) return [];
          const spent = yield* Option.match(options.tally, {
            onNone: () => Effect.succeed(0),
            onSome: (file) =>
              Effect.gen(function* () {
                if (!(yield* fs.exists(file))) yield* fs.writeFileString(file, TALLY_HEADER);
                return talliedCredits(yield* fs.readFileString(file));
              }),
          });
          yield* Option.match(options.cap, {
            onNone: () => Effect.void,
            onSome: (cap) =>
              Effect.when(
                Effect.fail(CreditsOverCap.make({ credits: spent + credits, cap })),
                Effect.succeed(spent + credits > cap),
              ),
          });
          if (!options.yes) return yield* PaidUnconfirmed.make({ credits });
          yield* elevenLabs.apiKey;
          const each = jobs.flatMap((job) =>
            Array.from({ length: job.count }, () => ({ job, credits: job.credits / job.count })),
          );
          return yield* settleAll(
            each,
            ({ job, credits: cost }) => generate(job.name, job.entry, cost, options.tally),
            2,
          );
        });

        const curatable = (name: string, entry: LibraryEntry) => {
          if (isDerived(entry))
            return Effect.fail(
              SoundKindMismatch.make({ name, kind: entry.kind, wanted: 'generated or recorded' }),
            );
          return Effect.succeed(entry);
        };

        const offeredIn = (
          entry: LibraryEntry,
          record: Option.Option<LockEntry>,
          among: 'candidates' | 'kept',
        ): ReadonlyArray<Variant> => {
          if (among === 'candidates') return pendingOf(entry, record);
          return Option.match(record, { onNone: () => [], onSome: (r) => r.variants });
        };

        const takesAt = Effect.fn('SoundLibrary.takesAt')(function* (
          name: string,
          picks: ReadonlyArray<number>,
          among: 'candidates' | 'kept',
        ) {
          const loaded = yield* load;
          const entry = yield* curatable(name, yield* entryOf(loaded, name));
          const offered = offeredIn(entry, Option.fromUndefinedOr(loaded.lock[name]), among);
          const chosen = yield* picked<CandidateMissing | VariantMissing>(
            offered,
            picks,
            (index, count) => {
              if (among === 'candidates')
                return CandidateMissing.make({ name, index, candidates: count });
              return VariantMissing.make({ name, index, variants: count });
            },
          );
          return chosen.map((v) => v.sha256);
        });

        const curate = (
          name: string,
          takes: ReadonlyArray<string>,
          among: 'candidates' | 'kept',
          change: (had: LockEntry, chosen: ReadonlyArray<Variant>, request: string) => LockEntry,
        ) =>
          Effect.gen(function* () {
            const loaded = yield* load;
            const entry = yield* curatable(name, yield* entryOf(loaded, name));
            const next = yield* store.modify(paths.lock, (lock) => {
              const record = Option.fromUndefinedOr(lock[name]);
              const had = Option.getOrElse(record, () => emptyEntry);
              return Result.map(
                byHash(name, offeredIn(entry, record, among), takes),
                (chosen): Lock => ({ ...lock, [name]: change(had, chosen, requestKey(entry)) }),
              );
            });
            return Option.getOrElse(Option.fromUndefinedOr(next[name]), () => emptyEntry);
          });

        const without = (list: ReadonlyArray<Variant>, drop: ReadonlyArray<Variant>) =>
          list.filter((v) => !drop.some((d) => d.sha256 === v.sha256));

        const keep = Effect.fn('SoundLibrary.keep')(function* (
          name: string,
          takes: ReadonlyArray<string>,
          replace = false,
        ) {
          return yield* curate(name, takes, 'candidates', (had, chosen, request) => {
            const current = had.variants.filter((v) => v.request === request);
            if (!replace)
              return {
                variants: [...current, ...chosen],
                candidates: without(had.candidates, chosen),
                rejected: had.rejected,
              };
            return {
              variants: chosen,
              candidates: [...without(had.candidates, chosen), ...current],
              rejected: had.rejected,
            };
          });
        });

        const unkeep = Effect.fn('SoundLibrary.unkeep')(function* (
          name: string,
          takes: ReadonlyArray<string>,
        ) {
          return yield* curate(name, takes, 'kept', (had, chosen) => ({
            variants: without(had.variants, chosen),
            candidates: [...had.candidates, ...chosen],
            rejected: had.rejected,
          }));
        });

        const reject = Effect.fn('SoundLibrary.reject')(function* (
          name: string,
          takes: ReadonlyArray<string>,
        ) {
          return yield* curate(name, takes, 'candidates', (had, chosen) => ({
            variants: had.variants,
            candidates: without(had.candidates, chosen),
            rejected: [...had.rejected, ...chosen.map((v) => v.sha256)],
          }));
        });

        const importFile = Effect.fn('SoundLibrary.importFile')(function* (
          file: string,
          name: string,
          given: Option.Option<SourceCut>,
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          if (entry.kind !== 'recorded')
            return yield* SoundKindMismatch.make({ name, kind: entry.kind, wanted: 'recorded' });
          const source = yield* media.load(file, LIBRARY_RATE);
          const cut = yield* Option.match(given, {
            onNone: () =>
              Effect.succeed(
                Option.flatMap(Option.fromUndefinedOr(entry.secs), (secs) =>
                  autoCut(source, entry.use, secs),
                ),
              ),
            onSome: (c) =>
              Option.match(clipCut(source, c), {
                onNone: () =>
                  Effect.fail(
                    CutEmpty.make({
                      name,
                      from: c.from,
                      to: c.to,
                      secs: source.frames / source.rate,
                    }),
                  ),
                onSome: (clipped) => Effect.succeedSome(clipped),
              }),
          });
          const taken = Option.match(cut, {
            onNone: () => source,
            onSome: (c) => cutOf(source, c),
          });
          let trimmed = taken;
          if (entry.use === 'one-shot') trimmed = trimQuiet(taken, TRIM_FLOOR, TRIM_PAD);
          const level = levelOvers(trimmed);
          const kept = yield* keepFile(name, level.pcm, 'public', {
            request: requestKey(entry),
            model: 'recorded',
            format: 'flac',
            licence: entry.licence.id,
            credits: 0,
          });
          const variant: Variant = Option.match(cut, {
            onNone: () => kept,
            onSome: (c) => ({ ...kept, cut: { from: toMs(c.from), to: toMs(c.to) } }),
          });
          yield* store.update(paths.lock, (lock) => {
            const had = Option.getOrElse(Option.fromUndefinedOr(lock[name]), () => emptyEntry);
            const current = had.variants.filter(
              (v) => v.request === variant.request && v.sha256 !== variant.sha256,
            );
            const older = had.variants.filter(
              (v) => v.request !== variant.request && v.sha256 !== variant.sha256,
            );
            return {
              ...lock,
              [name]: {
                variants: [...current, variant],
                candidates: [...without(had.candidates, [...older, variant]), ...older],
                rejected: had.rejected,
              },
            };
          });
          const rumble = profileOf(level.pcm, entry.use).rumble;
          yield* Effect.log(
            `sfx.imported name=${name} file=${variant.file} licence=${variant.licence} cut=${Option.match(cut, { onNone: () => 'whole', onSome: (c) => `${toMs(c.from)}-${toMs(c.to)}` })} gain=${level.gain.toFixed(1)} rumble=${rumble.toFixed(4)}`,
          );
          const imported: Imported = { variant, cut, gain: level.gain, rumble };
          return imported;
        });

        const decoded = (source: SoundSource): Effect.Effect<Pcm, MediaFailed> => {
          if (source._tag === 'File') return media.decode(source.file);
          return made.pcm(source);
        };

        const levelled = (entry: LibraryEntry, p: Playable) =>
          Effect.map(decoded(p.source), (pcm): Pcm => {
            const gain = gainFor(levelOf(entry, Option.none()), p.loudness, entry.use);
            const plane = new Float32Array(pcm.frames);
            for (const channel of pcm.channels)
              for (let i = 0; i < pcm.frames; i++)
                plane[i] = (plane[i] ?? 0) + ((channel[i] ?? 0) * gain) / pcm.channels.length;
            return { rate: pcm.rate, frames: pcm.frames, channels: [plane] };
          });

        const trialRenders = (loaded: LoadedLibrary, name: string) =>
          Effect.forEach(trialSources(soundsOf(loaded), name), (source) =>
            Effect.map(made.measure(source), (measured) => derivedPlayable(source, measured)),
          );

        const trialPlayables = (loaded: LoadedLibrary, name: string, entry: LibraryEntry) =>
          Effect.gen(function* () {
            if (!loaded.trials.has(name))
              return yield* CodeTrialMissing.make({ name, kind: entry.kind });
            return yield* trialRenders(loaded, name);
          });

        const audition = Effect.fn('SoundLibrary.audition')(function* (
          name: string,
          of: AuditionOf,
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          const record = Option.fromUndefinedOr(loaded.lock[name]);
          let playables: ReadonlyArray<Playable>;
          let suffix = '';
          if (of === 'candidates') {
            suffix = '-candidates';
            playables = pendingOf(entry, record).map((v) => ({
              source: { _tag: 'File', file: path.join(dir, v.file) },
              loudness: v.loudness,
              onset: Option.fromUndefinedOr(v.onset),
              hit: Option.fromUndefinedOr(v.hit),
            }));
          } else if (of === 'trial') {
            suffix = '-trial';
            playables = yield* trialPlayables(loaded, name, entry);
          } else
            playables = playablesOf(yield* made.measured(soundsOf(loaded), [name]), name, entry);
          yield* fs.makeDirectory(paths.out, { recursive: true });
          const out = path.join(paths.out, `audition-${name}${suffix}.wav`);
          const blocks = yield* Effect.forEach(playables, (p) =>
            Effect.map(levelled(entry, p), (pcm): Block => ({ pcm, marks: [] })),
          );
          yield* media.writeWav(out, lineUpOf(spaced(blocks, AUDITION_GAP)).pcm);
          yield* Effect.log(`sfx.audition name=${name} sounds=${playables.length} file=${out}`);
          return out;
        });

        const fit = Effect.fn('SoundLibrary.fit')(function* (name: string, request: FitRequest) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          if (isKeptFit(entry)) return yield* FitRefused.make({ name, kind: 'kept' });
          if (entry.kind !== 'recorded') return yield* FitRefused.make({ name, kind: entry.kind });
          const lockEntry = Option.fromUndefinedOr(loaded.lock[name]);
          const kept = Option.flatMap(lockEntry, (e) => Arr.head(e.variants));
          if (Option.isNone(kept))
            return yield* SoundUnmade.make({
              name,
              candidates: pendingOf(entry, lockEntry).length,
            });
          const source = path.join(dir, kept.value.file);
          const rumble = profileOf(yield* media.decode(source), entry.use).rumble;
          const cache = path.join(paths.out, 'fits', `${name}.model.json`);
          const model = Option.getOrElse(request.from, () => cache);
          if (Option.isNone(request.from)) {
            const text = yield* earshot.fit(source);
            yield* fs.makeDirectory(path.dirname(cache), { recursive: true });
            yield* fs.writeFileString(cache, text);
          }
          const decoded = yield* fs.readFileString(model).pipe(
            Effect.flatMap(Schema.decodeEffect(EarshotModelJson)),
            Effect.mapError((error) =>
              FitModelInvalid.make({ file: model, reason: error.message }),
            ),
          );
          const fitted = yield* Effect.fromResult(
            fitSound(name, decoded, { size: request.size, use: entry.use, rumble }),
          );
          const record: SoundFit = {
            sound: fitted.sound,
            variants: FIT_SEEDS,
            from: { file: kept.value.file, sha256: kept.value.sha256 },
            earshot: earshot.commit,
            size: request.size,
            left: fitted.left,
          };
          const file = fitFile(dir, name);
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(
            file,
            yield* Schema.encodeEffect(SoundFitJson)(record).pipe(Effect.orDie),
          );
          yield* Effect.log(
            `sfx.fit name=${name} kind=${fitted.kind} size=${request.size} modes=${fitted.modes} bands=${fitted.bands} work=${fitted.work} file=${file}`,
          );
          const done: Fit = { file, model, fitted };
          return done;
        });

        const ab = Effect.fn('SoundLibrary.ab')(function* (name: string, out: string) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          const hasTrial = loaded.trials.has(name);
          const code = yield* trialRenders(loaded, name);
          const now = playablesOf(yield* made.measured(soundsOf(loaded), [name]), name, entry);
          if (now.length === 0)
            return yield* SoundUnmade.make({
              name,
              candidates: pendingOf(entry, Option.fromUndefinedOr(loaded.lock[name])).length,
            });
          const blocksOf = (playables: ReadonlyArray<Playable>) =>
            Effect.forEach(playables, (p) =>
              Effect.map(levelled(entry, p), (pcm): Block => ({
                pcm: clipped(entry, pcm),
                marks: clipMarks(entry, p, pcm),
              })),
            );
          const [nowBlocks, codeBlocks] = [yield* blocksOf(now), yield* blocksOf(code)];
          const nowClip = { suffix: 'now', blocks: spaced(nowBlocks, AUDITION_GAP) };
          const trialClips = [
            { suffix: 'code', blocks: spaced(codeBlocks, AUDITION_GAP) },
            {
              suffix: 'now-then-code',
              blocks: [...spaced(nowBlocks, AB_BETWEEN), ...spaced(codeBlocks, AUDITION_GAP)],
            },
          ];
          let clips = [nowClip];
          if (hasTrial) clips = [nowClip, ...trialClips];
          yield* fs.makeDirectory(out, { recursive: true });
          const written = yield* Effect.forEach(clips, ({ suffix, blocks }) =>
            Effect.gen(function* () {
              const lineUp = lineUpOf(blocks);
              const sheet = sheetOf(lineUp.pcm, lineUp.marks);
              const png = path.join(out, `${name}.${suffix}.png`);
              const mp4 = path.join(out, `${name}.${suffix}.mp4`);
              yield* media.writePng(png, sheet);
              yield* media.card(sheet, lineUp.pcm, mp4);
              return [mp4, png];
            }),
          );
          yield* Effect.log(`sfx.ab name=${name} now=${now.length} code=${code.length} dir=${out}`);
          return written.flat();
        });

        const render = Effect.fn('SoundLibrary.render')(function* (
          name: string,
          which: RenderWhich,
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          const seedsOf = (variants: number) =>
            Option.match(which.seed, {
              onNone: () => Array.from({ length: variants }, (_, i) => i + 1),
              onSome: (s) => [s],
            });
          let renders: ReadonlyArray<{ readonly out: string; readonly source: DerivedSource }>;
          if (which.trial) {
            const trial = Option.fromUndefinedOr(loaded.trials.get(name));
            if (Option.isNone(trial))
              return yield* CodeTrialMissing.make({ name, kind: entry.kind });
            const sound = trial.value.sound;
            renders = seedsOf(trial.value.variants).map((seed) => ({
              out: path.join(paths.out, `${name}-trial-${seed}.wav`),
              source: { _tag: 'Code', sound, seed },
            }));
          } else {
            if (!isDerived(entry))
              return yield* SoundKindMismatch.make({
                name,
                kind: entry.kind,
                wanted: 'code',
              });
            const sounds = soundsOf(loaded);
            renders = seedsOf(entry.variants).flatMap((seed) =>
              Option.toArray(seedSource(sounds, name, seed)).map((source) => ({
                out: path.join(paths.out, `${name}-${seed}.wav`),
                source,
              })),
            );
          }
          yield* fs.makeDirectory(paths.out, { recursive: true });
          const written = yield* Effect.forEach(renders, ({ out, source }) =>
            Effect.gen(function* () {
              const pcm = yield* made.pcm(source);
              yield* media.writeWav(out, pcm);
              if (!which.sheet) return [out];
              const png = out.replace(/\.wav$/, '.png');
              yield* media.writePng(png, sheetOf(pcm, renderMarks(entry, pcm)));
              return [out, png];
            }),
          );
          return written.flat();
        });

        const compare = Effect.fn('SoundLibrary.compare')(function* (name: string) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          const trial = Option.fromUndefinedOr(loaded.trials.get(name));
          if (Option.isNone(trial)) return yield* CodeTrialMissing.make({ name, kind: entry.kind });
          const sounds = yield* made.measured(soundsOf(loaded), [name]);
          const playing = playablesOf(sounds, name, entry);
          if (!Arr.isReadonlyArrayNonEmpty(playing))
            return yield* SoundUnmade.make({
              name,
              candidates: pendingOf(entry, Option.fromUndefinedOr(loaded.lock[name])).length,
            });
          const plays = yield* Effect.forEach(playing, (p, i) =>
            Effect.map(decoded(p.source), (pcm): Measured => ({
              label: playableLabel(p, i),
              profile: profileOf(pcm, entry.use),
            })),
          );
          const { sound, variants } = trial.value;
          const tried = yield* Effect.forEach(Arr.range(1, variants), (seed) =>
            Effect.map(made.pcm({ _tag: 'Code', sound, seed }), (pcm): Measured => ({
              label: `seed ${seed}`,
              profile: profileOf(pcm, entry.use),
            })),
          );
          const compared: Comparison = { plays, trial: tried };
          return compared;
        });

        const fileFinding = (name: string, variant: Variant) =>
          Effect.gen(function* () {
            const at = path.join(dir, variant.file);
            if (!(yield* fs.exists(at)))
              return Option.some<LibraryFinding>(
                SoundFileMissing.make({ name, file: variant.file }),
              );
            const found = yield* sha256OfFile(fs, at);
            if (found === variant.sha256) return Option.none<LibraryFinding>();
            return Option.some<LibraryFinding>(
              SoundCorrupt.make({ name, file: variant.file, sha256: variant.sha256, found }),
            );
          });

        const licenceFindings = (lock: Lock) =>
          Effect.gen(function* () {
            const publicly = new Map(
              everyVariant(lock)
                .filter(({ variant }) => variant.file.startsWith('public/'))
                .map(({ variant }) => [variant.file, variant.licence]),
            );
            let listed: ReadonlyArray<string> = [];
            if (yield* fs.exists(paths.public))
              listed = (yield* fs.readDirectory(paths.public, { recursive: true })).map(
                (f) => `public/${f}`,
              );
            const audio = listed.filter((f) => AUDIO_FILE.test(f));
            return audio.flatMap((file) => {
              const licence = Option.fromUndefinedOr(publicly.get(file));
              if (Option.isNone(licence))
                return [SoundLicence.make({ file, licence: 'not in the lock' })];
              if (licence.value === 'elevenlabs-paid-sfx')
                return [SoundLicence.make({ file, licence: licence.value })];
              return [];
            });
          });

        const timingFindings = (
          name: string,
          entry: LibraryEntry,
          kept: ReadonlyArray<Variant>,
        ): ReadonlyArray<LibraryFinding> => {
          if (entry.use !== 'one-shot') return [];
          return kept.flatMap((v, i): ReadonlyArray<LibraryFinding> =>
            Option.match(timingOf(v), {
              onNone: () => [TimingUnrecorded.make({ name, variant: i + 1 })],
              onSome: () => [],
            }),
          );
        };

        const changeFindings = (
          name: string,
          entry: LibraryEntry,
          kept: ReadonlyArray<Variant>,
        ): ReadonlyArray<LibraryFinding> => {
          if (entry.kind !== 'recorded' || entry.licence.id === 'CC0-1.0') return [];
          if (entry.licence.changed || kept.length === 0) return [];
          if (kept.some((v) => 'cut' in v)) return [ChangeUnsaid.make({ name, how: 'cut' })];
          if (entry.use === 'one-shot') return [ChangeUnsaid.make({ name, how: 'trimmed' })];
          return [];
        };

        const seamFindings = (
          name: string,
          entry: LibraryEntry,
          sounds: MeasuredSounds,
          broken: ReadonlySet<string>,
        ) =>
          Effect.gen(function* () {
            const findings: Array<LibraryFinding> = [];
            if (entry.use !== 'bed') return findings;
            for (const [i, p] of playablesOf(sounds, name, entry).entries()) {
              if (p.source._tag === 'File' && broken.has(p.source.file)) continue;
              const seam = loopSeam(yield* decoded(p.source));
              let of: LoopSeam['of'] = 'seed';
              if (p.source._tag === 'File') of = 'take';
              if (seamHeard(seam))
                findings.push(
                  LoopSeam.make({ name, of, variant: i + 1, db: seam.db, click: seam.click }),
                );
            }
            return findings;
          });

        const trialSeamFindings = (name: string, entry: LibraryEntry, sounds: Sounds) =>
          Effect.gen(function* () {
            const findings: Array<LibraryFinding> = [];
            if (entry.use !== 'bed') return findings;
            for (const [i, source] of trialSources(sounds, name).entries()) {
              const seam = loopSeam(yield* made.pcm(source));
              if (seamHeard(seam))
                findings.push(
                  LoopSeam.make({
                    name: `${name} (trial)`,
                    of: 'seed',
                    variant: i + 1,
                    db: seam.db,
                    click: seam.click,
                  }),
                );
            }
            return findings;
          });

        const describeLibrary = Effect.fn('SoundLibrary.describe')(function* () {
          const loaded = yield* load;
          const measured = new Map<string, VariantTiming>();
          for (const { variant } of everyVariant(loaded.lock)) {
            if (Option.isSome(timingOf(variant))) continue;
            const at = path.join(dir, variant.file);
            if (!(yield* fs.exists(at))) continue;
            measured.set(variant.sha256, lockTiming(describeSound(yield* media.decode(at))));
          }
          const timed = (v: Variant): Variant =>
            Option.match(Option.fromUndefinedOr(measured.get(v.sha256)), {
              onNone: () => v,
              onSome: (timing) => ({ ...v, ...timing }),
            });
          yield* store.update(paths.lock, (lock) =>
            Rec.map(lock, (entry) => ({
              ...entry,
              variants: entry.variants.map(timed),
              candidates: entry.candidates.map(timed),
            })),
          );
          return measured.size;
        });
        const describe = describeLibrary();

        const checkLibrary = Effect.fn('SoundLibrary.check')(function* () {
          const loaded = yield* load;
          const findings: Array<LibraryFinding> = [];
          const entries = Object.entries(loaded.library).sort(([a], [b]) => a.localeCompare(b));
          const beds = entries.filter(([, entry]) => entry.use === 'bed').map(([name]) => name);
          const sounds = yield* made.measured(soundsOf(loaded), beds);
          for (const [name, entry] of entries) {
            const record = Option.fromUndefinedOr(loaded.lock[name]);
            const state = soundState(entry, record);
            if (state._tag === 'Missing')
              findings.push(SoundUnmade.make({ name, candidates: state.candidates }));
            if (state._tag === 'Stale') findings.push(SoundStale.make({ name }));
            const kept = Option.match(
              Option.filter(record, () => !isDerived(entry)),
              { onNone: (): ReadonlyArray<Variant> => [], onSome: (r) => r.variants },
            );
            const broken = new Set<string>();
            for (const variant of kept)
              for (const finding of Option.toArray(yield* fileFinding(name, variant))) {
                findings.push(finding);
                broken.add(path.join(dir, variant.file));
              }
            findings.push(...timingFindings(name, entry, kept));
            findings.push(...changeFindings(name, entry, kept));
            findings.push(...(yield* seamFindings(name, entry, sounds, broken)));
            findings.push(...(yield* trialSeamFindings(name, entry, sounds)));
          }
          findings.push(...(yield* licenceFindings(loaded.lock)));
          return findings;
        });
        const check = checkLibrary();

        const privateFiles = (lock: Lock, scores: Scores): ReadonlyArray<PrivateFile> => [
          ...everyVariant(lock)
            .filter(({ variant }) => variant.file.startsWith('files/'))
            .map(({ variant }) => ({
              key: variant.file,
              file: path.join(dir, variant.file),
              sha256: variant.sha256,
            })),
          ...scores.files,
        ];

        const pullFiles = Effect.fn('SoundLibrary.pull')(function* (scores: Scores) {
          const loaded = yield* load;
          const remote = yield* privateStore.store;
          let fetched = 0;
          let had = 0;
          const missing: Array<string> = [];
          for (const file of privateFiles(loaded.lock, scores)) {
            if (yield* holdsHere(file)) {
              had++;
              continue;
            }
            if (!(yield* holdsIn(remote, file))) {
              missing.push(file.key);
              yield* Effect.logWarning(`sfx.pull.missing file=${file.key}`);
              continue;
            }
            yield* remote.get(file.key, file.file);
            fetched++;
          }
          yield* Effect.log(
            `sfx.pull store=${remote.where} fetched=${fetched} had=${had} missing=${missing.length}`,
          );
          const report: PullReport = { fetched, had, missing };
          return report;
        });

        const holdsAt = (at: string, sha: string) =>
          Effect.gen(function* () {
            if (!(yield* fs.exists(at))) return false;
            return (yield* sha256OfFile(fs, at)) === sha;
          });

        const holdsHere = (file: PrivateFile) => holdsAt(file.file, file.sha256);

        const holdsIn = (remote: MediaStoreService, file: PrivateFile) =>
          Effect.map(remote.hashOf(file.key), (h) => Option.contains(h, file.sha256));

        const sourceOf = (file: PrivateFile, from: Option.Option<string>) =>
          Effect.gen(function* () {
            if (yield* holdsHere(file)) return Option.some(file.file);
            if (Option.isNone(from)) return Option.none<string>();
            const at = path.join(expandHome(from.value, home), file.key);
            if (yield* holdsAt(at, file.sha256)) return Option.some(at);
            return Option.none<string>();
          });

        const pushFiles = Effect.fn('SoundLibrary.push')(function* (
          scores: Scores,
          from: Option.Option<string>,
        ) {
          const loaded = yield* load;
          const remote = yield* privateStore.store;
          const files = privateFiles(loaded.lock, scores);
          const sent: Array<string> = [];
          const missing: Array<string> = [];
          let had = 0;
          for (const file of files) {
            if (yield* holdsIn(remote, file)) {
              had++;
              continue;
            }
            const source = yield* sourceOf(file, from);
            if (Option.isNone(source)) {
              missing.push(file.key);
              yield* Effect.logWarning(`sfx.push.missing file=${file.key}`);
              continue;
            }
            yield* remote.put(file.key, source.value);
            if (!(yield* holdsIn(remote, file)))
              return yield* StoreCopyFailed.make({ file: file.key, store: remote.where });
            sent.push(file.key);
            yield* Effect.log(`sfx.push.sent file=${file.key}`);
          }
          yield* Effect.log(
            `sfx.push store=${remote.where} sent=${sent.length} had=${had} missing=${missing.length} total=${files.length}`,
          );
          const report: PushReport = { sent, had, missing, total: files.length };
          return report;
        });

        return SoundLibrary.of({
          paths,
          load,
          plan,
          make,
          trial,
          takesAt,
          keep,
          unkeep,
          reject,
          importFile,
          audition,
          render,
          compare,
          fit,
          ab,
          check,
          describe,
          pull: pullFiles,
          push: pushFiles,
        });
      }),
    );
}
