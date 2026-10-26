// A film's narration as its page loads it. The framework names the files by
// the film's id, the folder the tools read and write (`FilmPaths`: the
// timings under `narration/`, the mixed master beside them), so a film never
// builds its own URLs and the page and the tools lay out the same takes. A
// film with no timings file yet is laid out on estimates, as the tools lay it
// out; a file that is there but cannot be fetched or read is an error naming
// it, never a silent fall back to estimates. A film is given with the faces
// it draws in asked for (`narratedFilms`): what draws it waits for them. Its
// Rive rigs (the ones its drawings declare) are loaded before it is given, into
// the scope its load runs in, so its first frame finds them and whoever runs
// the load frees them; a rig that cannot load fails the film's load, and what
// the load had acquired is released with it, as it is when the load is stopped.

import { Effect, Layer, ManagedRuntime, Record as Rec, Schema, type Scope } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { NarrationUnreadable, type RigNameMissing, type RigUnloadable } from '../core/errors.ts';
import { type Timings, TimingsJson } from '../core/schema.ts';
import type { Film } from '../canvas/film.ts';
import { loadRigs } from '../rive/load.ts';
import type { RiveRuntime } from '../rive/runtime.ts';
import { RiveRuntimeBrowser } from '../rive/runtime-browser.ts';

/**
 * What a film's page is built from: its takes' timings, its master's URL and
 * the rate it declares (its module's `fps`, the one the tools lay it at), all
 * handed to `createFilm` as they are.
 */
export interface Narrated {
  readonly timings: Timings;
  readonly audio: string;
  readonly fps: number;
}

/**
 * A film's module as the registry loads it: the frames a second it declares
 * (`fps`: the one place a film's rate is written; the tools read it from the
 * same module), and the film, built from its narration.
 */
interface FilmModule {
  readonly fps: number;
  readonly film: (narrated: Narrated) => Film;
}

/** The timings of a film with no takes yet: every scene estimated, as the tools read no file. */
export const NO_TAKES: Timings = { voice: '', scenes: {} };

/** Where the page reads film `id`'s narration. */
export const narrationUrls = (id: string) => ({
  timings: `/films/${id}/narration/timings.json`,
  audio: `/films/${id}/narration/full.wav`,
});

/** A file in film `id`'s `narration/` folder (a staging take a beat's timings name), by its name. */
export const narrationFileUrl = (id: string, file: string): string =>
  `/films/${encodeURIComponent(id)}/narration/${encodeURIComponent(file)}`;

/** Film `id`'s narration: its timings (none yet on a 404) and its master's URL. */
export const loadNarrated = (
  id: string,
): Effect.Effect<Omit<Narrated, 'fps'>, NarrationUnreadable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const at = narrationUrls(id);
    const unreadable = (reason: string) =>
      NarrationUnreadable.make({ film: id, url: at.timings, reason });
    const http = yield* HttpClient.HttpClient;
    const res = yield* Effect.mapError(http.get(at.timings), (e) => unreadable(e.message));
    if (res.status === 404) return { timings: NO_TAKES, audio: at.audio };
    if (res.status < 200 || res.status >= 300) return yield* unreadable(`status ${res.status}`);
    const text = yield* Effect.mapError(res.text, (e) => unreadable(e.message));
    const timings = yield* Effect.mapError(Schema.decodeEffect(TimingsJson)(text), (e) =>
      unreadable(e.message),
    );
    return { timings, audio: at.audio };
  });

/**
 * `film`, film `id`'s page, made at the rate its module declares (`fps`, the
 * one the tools lay it at): a `film.ts` that makes its page at any other
 * would place its beats on frames no tool places them on, so its load dies
 * naming both rates.
 */
const declared = (id: string, m: FilmModule, film: Film): Effect.Effect<Film> =>
  Effect.as(
    Effect.when(
      Effect.die(
        new Error(`${id}'s film.ts makes its page at ${film.fps} fps, but declares ${m.fps} fps`),
      ),
      Effect.succeed(film.fps !== m.fps),
    ),
    film,
  );

/** Why a film's load failed: its narration unreadable, or a rig it declares not loadable. */
export type FilmUnloadable = NarrationUnreadable | RigUnloadable | RigNameMissing;

/**
 * The registry's loads: each film, keyed by its folder under `films/`, its
 * module and its narration read and the faces it draws in (`faces`, the
 * app's `pictureFaces`) asked for, together, and the film built from them:
 * a page lays its film out (its bar, its scenes) while the faces load, and
 * what draws the film waits for them (`pictureFacesWait`); the narration is
 * read through `http` (the page's `fetch` client unless given). The film is
 * given once its rigs are loaded (`loadRigs`) through `rive` (the page's Rive
 * runtimes unless given), built once with the page's first film, into the
 * scope the load runs in: each load of a film loads its own rigs, which
 * whoever runs it frees by closing that scope (a page's staged film keeps
 * them for the page's life, `stageFilm`). A load runs on its runner's fiber, so stopping the
 * runner stops the load; a load stopped or failed has released what it
 * acquired.
 */
export const narratedFilms = <K extends string>(
  modules: Readonly<Record<K, () => Promise<FilmModule>>>,
  faces: Effect.Effect<void>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
  rive: Layer.Layer<RiveRuntime, never, HttpClient.HttpClient> = RiveRuntimeBrowser,
): Record<K, Effect.Effect<Film, FilmUnloadable, Scope.Scope>> => {
  const page = ManagedRuntime.make(Layer.provideMerge(rive, http));
  return Rec.map(modules, (load, id) =>
    Effect.flatMap(page.contextEffect, (services) =>
      Effect.all([Effect.promise(load), loadNarrated(id), faces], { concurrency: 3 }).pipe(
        Effect.flatMap(([m, narrated]) => declared(id, m, m.film({ ...narrated, fps: m.fps }))),
        Effect.flatMap(loadRigs),
        Effect.provideContext(services),
      ),
    ),
  );
};
