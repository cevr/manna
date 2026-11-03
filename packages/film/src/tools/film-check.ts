import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import type { Film } from '../canvas/film.ts';
import { createTalk } from '../canvas/talk.ts';
import { type Narrated, narrationUrls } from '../player/narrated.ts';
import { PuppetImagesBun } from '../puppet/images-bun.ts';
import { PaintingImagesBun } from '../painting/images-bun.ts';
import { drawFindings } from './draw-check.ts';
import { FilmModuleInvalid } from './errors.ts';
import { type Address, type AddressError, type Scope, resolveAddress } from '../core/address.ts';
import {
  type LayoutError,
  type Placed,
  everyTakeRecorded,
  filmEnd,
  layout,
  sceneAt,
} from '../core/layout.ts';
import type { Short } from '../core/schema.ts';
import type { SafeZoneName } from '../core/shorts.ts';
import { talkPhrases } from '../core/talk.ts';
import { mixFindings, staticFindings } from './check.ts';
import { castReference } from './cast-library.ts';
import { Checker } from './checker.ts';
import {
  CastUnreadable,
  type ShortFinding,
  ShortHook,
  ShortLength,
  ShortLoop,
  type StaticFinding,
  ShortUnsafeText,
} from './findings.ts';
import { type LoadedFilm, masterFile, placeFilm } from './film-repo.ts';
import { type TalkVertical, shortStaticFindings } from './short-check.ts';
import { wedgedModule } from './wedge-module.ts';
import { lookFindings } from './look.ts';
import { Looker } from './looker.ts';
import { Media } from './media.ts';
import { Mixer, planKey, readMaster } from './mixer.ts';
import { measuredFilm } from './sound-render.ts';
import type { FlagRule } from './render-plan.ts';

export const CHECK_RULES: ReadonlyArray<FlagRule> = [
  ['sound', 'excludes', 'static', '--static leaves the mix out, --sound runs it'],
  ['sound', 'excludes', 'short', 'a short has no mix of its own'],
  ['draw', 'excludes', 'static', '--static draws nothing, --draw draws every scene'],
  ['draw', 'excludes', 'sound', '--sound hears the mix, --draw draws the scenes'],
  ['draw', 'excludes', 'short', 'a short is drawn by its page'],
  ['level', 'excludes', 'static', '--static draws nothing, --level changes what is drawn'],
  ['level', 'excludes', 'sound', '--sound hears the mix, --level changes only what is drawn'],
  ['level', 'excludes', 'short', "a short's page is drawn as the film plays"],
  [
    'folder',
    'needs',
    'static',
    "a version folder is checked from its files: the film's page draws the film",
  ],
];

interface LaidOut {
  readonly placed: ReadonlyArray<Placed>;
  readonly scope: Scope;
}

export const laidOut = (
  film: LoadedFilm,
  address: Address,
): Result.Result<LaidOut, LayoutError | AddressError> =>
  Result.flatMap(layout(film.scenes, film.timings, film.fps), (placed) =>
    Result.map(
      resolveAddress(
        { name: film.paths.name, placed, look: film.look, shorts: film.shorts },
        address,
      ),
      (scope): LaidOut => ({ placed, scope }),
    ),
  );

const talkVertical = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Option.Option<TalkVertical> =>
  Option.map(film.talk, ({ talk, cut }) => ({
    film: { id: film.paths.name, duration: filmEnd(placed), format: talk.format },
    phrases: talkPhrases(talk, cut, placed),
  }));

const asTalk =
  (placed: ReadonlyArray<Placed>) =>
  (finding: ShortFinding): ShortFinding => {
    const sceneOf = (t: number) =>
      Option.match(sceneAt(placed, t), {
        onNone: () => ({}),
        onSome: (p) => ({ scene: p.spec.id }),
      });
    return Match.value(finding).pipe(
      Match.tagsExhaustive({
        ShortUnsafeText: (f): ShortFinding => ShortUnsafeText.make({ ...f, ...sceneOf(f.at) }),
        ShortHook: (f): ShortFinding => {
          let at = 0;
          if (f.reason === 'late word') at = f.at;
          return ShortHook.make({ ...f, ...sceneOf(at) });
        },
        ShortLoop: (f): ShortFinding => ShortLoop.make({ ...f, talk: true }),
        ShortLength: (f): ShortFinding => ShortLength.make({ ...f, talk: true }),
      }),
    );
  };

