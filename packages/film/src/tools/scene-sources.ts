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

export type Field = 'timeline' | 'knobs';

export interface Located {
  readonly sites: ReadonlyMap<string, SceneSite>;
  readonly unlocated: ReadonlyArray<SceneNotLocated>;
}

export type LocateError = FilmUnknown | FilmModuleInvalid | FreshError | PlatformError;

interface SceneSourcesService {
  readonly locate: (film: string) => Effect.Effect<Located, LocateError>;
  readonly site: (
    film: string,
    scene: string,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated>;
  readonly writable: (
    film: string,
    scene: string,
    field: Field,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated | SourceShared>;
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

const SITES_KEPT = 8;

export class SceneSources extends Context.Service<SceneSources, SceneSourcesService>()(
  '@manna/film/tools/SceneSources',
) {
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
