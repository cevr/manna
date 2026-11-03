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

/** What a verb did: the change it made (none when it was already so), and the mix it made. */
interface Picked {
  /** The file it rewrote. */
  readonly file: string;
  readonly target: string;
  readonly change: Option.Option<Change>;
  /** When the track it mixed again landed; none when it mixed none. */
  readonly mixed: Remade;
}

type ChoicesError = FreshError | SourceRefused | StoreError | PlatformError;

/** The choices after a write, and the static check of the sources it left. */
interface Checked {
  readonly choices: FilmChoices;
  readonly findings: ReadonlyArray<CheckLine>;
}

interface ChoicesService {
  /** The film's choice points as they stand, and the renders they are heard against. */
  readonly list: (film: FilmName) => Effect.Effect<FilmChoices, ChoicesError>;
  /** `list` and the film's static check, from one fresh run: what a write answers. */
  readonly checked: (film: FilmName) => Effect.Effect<Checked, ChoicesError>;
  /** A verb on one variant, landed where the film declares its pick. */
  readonly pick: (
    film: FilmName,
    pick: PickPost,
  ) => Effect.Effect<Picked, ChoicesError | RewriteError | FormatFailed>;
  /**
   * One variant approved, its approvals withdrawn, or commented on, as it is
   * now; the choices after it (the points last read, said of again).
   */
  readonly say: (
    film: FilmName,
    asked: SayPost,
  ) => Effect.Effect<FilmChoices, ChoicesError | CatalogueError>;
  /** A variant's own file: a take's, an attempt's, or a seed's, rendered once into the review's cache. */
  readonly alone: (
    film: FilmName,
    point: string,
    variant: string,
  ) => Effect.Effect<string, ChoicesError | ReviewToolFailed>;
  /** The film's whole mix with the variant in place, as an m4a in the review's cache. */
  readonly inPlace: (
    film: FilmName,
    point: string,
    variant: string,
  ) => Effect.Effect<string, ChoicesError | ReviewToolFailed>;
}

/**
 * What the choices run with in the review, which runs for days: paths, files
 * (when a mixed track landed), the review's cache, the source writer and
 * fresh runs of the film CLI. No service here imports a film module or the
 * sound library, so a read of a film in this process does not compile; it
 * goes through `FreshFilm`.
 */
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

/** `point`'s say read again from `catalogue`. */
const sayAgain =
  (catalogue: Catalogue) =>
  (point: ChoicePoint): ChoicePoint =>
    withSay(Option.some(catalogue), point);

/** The point `id` among `points`, or `ChoiceUnknown` naming the ones there are. */
const offeredPoint = (
  film: string,
  points: ReadonlyArray<ChoicePoint>,
  id: string,
): Result.Result<ChoicePoint, ChoiceUnknown> =>
  Result.fromOption(pointNamed(points, id), () =>
    ChoiceUnknown.make({ film, point: id, known: points.map((p) => p.id) }),
  );

/** The variant `id` of `point`, or `VariantUnknown` naming the ones it has. */
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

/** The point and variant a request names, among `points`. */
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

/** Whether `verb` applies to `variant` as it stands, or why not. */
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

/** How a verb reads in a change's target: `keep`, `unkeep`, `reject`, `play`. */
const TAKE_ACT = { pick: 'keep', unpick: 'unkeep', reject: 'reject' } as const;

/** The films whose points are kept at a time: the review's films, with room. */
const POINTS_KEPT = 16;

/** A voice kept: the change Undo walks back, and the take as the fresh run kept it. */
interface VoiceKept {
  readonly picked: Picked;
  readonly kept: OptionsKept;
}

/**
 * The one way an attempt becomes its beat's take, from a voice pick through
 * the choices routes and the studio's keep and posted take alike: kept by the film CLI in
 * a fresh process (`film options keep-voice`: the script as it stands, the
 * word error checked again, a mismatch kept only when `acceptMismatch`
 * says so, and the track remixed), recorded around the timings' rewrite by
 * the SourceWriter with the takes the timings name (`Takes.named`) and the
 * track mixed from them (`film mix`). So every keep runs under the writer's
 * lock, one at a time with every other write, and Undo walks it back, the replaced take with it and the track remixed to play it.
 */
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