const talkWords = (film: LoadedFilm, placed: ReadonlyArray<Placed>): ReadonlyArray<ShortFinding> =>
  Option.match(talkVertical(film, placed), {
    onNone: () => [],
    onSome: (talk) => shortStaticFindings(talk.film, talk.phrases).map(asTalk(placed)),
  });

export const staticLeg = Effect.fn('check.static')(function* (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const master = yield* readMaster(fs, yield* Media, film.paths);
  const measured = yield* measuredFilm(film);
  const key = yield* planKey(measured, placed);
  const file = path.relative(film.paths.dir, masterFile(film.paths)).split(path.sep).join('/');
  const found: ReadonlyArray<StaticFinding | ShortFinding> = [
    ...staticFindings(measured, placed, { master, key, file }),
    ...talkWords(film, placed),
  ];
  return found;
});

interface CastBeat {
  readonly id: string;
  readonly cast?: ReadonlyArray<string>;
}

export const castLeg = Effect.fn('check.cast')(function* (
  film: string,
  beats: ReadonlyArray<CastBeat>,
) {
  const members = Arr.dedupe(beats.flatMap((b) => b.cast ?? []));
  const found = yield* Effect.forEach(members, (member) =>
    Effect.match(castReference(film, member), {
      onSuccess: () => [],
      onFailure: (error) => [
        CastUnreadable.make({
          member,
          beats: beats.filter((b) => b.cast?.includes(member) === true).map((b) => b.id),
          reason: error.message,
        }),
      ],
    }),
  );
  return Arr.flatten(found);
});

export const soundLeg = Effect.fn('check.sound')(function* (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
) {
  if (!everyTakeRecorded(placed)) return [];
  const { plan, mixed } = yield* (yield* Mixer).render(film.paths.name, {
    warn: false,
    score: Option.none(),
    take: Option.none(),
  });
  return mixFindings(placed, plan, mixed);
});

export const layoutLeg = Effect.fn('check.layout')(function* (
  film: LoadedFilm,
  scope: Scope,
  workers: number,
  server: Option.Option<string>,
) {
  const checker = yield* Checker;
  const layout = yield* checker.layout(film, { workers, scope, server });
  const looked = yield* (yield* Looker).look(film, workers, scope, server);
  const placed = yield* placeFilm(film);
  const talk = yield* Effect.forEach(Option.toArray(talkVertical(film, placed)), (vertical) =>
    checker.talk(film, vertical, { workers, span: scope.span }),
  );
  return [...layout, ...lookFindings(looked, scope.acts), ...talk.flat().map(asTalk(placed))];
});

const FilmFile = Schema.Struct({
  film: Schema.declare((u): u is (narrated: Narrated) => Film => Predicate.isFunction(u)),
});

const drawnFindings = Effect.fnUntraced(function* (
  film: LoadedFilm,
  scenes: ReadonlySet<string>,
  swaps: ReadonlyMap<string, string>,
) {
  const path = yield* Path.Path;
  const file = path.join(film.paths.dir, 'film.ts');
  const invalid = (reason: string) =>
    FilmModuleInvalid.make({ film: film.paths.name, module: 'film.ts', reason });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const module = yield* wedgedModule(file, swaps).pipe(
        Effect.mapError((error) => invalid(error.reason)),
      );
      const { film: build } = yield* Schema.decodeUnknownEffect(FilmFile)(module).pipe(
        Effect.mapError((error) => invalid(error.message)),
      );
      const narrated = {
        timings: film.timings,
        audio: narrationUrls(film.paths.name).audio,
        fps: film.fps,
      };
      return yield* drawFindings(() => build(narrated), scenes);
    }),
  );
});

export const drawLeg = Effect.fn('check.draw')(
  function* (film: LoadedFilm, scope: Scope, swaps: ReadonlyMap<string, string>) {
    const scenes = new Set(scope.scenes.map((p) => p.spec.id));
    return yield* Option.match(film.talk, {
      onNone: () => drawnFindings(film, scenes, swaps),
      onSome: ({ talk, takes, cut }) =>
        Effect.scoped(drawFindings((): Film => createTalk(talk, takes, cut), scenes)),
    });
  },
  Effect.provide(Layer.mergeAll(PuppetImagesBun, PaintingImagesBun)),
);

export const shortLeg = Effect.fn('check.short')(function* (
  film: LoadedFilm,
  short: Short,
  options: { readonly static: boolean; readonly workers: number; readonly zone: SafeZoneName },
) {
  return yield* (yield* Checker).short(film, short, options);
});
