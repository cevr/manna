import { Array as Arr, Match, Option, Result, Schema, flow } from 'effect';
import type { Pcm } from './audio.ts';
import { SoundUseMismatch, UnknownSound } from './errors.ts';
import { hashText } from './narration.ts';
import { type Sound, repoJson } from './schema.ts';
import { Segment } from './segment.ts';
import { fnv1a, rng } from './random.ts';
import { TAKE_LEVEL } from './recording.ts';
import { describeSound } from './synth/analyse.ts';
import { ABSOLUTE_GATE, loudness } from './synth/loudness.ts';
import { CodeSound } from './synth/graph/nodes.ts';
import type { ResolvedSound } from './synth/graph/plan.ts';
import type { ResolvedTrial } from './synth/resolve.ts';
import { RENDER_VERSION, renderCode } from './synth/graph/render.ts';
import { toMs } from './time.ts';

const SoundName = Segment.check(Schema.isPattern(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/));
type SoundName = typeof SoundName.Type;

export const familyOf = (name: string): string => name.slice(0, Math.max(0, name.indexOf('.')));

export const SoundUse = Schema.Literals(['one-shot', 'bed']);
export type SoundUse = typeof SoundUse.Type;

const Jitter = Schema.Struct({
  pitch: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  gain: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1.5 })),
});
type Jitter = typeof Jitter.Type;

const CreditedLicence = Schema.Literals(['CC-BY-3.0', 'CC-BY-4.0']);
type CreditedLicence = typeof CreditedLicence.Type;
const PublicLicence = Schema.Literals(['CC0-1.0', ...CreditedLicence.literals]);
type PublicLicence = typeof PublicLicence.Type;

const PageUrl = Schema.NonEmptyString.check(Schema.isPattern(/^https:\/\/\S+$/));

const provenance = {
  author: Schema.NonEmptyString,
  source: PageUrl,
  openverse: Schema.optionalKey(Schema.String),
};

const FreeLicence = Schema.Struct({
  id: Schema.Literal('CC0-1.0'),
  ...provenance,
  title: Schema.optionalKey(Schema.NonEmptyString),
  authorUrl: Schema.optionalKey(PageUrl),
  changed: Schema.optionalKey(Schema.Boolean),
});

const CreditLicence = Schema.Struct({
  id: CreditedLicence,
  ...provenance,
  title: Schema.NonEmptyString,
  authorUrl: PageUrl,
  changed: Schema.Boolean,
});

const Licence = Schema.Union([FreeLicence, CreditLicence]);
type Licence = typeof Licence.Type;

const FittedLicence = Schema.Union([
  FreeLicence,
  Schema.Struct({ ...CreditLicence.fields, changed: Schema.Literal(true) }),
]);

const placing = {
  use: SoundUse,
  level: Schema.optionalKey(Schema.Finite),
  jitter: Schema.optionalKey(Jitter),
  duck: Schema.optionalKey(Schema.Boolean),
};

const GENERATED_SECS = { min: 0.5, max: 30 } as const;

const Seeds = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 }));

const CodeTrial = Schema.Struct({ sound: CodeSound, variants: Seeds });
export type CodeTrial = typeof CodeTrial.Type;

const SoundFit = Schema.Struct({
  ...CodeTrial.fields,
  from: Schema.Struct({ file: Schema.String, sha256: Schema.String }),
  earshot: Schema.String,
  size: Schema.Literals(['small', 'full']),
  left: Schema.Array(Schema.String),
});
export type SoundFit = typeof SoundFit.Type;

export const SoundFitJson = repoJson(SoundFit);

export const keptFit = flow(
  Schema.decodeUnknownSync(SoundFit),
  ({ sound, variants }): CodeTrial => ({ sound, variants }),
);

export const Generated = Schema.Struct({
  kind: Schema.Literal('generated'),
  prompt: Schema.NonEmptyString,
  why: Schema.NonEmptyString,
  secs: Schema.Finite.check(
    Schema.isBetween({ minimum: GENERATED_SECS.min, maximum: GENERATED_SECS.max }),
  ),
  influence: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  loop: Schema.optionalKey(Schema.Boolean),
  candidates: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))),
  code: Schema.optionalKey(CodeTrial),
  ...placing,
});
export type Generated = typeof Generated.Type;