/** A film's track, as the writes that mix it read it; each looks at the file each time it runs, never when it is made. */
interface Track {
  /**
   * When the track landed (`Remade`): its mtime, asked under the writer's
   * lock right after the mix that renamed it into place, so it names that
   * mix and no later one; none when it is not there.
   */
  readonly landed: Effect.Effect<Remade>;
  /** What follows `sound.ts` and the timings: the track mixed again (`film mix`, fresh), answering when it landed. */
  readonly remake: Effect.Effect<Remade, FreshProcessFailed>;
}

/** `film`'s track (`Track`). */
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
      /** The seeds being rendered alone, by file, in the service's scope (as `mixing`). */
      const sounding = yield* FiberMap.make<string, string, FreshError | ReviewToolFailed>();
      /** What `keepVoice` runs with. */
      const keeping = yield* Effect.context<
        FileSystem.FileSystem | FilmFolder | SourceWriter | FreshFilm | Takes
      >();

      const fileIn = (film: FilmName, name: string) => path.join(folder.paths(film).dir, name);

      /** The app's library lock, or a refusal naming the verb when the app keeps no library. */
      const lockOf = (refused: () => VerbRefused) =>
        Effect.fromOption(Option.map(folder.sounds, lockManifest), refused);

      const stamp = folder.stamp;

      /** The points read at each stamp; a failed read is not kept. */
      const read = yield* Cache.makeWith((at: Stamped) => fresh.choices(at.film), {
        capacity: POINTS_KEPT,
        timeToLive: keptWhenMade,
      });

      /** The film's points as its sources stand now: read again only when its stamp moved. */
      const points = Effect.fn('Choices.points')(function* (film: FilmName) {
        return yield* Cache.get(read, new Stamped({ film, stamp: yield* stamp(film) }));
      });

      /** `answer` read fresh, its points kept under the stamp the sources had before the read. */
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

      /**
       * What follows `sound.ts`: the track mixed from it (`film mix`), mixed
       * again once a write of it lands, and on its Undo, each
       * answering when it landed (`Track.remake`). It names no file to bring
       * back or put away.
       */
      const mixedFrom = (film: FilmName) =>
        Effect.map(trackOf(film), (track): Follows => ({
          bring: () => Effect.void,
          putAway: () => Effect.void,
          remake: Option.some(track.remake),
        })).pipe(Effect.provideContext(keeping));

      /**
       * `option` played at `site` in the film's file `name` (`sound.ts`), which
       * a refusal names as is, through the writer; what follows the file
       * (`follows`) made again once it lands.
       */
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

      /** A take kept, unkept or rejected by its sha256 in a fresh process, recorded around the lock's rewrite. */
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

      /**
       * A voice picked: its attempt kept (`keepVoice`), one heard as something
       * else only when the pick accepts it anyway (`PickPost.acceptMismatch`).
       */
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

      /**
       * Record what the owner says of one variant in the film's catalogue. The
       * answer is the points last read, their say read again from the
       * catalogue the say left: no fresh run, since a say changes no source.
       */
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

      /** The mix `name` made in a fresh process: the film's with `variant` of `point` in place. */
      const derived = (name: string, film: FilmName, point: string, variant: string) =>
        review.derive(name, (temporary) =>
          fresh
            .mix(film, point, variant, temporary)
            .pipe(Effect.tap(() => Effect.log(`review.mix film=${film} name=${name}`))),
        );

      /**
       * The mixes being made, by name, in the service's scope, not the
       * request's: a page that stops waiting (a dropped connection, the next
       * 🔊) leaves one running, and the next ask joins it or finds it made.
       * One mix at a time: each renders the whole film.
       */
      const mixing = yield* FiberMap.make<string, string, FreshError | ReviewToolFailed>();
      const oneMix = yield* Semaphore.make(1);

      /**
       * The film's mix with `variant` of `point` in place, derived once into
       * the cache as an m4a. The fresh process checks the point and variant
       * are the film's: a name it lacks is answered as unknown, and nothing is
       * cached.
       */
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
