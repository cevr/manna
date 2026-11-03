import { Effect, Layer, ManagedRuntime, Record as Rec, Schema, type Scope } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { NarrationUnreadable, type RigNameMissing, type RigUnloadable } from '../core/errors.ts';
import { type Timings, TimingsJson } from '../core/schema.ts';
import type { Film } from '../canvas/film.ts';
import type { PuppetImages, PuppetUnloadable } from '../puppet/images.ts';
import { PuppetImagesBrowser } from '../puppet/images-browser.ts';
import { loadPuppets } from '../puppet/load.ts';
import type { PaintingImages, PaintingUnloadable } from '../painting/images.ts';
import { PaintingImagesBrowser } from '../painting/images-browser.ts';
import { loadPaintings } from '../painting/load.ts';
import { loadRigs } from '../rive/load.ts';
import type { RiveRuntime } from '../rive/runtime.ts';
import { RiveRuntimeBrowser } from '../rive/runtime-browser.ts';

export interface Narrated {
  readonly timings: Timings;
  readonly audio: string;
  readonly fps: number;
}

interface FilmModule {
  readonly fps: number;
  readonly film: (narrated: Narrated) => Film;
}

export const NO_TAKES: Timings = { voice: '', scenes: {} };

export const narrationUrls = (id: string) => ({
  timings: `/films/${id}/narration/timings.json`,
  audio: `/films/${id}/narration/full.wav`,
});

export const narrationFileUrl = (id: string, file: string): string =>
  `/films/${encodeURIComponent(id)}/narration/${encodeURIComponent(file)}`;

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

export type FilmUnloadable =
  | NarrationUnreadable
  | RigUnloadable
  | RigNameMissing
  | PuppetUnloadable
  | PaintingUnloadable;

export const narratedFilms = <K extends string>(
  modules: Readonly<Record<K, () => Promise<FilmModule>>>,
  faces: Effect.Effect<void>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
  rive: Layer.Layer<RiveRuntime, never, HttpClient.HttpClient> = RiveRuntimeBrowser,
  images: Layer.Layer<PuppetImages, never, HttpClient.HttpClient> = PuppetImagesBrowser,
  paintings: Layer.Layer<PaintingImages, never, HttpClient.HttpClient> = PaintingImagesBrowser,
): Record<K, Effect.Effect<Film, FilmUnloadable, Scope.Scope>> => {
  const page = ManagedRuntime.make(
    Layer.mergeAll(rive, images, paintings).pipe(Layer.provideMerge(http)),
  );
  return Rec.map(modules, (load, id) =>
    Effect.flatMap(page.contextEffect, (services) =>
      Effect.all([Effect.promise(load), loadNarrated(id), faces], { concurrency: 3 }).pipe(
        Effect.flatMap(([m, narrated]) => declared(id, m, m.film({ ...narrated, fps: m.fps }))),
        Effect.flatMap(loadRigs),
        Effect.flatMap(loadPuppets),
        Effect.flatMap(loadPaintings),
        Effect.provideContext(services),
      ),
    ),
  );
};