const Code = Schema.Struct({
  kind: Schema.Literal('code'),
  sound: CodeSound,
  variants: Seeds,
  licence: Schema.optionalKey(FittedLicence),
  ...placing,
});
type Code = typeof Code.Type;

const Recorded = Schema.Struct({
  kind: Schema.Literal('recorded'),
  licence: Licence,
  secs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  ...placing,
});
type Recorded = typeof Recorded.Type;

export const LibraryEntry = Schema.Union([Generated, Recorded, Code]);
export type LibraryEntry = typeof LibraryEntry.Type;

export const isKeptFit = (entry: LibraryEntry): boolean =>
  entry.kind === 'code' && Option.isSome(Option.fromUndefinedOr(entry.licence));

export const isDerived = (entry: LibraryEntry): entry is Code => entry.kind === 'code';

export const codeTrialOf = (
  entry: LibraryEntry,
  fit: Option.Option<CodeTrial>,
): Option.Option<CodeTrial> => {
  if (entry.kind === 'generated') return Option.fromUndefinedOr(entry.code);
  if (entry.kind === 'recorded') return fit;
  return Option.none();
};

export const Library = Schema.Record(SoundName, LibraryEntry);
export type Library = typeof Library.Type;

const soundNamed = Schema.decodeOption(SoundName);

export const soundEntry = (library: Library, name: string): Option.Option<LibraryEntry> =>
  Option.flatMap(soundNamed(name), (sound) => Option.fromUndefinedOr(library[sound]));

export const defineLibrary = <const L extends Library>(library: L): L => library;

const VariantLoudness = Schema.Struct({
  integrated: Schema.Finite,
  momentaryMax: Schema.Finite,
  peak: Schema.Finite,
});
type VariantLoudness = typeof VariantLoudness.Type;

export const SILENT = -120;

export const lockLoudness = (measured: {
  readonly integrated: number;
  readonly momentaryMax: number;
  readonly peak: number;
}): VariantLoudness => {
  const floor = (db: number) => Math.round(Math.max(SILENT, db) * 10) / 10;
  return {
    integrated: floor(measured.integrated),
    momentaryMax: floor(measured.momentaryMax),
    peak: floor(measured.peak),
  };
};

export const SFX_MODEL = 'eleven_text_to_sound_v2';
export const SFX_FORMAT = 'pcm_44100';
const CREDITS_PER_SECOND = 40;

const VariantLicence = Schema.Literals(['elevenlabs-paid-sfx', ...PublicLicence.literals]);
type VariantLicence = typeof VariantLicence.Type;

export const Variant = Schema.Struct({
  request: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
  made: Schema.String,
  model: Schema.String,
  format: Schema.String,
  secs: Schema.Finite,
  loudness: VariantLoudness,
  onset: Schema.optionalKey(Schema.Finite),
  hit: Schema.optionalKey(Schema.Finite),
  cut: Schema.optionalKey(Schema.Struct({ from: Schema.Finite, to: Schema.Finite })),
  licence: VariantLicence,
  credits: Schema.Int,
});
export type Variant = typeof Variant.Type;

export interface VariantTiming {
  readonly onset: number;
  readonly hit: number;
}

export const lockTiming = (described: VariantTiming): VariantTiming => ({
  onset: toMs(described.onset),
  hit: toMs(described.hit),
});

export const LEAD_IN = 0.05;

export const LockEntry = Schema.Struct({
  variants: Schema.Array(Variant),
  candidates: Schema.Array(Variant),
  rejected: Schema.Array(Schema.String),
});
export type LockEntry = typeof LockEntry.Type;

export const Lock = Schema.Record(Schema.String, LockEntry);
export type Lock = typeof Lock.Type;

export const LockJson = repoJson(Lock);

