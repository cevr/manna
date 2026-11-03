import {
  Array as Arr,
  Cache,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  type Result,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  type FilmUnknown,
  SceneNotLocated,
  type SourceRefused,
  type SourceShared,
} from '../core/refusals.ts';
import type { FilmModuleInvalid } from './errors.ts';
import { FilmFolder, Stamped, filmNamed, keptWhenMade } from './film-repo.ts';
import { type FreshError, FreshFilm, type SceneSite } from './fresh-film.ts';
import { sceneCode } from './scene-source.ts';

export type { SceneSite } from './fresh-film.ts';

/** A drawing's field the lab writes: `timeline` for cues, `knobs` for knobs. */
export type Field = 'timeline' | 'knobs';

/** Every scene with a timeline or knobs: located, or why not. */
export interface Located {
  readonly sites: ReadonlyMap<string, SceneSite>;
  readonly unlocated: ReadonlyArray<SceneNotLocated>;
}

/** Why a film's scenes could not be located: the film, a module that does not load, a fresh run, a read. */
export type LocateError = FilmUnknown | FilmModuleInvalid | FreshError | PlatformError;

interface SceneSourcesService {
  /** Find every scene's drawing in the film's source. */
  readonly locate: (film: string) => Effect.Effect<Located, LocateError>;
  /** One scene's drawing, or why it has none the lab can edit. */
  readonly site: (
    film: string,
    scene: string,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated>;
  /** One scene's drawing where the lab may write `field`, or why it may not. */
  readonly writable: (
    film: string,
    scene: string,
    field: Field,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated | SourceShared>;
  /**
   * One scene's file as it stands now, and where in it each cue and knob
   * is written and read (`sceneCode`); read-only, so a field the lab may not
   * write is listed all the same.
   */
  readonly code: (
    film: string,
    scene: string,
  ) => Effect.Effect<
    ReturnType<typeof sceneCode> extends Result.Result<infer R, unknown>
      ? R & { readonly text: string; readonly site: SceneSite }
      : never,
    LocateError | SceneNotLocated | SourceRefused
  >;
}

/** How many films' sites the lab keeps: one film, a few stamps of it. */
const SITES_KEPT = 8;

export class SceneSources extends Context.Service<SceneSources, SceneSourcesService>()(
  '@manna/film/tools/SceneSources',
) {
  /** The service over a way to locate a film's scenes: each scene's site, and what of it is writable. */
  static readonly over = Effect.fn('SceneSources.over')(function* (
    locate: SceneSourcesService['locate'],
  ) {
    const fs = yield* FileSystem.FileSystem;

    const site = Effect.fn('SceneSources.site')(function* (film: string, scene: string) {
      const located = yield* locate(film);
      const found = Option.fromUndefinedOr(located.sites.get(scene));
      if (Option.isSome(found)) return found.value;
      const why = Arr.findFirst(located.unlocated, (u) => u.scene === scene);
      return yield* Option.match(why, {
        onSome: Effect.fail,
        onNone: () =>
          Effect.fail(
            SceneNotLocated.make({
              film,
              scene,
              reason: 'the film has no such scene with a timeline or knobs',
            }),
          ),
      });
    });

    const writable = Effect.fn('SceneSources.writable')(function* (
      film: string,
      scene: string,
      field: Field,
    ) {
      const at = yield* site(film, scene);
      const access = at.access[field];
      if (access._tag === 'Refused') return yield* access.error;
      return at;
    });

    const readCode = Effect.fn('SceneSources.code')(function* (film: string, scene: string) {
      const at = yield* site(film, scene);
      const text = yield* fs.readFileString(at.file);
      const found = yield* Effect.fromResult(sceneCode(at.shown, text, at.exportName));
      return { ...found, text, site: at };
    });

    return SceneSources.of({ locate, site, writable, code: readCode });
  });

  /**
   * The lab's: each film's scenes located by a fresh process (`film read
   * sites`), kept under the film's source stamp, so a locate costs a fresh
   * process only after a file under the film changed. A failed read is not
   * kept.
   */
  static readonly layer = Layer.effect(
    SceneSources,
    Effect.gen(function* () {
      const fresh = yield* FreshFilm;
      const folder = yield* FilmFolder;
      const read = yield* Cache.makeWith((at: Stamped) => fresh.sites(at.film), {
        capacity: SITES_KEPT,
        timeToLive: keptWhenMade,
      });
      const locate = Effect.fn('SceneSources.locate')(function* (film: string) {
        const name = yield* filmNamed(film);
        const stamp = yield* folder.stamp(name);
        const found = yield* Cache.get(read, new Stamped({ film: name, stamp }));
        return {
          sites: new Map(found.sites.map((s) => [s.scene, s])),
          unlocated: found.unlocated,
        };
      });
      return yield* SceneSources.over((film) =>
        locate(film).pipe(Effect.provideService(FilmFolder, folder)),
      );
    }),
  );
}
