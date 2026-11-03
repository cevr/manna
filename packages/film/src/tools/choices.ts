import {
  Array as Arr,
  Cache,
  Clock,
  Context,
  Effect,
  FiberMap,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Result,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { SayPost } from '../core/api.ts';
import {
  type ChoicePoint,
  type ChoiceVariant,
  type ChoiceVerb,
  type FilmChoices,
  type PickPost,
  approvalRefused,
  pointNamed,
  subjectAt,
  variantNamed,
  withSay,
} from '../core/choice.ts';
import { type Catalogue, said } from '../core/catalogue.ts';
import type { CheckLine } from '../core/schema.ts';
import { type CatalogueError, RenderCatalogue } from './catalogue.ts';
import { SCORE_PLAY, editPick, lookPlay, readPick } from './choice-source.ts';
import { ContentStore, type StoreError } from './content-store.ts';
import { cacheKey } from './digest.ts';
import {
  ChoiceUnknown,
  type FreshProcessFailed,
  type ReviewToolFailed,
  type SourceRefused,
  VariantUnknown,
  VerbRefused,
} from '../core/refusals.ts';
import { type FormatFailed } from './errors.ts';
import {
  FilmFolder,
  type FilmName,
  Stamped,
  keptWhenMade,
  lockManifest,
  masterFile,
} from './film-repo.ts';
import { type FreshError, FreshFilm, type OptionsKept } from './fresh-film.ts';
import { Review, once } from './review.ts';
import {
  type Change,
  type Follows,
  type Remade,
  type RewriteError,
  SourceWriter,
} from './source-writer.ts';
import { Takes } from './takes.ts';

interface Picked {
  readonly file: string;
  readonly target: string;
  readonly change: Option.Option<Change>;
  readonly mixed: Remade;
}

type ChoicesError = FreshError | SourceRefused | StoreError | PlatformError;

interface Checked {
  readonly choices: FilmChoices;
  readonly findings: ReadonlyArray<CheckLine>;
}

interface ChoicesService {
  readonly list: (film: FilmName) => Effect.Effect<FilmChoices, ChoicesError>;
  readonly checked: (film: FilmName) => Effect.Effect<Checked, ChoicesError>;
  readonly pick: (
    film: FilmName,
    pick: PickPost,
  ) => Effect.Effect<Picked, ChoicesError | RewriteError | FormatFailed>;
  readonly say: (
    film: FilmName,
    asked: SayPost,
  ) => Effect.Effect<FilmChoices, ChoicesError | CatalogueError>;
  readonly alone: (
    film: FilmName,
    point: string,
    variant: string,
  ) => Effect.Effect<string, ChoicesError | ReviewToolFailed>;
  readonly inPlace: (
    film: FilmName,
    point: string,
    variant: string,
  ) => Effect.Effect<string, ChoicesError | ReviewToolFailed>;
}

export type ChoicesNeeds =
  | FileSystem.FileSystem
  | Path.Path
  | FilmFolder
  | ContentStore
  | SourceWriter
  | Review
  | FreshFilm
  | RenderCatalogue
  | Takes;

const sayAgain =
  (catalogue: Catalogue) =>
  (point: ChoicePoint): ChoicePoint =>
    withSay(Option.some(catalogue), point);

const offeredPoint = (
  film: string,
  points: ReadonlyArray<ChoicePoint>,
  id: string,
): Result.Result<ChoicePoint, ChoiceUnknown> =>
  Result.fromOption(pointNamed(points, id), () =>
    ChoiceUnknown.make({ film, point: id, known: points.map((p) => p.id) }),
  );

const offeredVariant = (
  film: string,
  point: ChoicePoint,
  id: string,
): Result.Result<ChoiceVariant, VariantUnknown> =>
  Result.fromOption(variantNamed(point, id), () =>
    VariantUnknown.make({
      film,
      point: point.id,
      variant: id,
      known: point.variants.map((v) => v.id),
    }),
  );

export const offered = (
  film: string,
  points: ReadonlyArray<ChoicePoint>,
  point: string,
  variant: string,
): Result.Result<
  { readonly point: ChoicePoint; readonly variant: ChoiceVariant },
  ChoiceUnknown | VariantUnknown
> =>
  Result.flatMap(offeredPoint(film, points, point), (p) =>
    Result.map(offeredVariant(film, p, variant), (v) => ({ point: p, variant: v })),
  );

export const verbFits = (
  point: ChoicePoint,
  variant: ChoiceVariant,
  verb: ChoiceVerb,
): Result.Result<void, VerbRefused> => {
  if (variant.verbs.includes(verb)) return Result.void;
  if (Option.isSome(variant.fixed))
    return Result.fail(
      VerbRefused.make({ point: point.id, variant: variant.id, verb, reason: variant.fixed.value }),
    );
  const standing = Match.value(variant.picked).pipe(
    Match.when(true, () => `it is picked`),
    Match.orElse(() => `it is ${variant.state}, not picked`),
  );
  const reason = Match.value(point.kind).pipe(
    Match.when('render', () => 'a render is approved, not picked'),
    Match.orElse(() => `${standing}: it allows ${variant.verbs.join(', ') || 'nothing'}`),
  );
  return Result.fail(VerbRefused.make({ point: point.id, variant: variant.id, verb, reason }));
};

const TAKE_ACT = { pick: 'keep', unpick: 'unkeep', reject: 'reject' } as const;

const POINTS_KEPT = 16;

interface VoiceKept {
  readonly picked: Picked;
  readonly kept: OptionsKept;
}

const keepVoice = Effect.fn('keepVoice')(function* (
  film: FilmName,
  beat: string,
  file: string,
  options: { readonly acceptMismatch: boolean },
) {
  const paths = (yield* FilmFolder).paths(film);
  const fresh = yield* FreshFilm;
  const timings = paths.timings.file;
  const target = `voice ${beat} keep ${file}`;
  const track = yield* trackOf(film);
  const [[kept, mixed], change] = yield* (yield* SourceWriter).around(
    film,
    timings,
    target,
    Effect.flatMap(fresh.keepVoice(film, beat, file, options), (done) => {
      if (!done.mixed) return Effect.succeed([done, Option.none<number>()] as const);
      return Effect.map(track.landed, (at) => [done, at] as const);
    }),
    { ...(yield* Takes).named(paths), remake: Option.some(track.remake) },
  );
  if (!kept.mixed) yield* Effect.logWarning(`choices.voice.unmixed film=${film} beat=${beat}`);
  const voiced: VoiceKept = { picked: { file: timings, target, change, mixed }, kept };
  return voiced;
});

interface Track {
  readonly landed: Effect.Effect<Remade>;
  readonly remake: Effect.Effect<Remade, FreshProcessFailed>;
}

const trackOf = Effect.fn('trackOf')(function* (film: FilmName) {
  const fs = yield* FileSystem.FileSystem;
  const fresh = yield* FreshFilm;
  const file = masterFile((yield* FilmFolder).paths(film));
  const landed = Effect.suspend(() => fs.stat(file)).pipe(
    Effect.map((info): Remade => Option.map(info.mtime, (at) => at.getTime())),
    Effect.orElseSucceed((): Remade => Option.none()),
  );
  const track: Track = {
    landed,
    remake: Effect.suspend(() => fresh.remix(film)).pipe(Effect.andThen(landed)),
  };
  return track;
});

export class Choices extends Context.Service<Choices, ChoicesService>()(
  '@manna/film/tools/Choices',
) {
  static readonly layer: Layer.Layer<Choices, never, ChoicesNeeds> = Layer.effect(
    Choices,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const folder = yield* FilmFolder;
      const store = yield* ContentStore;
      const writer = yield* SourceWriter;
      const review = yield* Review;
      const fresh = yield* FreshFilm;
      const catalogues = yield* RenderCatalogue;
      const takes = yield* Takes;
      const sounding = yield* FiberMap.make<string, string, FreshError | ReviewToolFailed>();
      const keeping = yield* Effect.context<
        FileSystem.FileSystem | FilmFolder | SourceWriter | FreshFilm | Takes
      >();

      const fileIn = (film: FilmName, name: string) => path.join(folder.paths(film).dir, name);

      const lockOf = (refused: () => VerbRefused) =>
        Effect.fromOption(Option.map(folder.sounds, lockManifest), refused);

      const stamp = folder.stamp;

      const read = yield* Cache.makeWith((at: Stamped) => fresh.choices(at.film), {
        capacity: POINTS_KEPT,
        timeToLive: keptWhenMade,
      });

      const points = Effect.fn('Choices.points')(function* (film: FilmName) {
        return yield* Cache.get(read, new Stamped({ film, stamp: yield* stamp(film) }));
      });

      const kept = <A extends { readonly points: ReadonlyArray<ChoicePoint> }>(
        film: FilmName,
        answer: Effect.Effect<A, FreshError>,
      ) =>
        Effect.gen(function* () {
          const at = new Stamped({ film, stamp: yield* stamp(film) });
          const got = yield* answer;
          yield* Cache.set(read, at, got.points);
          return got;
        });

      const list = Effect.fn('Choices.list')(function* (film: FilmName) {
        const { points: listed } = yield* kept(
          film,
          Effect.map(fresh.choices(film), (p) => ({ points: p })),
        );
        const result: FilmChoices = {
          film,
          pictures: yield* review.pictures(film),
          points: listed,
        };
        return result;
      });

      const checked = Effect.fn('Choices.checked')(function* (film: FilmName) {
        const got = yield* kept(film, fresh.checked(film));
        const result: Checked = {
          choices: { film, pictures: yield* review.pictures(film), points: got.points },
          findings: got.findings,
        };
        return result;
      });

      const mixedFrom = (film: FilmName) =>
        Effect.map(trackOf(film), (track): Follows => ({
          bring: () => Effect.void,
          putAway: () => Effect.void,
          remake: Option.some(track.remake),
        })).pipe(Effect.provideContext(keeping));

      const writePick = (
        film: FilmName,
        name: string,
        site: Parameters<typeof editPick>[2],
        option: string,
        follows?: Follows,
      ) => {
        const file = fileIn(film, name);
        return Effect.map(
          writer.write({
            film,
            scene: Option.none(),
            file,
            target: `${site.target} ${option}`,
            edit: (source) => editPick(name, source, site, option),
            verify: (after) =>
              Result.map(readPick(name, after, site), (read) =>
                Arr.filter(['play'], () => read !== option),
              ),
            check: () => Effect.void,
            follows,
          }),
          ([change, , mixed]): Picked => ({
            file,
            target: `${site.target} ${option}`,
            change,
            mixed,
          }),
        );
      };

      const actOnTake = Effect.fn('Choices.actOnTake')(function* (
        film: FilmName,
        point: ChoicePoint,
        sound: string,
        take: string,
        verb: ChoiceVerb,
      ) {
        const { file } = yield* lockOf(() =>
          VerbRefused.make({
            point: point.id,
            variant: take,
            verb,
            reason: 'the app keeps no sound library',
          }),
        );
        const target = `sound ${sound} ${TAKE_ACT[verb]} ${take.slice(0, 12)}`;
        const [, change] = yield* writer.around(
          film,
          file,
          target,
          fresh.take(film, point.id, take, verb),
        );
        const picked: Picked = { file, target, change, mixed: Option.none() };
        return picked;
      });

      const voicePicked = (film: FilmName, beat: string, file: string, acceptMismatch: boolean) =>
        keepVoice(film, beat, file, { acceptMismatch }).pipe(
          Effect.map((voiced) => voiced.picked),
          Effect.provideContext(keeping),
        );

      const pick = Effect.fn('Choices.pick')(function* (film: FilmName, asked: PickPost) {
        const { point, variant } = yield* Effect.fromResult(
          offered(film, yield* points(film), asked.point, asked.variant),
        );
        yield* Effect.fromResult(verbFits(point, variant, asked.verb));
        const refusal = () =>
          VerbRefused.make({
            point: point.id,
            variant: variant.id,
            verb: asked.verb,
            reason: `a ${point.kind} has no pick`,
          });
        const noPick = () => Effect.fail(refusal());
        return yield* Match.valueTags(point.ref, {
          Score: () =>
            Effect.flatMap(mixedFrom(film), (follows) =>
              writePick(film, 'sound.ts', SCORE_PLAY, variant.id, follows),
            ),
          Look: ({ name }) => writePick(film, 'palette.ts', lookPlay(name), variant.id),
          Take: ({ sound }) => actOnTake(film, point, sound, variant.id, asked.verb),
          Voice: ({ beat }) => voicePicked(film, beat, variant.id, asked.acceptMismatch === true),
          Render: noPick,
          Montage: noPick,
        });
      });

      const say = Effect.fn('Choices.say')(function* (film: FilmName, asked: SayPost) {
        const known = yield* points(film);
        const { point, variant } = yield* Effect.fromResult(
          offered(film, known, asked.point, asked.variant),
        );
        const address = yield* Effect.fromOption(point.address, () =>
          VerbRefused.make({
            point: point.id,
            variant: variant.id,
            verb: 'say',
            reason: 'it belongs to no film address',
          }),
        );
        const stale = approvalRefused(point.kind, variant);
        if (asked.say._tag === 'Approve' && Option.isSome(stale))
          return yield* VerbRefused.make({
            point: point.id,
            variant: variant.id,
            verb: 'approve',
            reason: stale.value,
          });
        const at = yield* Clock.currentTimeMillis;
        const subject = subjectAt(point.ref, address, variant);
        const after = yield* catalogues.update(folder.paths(film), (catalogue) => {
          const next = said(catalogue, subject, asked.say, at);
          return [next, next] as const;
        });
        yield* Effect.log(
          `choices.say film=${film} point=${point.id} variant=${variant.id.slice(0, 12)} say=${asked.say._tag}`,
        );
        const result: FilmChoices = {
          film,
          pictures: yield* review.pictures(film),
          points: known.map(sayAgain(after)),
        };
        return result;
      });

      const alone = Effect.fn('Choices.alone')(function* (
        film: FilmName,
        point: string,
        variant: string,
      ) {
        const found = yield* Effect.fromResult(offered(film, yield* points(film), point, variant));
        const unheard = () =>
          VerbRefused.make({
            point,
            variant,
            verb: 'hear alone',
            reason: 'it is not heard alone',
          });
        const media = found.variant.media;
        if (media._tag !== 'Heard' || !media.alone) return yield* unheard();
        const { ref } = found.point;
        if (ref._tag === 'Voice') {
          const at = yield* takes.attemptFile(folder.paths(film), ref.beat, variant);
          return yield* Effect.fromOption(at, unheard);
        }
        if (ref._tag !== 'Take') return yield* unheard();
        const name = ref.sound;
        const manifest = yield* lockOf(unheard);
        const lock = yield* store.read(manifest);
        const take = Option.flatMap(Option.fromUndefinedOr(lock[name]), (entry) =>
          Arr.findFirst([...entry.variants, ...entry.candidates], (v) => v.sha256 === variant),
        );
        if (Option.isSome(take)) return path.join(path.dirname(manifest.file), take.value.file);
        const file = `sound/${cacheKey([variant])}.wav`;
        return yield* once(
          sounding,
          file,
          review.derive(file, (temporary) => fresh.sound(film, point, variant, temporary)),
        );
      });

      const derived = (name: string, film: FilmName, point: string, variant: string) =>
        review.derive(name, (temporary) =>
          fresh
            .mix(film, point, variant, temporary)
            .pipe(Effect.tap(() => Effect.log(`review.mix film=${film} name=${name}`))),
        );

      const mixing = yield* FiberMap.make<string, string, FreshError | ReviewToolFailed>();
      const oneMix = yield* Semaphore.make(1);

      const inPlace = Effect.fn('Choices.inPlace')(function* (
        film: FilmName,
        point: string,
        variant: string,
      ) {
        const key = cacheKey([film, point, variant, yield* stamp(film)]);
        const name = `mix/${film}/${key}.m4a`;
        return yield* once(
          mixing,
          name,
          derived(name, film, point, variant).pipe(Semaphore.withPermits(oneMix, 1)),
        );
      });

      return Choices.of({
        list,
        checked,
        pick,
        say,
        alone,
        inPlace,
      });
    }),
  );
}