const RequestKey = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('generated'),
      prompt: Schema.String,
      secs: Schema.Finite,
      influence: Schema.Finite,
      loop: Schema.Boolean,
      model: Schema.String,
      format: Schema.String,
    }),
    Schema.Struct({ kind: Schema.Literal('recorded'), source: Schema.String }),
    Schema.Struct({ kind: Schema.Literal('code'), sound: CodeSound }),
  ]),
);

const DEFAULT_INFLUENCE = { 'one-shot': 0.7, bed: 0.3 } satisfies Record<SoundUse, number>;

export const influenceOf = (entry: Generated): number =>
  Option.getOrElse(Option.fromUndefinedOr(entry.influence), () => DEFAULT_INFLUENCE[entry.use]);

export const requestKey = (entry: LibraryEntry): string => {
  switch (entry.kind) {
    case 'generated':
      return hashText(
        Schema.encodeSync(RequestKey)({
          kind: 'generated',
          prompt: entry.prompt,
          secs: entry.secs,
          influence: influenceOf(entry),
          loop: entry.loop === true,
          model: SFX_MODEL,
          format: SFX_FORMAT,
        }),
      );
    case 'recorded':
      return hashText(
        Schema.encodeSync(RequestKey)({ kind: 'recorded', source: entry.licence.source }),
      );
    case 'code':
      return hashText(Schema.encodeSync(RequestKey)({ kind: 'code', sound: entry.sound }));
  }
};

type SoundState =
  | { readonly _tag: 'Derived'; readonly variants: number }
  | { readonly _tag: 'Missing'; readonly candidates: number }
  | { readonly _tag: 'Stale'; readonly variants: number; readonly candidates: number }
  | { readonly _tag: 'Current'; readonly variants: number; readonly candidates: number };

export const pendingOf = (entry: LibraryEntry, lock: Option.Option<LockEntry>) =>
  Option.match(lock, {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.candidates.filter((c) => c.request === requestKey(entry)),
  });

export const soundState = (entry: LibraryEntry, lock: Option.Option<LockEntry>): SoundState => {
  if (isDerived(entry)) return { _tag: 'Derived', variants: entry.variants };
  const candidates = pendingOf(entry, lock).length;
  const kept = Option.match(lock, {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  if (kept.length === 0) return { _tag: 'Missing', candidates };
  const current = kept.every((v) => v.request === requestKey(entry));
  if (!current) return { _tag: 'Stale', variants: kept.length, candidates };
  return { _tag: 'Current', variants: kept.length, candidates };
};

export const keptLoudness = (
  entry: LibraryEntry,
  lock: Option.Option<LockEntry>,
): Option.Option<number> => {
  if (isDerived(entry)) return Option.none();
  const kept = Option.match(lock, {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  if (kept.length === 0) return Option.none();
  const measure = kept.map((v) => {
    if (entry.use === 'bed') return v.loudness.integrated;
    return v.loudness.momentaryMax;
  });
  return Option.some(measure.reduce((a, b) => a + b, 0) / measure.length);
};

const DEFAULT_CANDIDATES = { 'one-shot': 6, bed: 3 } satisfies Record<SoundUse, number>;

export const candidatesOf = (entry: Generated): number =>
  Option.getOrElse(Option.fromUndefinedOr(entry.candidates), () => DEFAULT_CANDIDATES[entry.use]);

export const creditsOf = (entry: Generated): number => Math.round(entry.secs * CREDITS_PER_SECOND);

export interface MakeJob {
  readonly name: string;
  readonly entry: Generated;
  readonly count: number;
  readonly credits: number;
}

export const makePlan = (
  library: Library,
  lock: Lock,
  names: Option.Option<ReadonlySet<string>>,
  force: boolean,
): ReadonlyArray<MakeJob> =>
  Object.keys(library)
    .sort()
    .filter((name) => Option.match(names, { onNone: () => true, onSome: (set) => set.has(name) }))
    .flatMap((name) =>
      Option.match(Option.filter(soundEntry(library, name), isGenerated), {
        onNone: (): ReadonlyArray<MakeJob> => [],
        onSome: (entry) => makeJob(name, entry, Option.fromUndefinedOr(lock[name]), force),
      }),
    );

const isGenerated = (entry: LibraryEntry): entry is Generated => entry.kind === 'generated';

const makeJob = (
  name: string,
  entry: Generated,
  record: Option.Option<LockEntry>,
  force: boolean,
): ReadonlyArray<MakeJob> => {
  const want = candidatesOf(entry);
  if (force) return [{ name, entry, count: want, credits: want * creditsOf(entry) }];
  if (soundState(entry, record)._tag === 'Current') return [];
  const count = Math.max(0, want - pendingOf(entry, record).length);
  if (count === 0) return [];
  return [{ name, entry, count, credits: count * creditsOf(entry) }];
};

export interface Trial {
  readonly prompt: Option.Option<string>;
  readonly secs: Option.Option<number>;
  readonly influence: Option.Option<number>;
}

export const trialEntry = (entry: Generated, trial: Trial) =>
  Schema.decodeResult(Generated)({
    ...entry,
    ...Option.match(trial.prompt, { onNone: () => ({}), onSome: (prompt) => ({ prompt }) }),
    ...Option.match(trial.secs, { onNone: () => ({}), onSome: (secs) => ({ secs }) }),
    ...Option.match(trial.influence, {
      onNone: () => ({}),
      onSome: (influence) => ({ influence }),
    }),
  });

export const resolveSound = (
  library: Library,
  name: string,
): Result.Result<LibraryEntry, UnknownSound> =>
  Result.fromOption(soundEntry(library, name), () => {
    const names = Object.keys(library).sort();
    const family = names.filter((n) => familyOf(n) === familyOf(name));
    return UnknownSound.make({
      name,
      known: Option.getOrElse(Option.liftPredicate(family, Arr.isArrayNonEmpty), () => names),
    });
  });

export const resolveUse = (
  library: Library,
  name: string,
  use: SoundUse,
): Result.Result<LibraryEntry, UnknownSound | SoundUseMismatch> =>
  Result.flatMap(resolveSound(library, name), (entry) => {
    if (entry.use === use) return Result.succeed(entry);
    return Result.fail(SoundUseMismatch.make({ name, declared: entry.use, placed: use }));
  });

export const VOICE_LEVEL = TAKE_LEVEL.speech;

const DEFAULT_LEVEL = { 'one-shot': -10, bed: -28 } satisfies Record<SoundUse, number>;

export const levelOf = (entry: LibraryEntry, placed: Option.Option<number>): number =>
  Option.getOrElse(
    Option.orElse(placed, () => Option.fromUndefinedOr(entry.level)),
    () => DEFAULT_LEVEL[entry.use],
  );

export const gainFor = (level: number, loudness: VariantLoudness, use: SoundUse): number => {
  let measured = loudness.momentaryMax;
  if (use === 'bed') measured = loudness.integrated;
  if (measured <= SILENT) return 0;
  return 10 ** ((VOICE_LEVEL + level - measured) / 20);
};

export interface Measure {
  readonly loudness: VariantLoudness;
  readonly onset: number;
  readonly hit: number;
}

export const measurePcm = (pcm: Pcm): Measure => ({
  loudness: lockLoudness(loudness(pcm)),
  ...lockTiming(describeSound(pcm)),
});

export const heardNothing = (measure: Measure): boolean =>
  measure.loudness.integrated <= ABSOLUTE_GATE;

export interface Sounds {
  readonly library: Library;
  readonly lock: Lock;
  readonly dir: string;
  readonly code: ReadonlyMap<string, ResolvedSound>;
  readonly trials: ReadonlyMap<string, ResolvedTrial>;
}

export interface MeasuredSounds extends Sounds {
  readonly measured: ReadonlyMap<string, Measure>;
}

export const NO_SOUNDS: MeasuredSounds = {
  library: {},
  lock: {},
  dir: '',
  code: new Map(),
  trials: new Map(),
  measured: new Map(),
};

export type SoundSource =
  | { readonly _tag: 'File'; readonly file: string }
  | { readonly _tag: 'Code'; readonly sound: ResolvedSound; readonly seed: number };

export type DerivedSource = Exclude<SoundSource, { readonly _tag: 'File' }>;

export const fileSource = (file: string): SoundSource => ({ _tag: 'File', file });

export const sourceLabel = (source: SoundSource): string =>
  Match.valueTags(source, {
    File: (file) => file.file,
    Code: (code) => `code:${RENDER_VERSION}:${code.sound.hash}/${code.seed}`,
  });

export const renderSource = (source: DerivedSource): Pcm => renderCode(source.sound, source.seed);

export interface Playable {
  readonly source: SoundSource;
  readonly loudness: VariantLoudness;
  readonly onset: Option.Option<number>;
  readonly hit: Option.Option<number>;
}

export const seedSource = (
  sounds: Sounds,
  name: string,
  seed: number,
): Option.Option<DerivedSource> =>
  Option.map(Option.fromUndefinedOr(sounds.code.get(name)), (sound): DerivedSource => ({
    _tag: 'Code',
    sound,
    seed,
  }));

export const seedSources = (
  sounds: Sounds,
  name: string,
  entry: Code,
): ReadonlyArray<DerivedSource> =>
  Array.from({ length: entry.variants }, (_, i) => i + 1).flatMap((seed) =>
    Option.toArray(seedSource(sounds, name, seed)),
  );

export const trialSources = (sounds: Sounds, name: string): ReadonlyArray<DerivedSource> =>
  Option.match(Option.fromUndefinedOr(sounds.trials.get(name)), {
    onNone: () => [],
    onSome: (trial) =>
      Arr.range(1, trial.variants).map((seed): DerivedSource => ({
        _tag: 'Code',
        sound: trial.sound,
        seed,
      })),
  });

const heardSources = (sounds: Sounds, name: string): ReadonlyArray<DerivedSource> => [
  ...Option.match(Option.filter(soundEntry(sounds.library, name), isDerived), {
    onNone: () => [],
    onSome: (entry) => seedSources(sounds, name, entry),
  }),
  ...trialSources(sounds, name),
];

export const heardSource = (
  sounds: Sounds,
  name: string,
  label: string,
): Option.Option<DerivedSource> =>
  Arr.findFirst(heardSources(sounds, name), (source) => sourceLabel(source) === label);

export const variantPlayable = (sounds: Sounds, variant: Variant): Playable => ({
  source: fileSource(`${sounds.dir}/${variant.file}`),
  loudness: variant.loudness,
  onset: Option.fromUndefinedOr(variant.onset),
  hit: Option.fromUndefinedOr(variant.hit),
});

export const derivedPlayable = (source: DerivedSource, measured: Measure): Playable => ({
  source,
  loudness: measured.loudness,
  onset: Option.some(measured.onset),
  hit: Option.some(measured.hit),
});

const measuredPlayable = (sounds: MeasuredSounds, source: DerivedSource): Option.Option<Playable> =>
  Option.map(Option.fromUndefinedOr(sounds.measured.get(sourceLabel(source))), (measured) =>
    derivedPlayable(source, measured),
  );

export const placedSounds = (sound: Sound): ReadonlyArray<string> =>
  Arr.dedupe([
    ...(sound.beds ?? []).map((bed) => bed.sound),
    ...Object.values(sound.effects).map((effect) => effect.sound),
  ]);

export interface SoundCredit {
  readonly title: string;
  readonly author: string;
  readonly authorUrl: string;
  readonly source: string;
  readonly licence: CreditedLicence;
  readonly changed: boolean;
}

const LICENCE_NAME = {
  'CC-BY-3.0': 'CC BY 3.0',
  'CC-BY-4.0': 'CC BY 4.0',
} satisfies Record<CreditedLicence, string>;
const LICENCE_DEED = {
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
} satisfies Record<CreditedLicence, string>;

const creditOf = (licence: Licence): Option.Option<SoundCredit> => {
  if (licence.id === 'CC0-1.0') return Option.none();
  return Option.some({
    title: licence.title,
    author: licence.author,
    authorUrl: licence.authorUrl,
    source: licence.source,
    licence: licence.id,
    changed: licence.changed,
  });
};

export const soundCredits = (library: Library, sound: Sound): ReadonlyArray<SoundCredit> =>
  Arr.dedupeWith(
    placedSounds(sound).flatMap((name) =>
      Option.toArray(
        Option.flatMap(soundEntry(library, name), (entry) => {
          if (entry.kind === 'generated') return Option.none();
          return Option.flatMap(Option.fromUndefinedOr(entry.licence), creditOf);
        }),
      ),
    ),
    (a, b) => a.source === b.source,
  );

export const creditLine = (credit: SoundCredit): string =>
  `"${credit.title}" by ${credit.author}, ${LICENCE_NAME[credit.licence]}${changedNote(credit)}`;

export const creditLink = (credit: SoundCredit): string =>
  `"${credit.title}" (${credit.source}) by ${credit.author} (${credit.authorUrl}), ${LICENCE_NAME[credit.licence]} (${LICENCE_DEED[credit.licence]})${changedNote(credit)}`;

const changedNote = (credit: SoundCredit): string => {
  if (credit.changed) return ', changed';
  return '';
};

export const unmeasuredOf = (sounds: MeasuredSounds, name: string, entry: LibraryEntry): number => {
  if (!isDerived(entry)) return 0;
  const sources = seedSources(sounds, name, entry);
  if (sources.length === 0) return entry.variants;
  return sources.filter((source) => !sounds.measured.has(sourceLabel(source))).length;
};

export const playablesOf = (
  sounds: MeasuredSounds,
  name: string,
  entry: LibraryEntry,
): ReadonlyArray<Playable> => {
  if (isDerived(entry))
    return seedSources(sounds, name, entry).flatMap((source) =>
      Option.toArray(measuredPlayable(sounds, source)),
    );
  const kept = Option.match(Option.fromUndefinedOr(sounds.lock[name]), {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  return kept.map((v) => variantPlayable(sounds, v));
};

export const DEFAULT_JITTER: Jitter = { pitch: 0.5, gain: 1 };
const JITTER_DELAY = 0.015;

export const jitterOf = (entry: LibraryEntry): Option.Option<Jitter> => {
  if (entry.use === 'bed') return Option.none();
  return Option.orElse(Option.fromUndefinedOr(entry.jitter), () =>
    Option.liftPredicate(DEFAULT_JITTER, () => !isDerived(entry)),
  );
};

export interface Placing {
  readonly effect: string;
  readonly sound: string;
  readonly at: number;
}

interface Played {
  readonly variant: number;
  readonly pitch: number;
  readonly gain: number;
  readonly delay: number;
}

export const playPlacings = (
  film: string,
  placings: ReadonlyArray<Placing>,
  variantsOf: (sound: string) => number,
  spreadOf: (sound: string) => Option.Option<Jitter>,
): ReadonlyArray<Played> => {
  const order = placings.map((p, i) => ({ p, i })).sort((a, b) => a.p.at - b.p.at || a.i - b.i);
  const seen = new Map<string, number>();
  const last = new Map<string, number>();
  const played: Array<Played> = placings.map(() => ({ variant: 0, pitch: 0, gain: 0, delay: 0 }));
  for (const { p, i } of order) {
    const n = Math.max(1, variantsOf(p.sound));
    const k = Option.getOrElse(Option.fromUndefinedOr(seen.get(p.effect)), () => 0);
    seen.set(p.effect, k + 1);
    let variant = (k + fnv1a(p.effect)) % n;
    if (n > 1 && last.get(p.sound) === variant) variant = (variant + 1) % n;
    last.set(p.sound, variant);
    const r = rng(fnv1a(`${film}/${p.effect}/${k}`));
    played[i] = Option.match(spreadOf(p.sound), {
      onNone: () => ({ variant, pitch: 0, gain: 0, delay: 0 }),
      onSome: (spread) => ({
        variant,
        pitch: (r() * 2 - 1) * spread.pitch,
        gain: (r() * 2 - 1) * spread.gain,
        delay: r() * JITTER_DELAY,
      }),
    });
  }
  return played;
};

export const AUDIO_FILE = /\.(flac|wav|mp3|ogg|opus|m4a|aac|aiff?)$/i;
