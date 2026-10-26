// The lab API as the page's machines call it: a client derived from the
// routes' one declaration (`LabHttpApi` in `core/api.ts`), so each body is
// encoded and each answer decoded by the route's own Schema. A refusal is
// the server's own failure class (`AskRefused`, …), its message the words
// the page shows; a request that never reached the server, or an answer
// that does not decode, is LabUnreachable in its own words. One client
// (`LabClient`) serves every page's calls; the ask page's build on it
// (`ask/api.ts`).

import { Cause, Context, Effect, Layer, Predicate, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import * as HttpApiClient from 'effect/http-api/HttpApiClient';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import { LabHttpApi, Refusal, isRefusal } from '../core/api.ts';
import type { PageRequest } from '../core/page-render.ts';

/** The request did not reach the server, or its answer did not decode. */
export class LabUnreachable extends Schema.TaggedError<LabUnreachable>()('LabUnreachable', {
  message: Schema.String,
}) {}

/** A call that failed: the server said no (its own failure), or could not be reached. */
export type LabFailure = Refusal | LabUnreachable;

/** A failed call as the page's data carries it from the server to the client (`served`). */
const LabFailure = Schema.Union([Refusal, LabUnreachable]);

/**
 * A read of the lab the server renders a page with and sends along, for the
 * client to adopt rather than read again (`Atom.serializable`, adopted by
 * `@manna/atom-solid`'s hooks): the read's answer, or its failure, encoded
 * by `success`'s schema and `LabFailure`'s, under `key`, which names it
 * among the page's reads.
 */
export const served =
  <A, I>(key: string, success: Schema.Codec<A, I>) =>
  (read: Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>) =>
    Atom.serializable(read, {
      key,
      schema: AsyncResult.Schema({ success, error: LabFailure }),
    });

/**
 * A call through a derived client as the page takes it: the server's refusal
 * as it is, anything else (the request failed, the answer did not decode)
 * LabUnreachable with its words.
 */
export const called = <A, E extends { readonly message: string }, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, LabFailure, R> =>
  Effect.mapError(self, (error): LabFailure => {
    if (isRefusal(error)) return error;
    return LabUnreachable.make({ message: error.message });
  });

/** A failed call, in the words its failure gives. */
export const reasonOf = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  if (Predicate.hasProperty(squashed, 'message') && Predicate.isString(squashed.message))
    return squashed.message;
  return String(squashed);
};

/**
 * The page's client: every group of `LabHttpApi`. Its requests carry paths,
 * which Effect's `HttpClient` resolves against the page's own address, so a
 * page never names its origin.
 */
const pageClient = HttpApiClient.make(LabHttpApi);

/** The client of the lab at `origin`. */
const clientAt = (origin: string) => HttpApiClient.make(LabHttpApi, { baseUrl: origin });

/**
 * The page's one client of the lab's API, derived from `LabHttpApi`: every
 * call a page makes goes through it. Its layers give the `fetch` client
 * beside it, for a file read by its URL (a review doc's text).
 */
export class LabClient extends Context.Service<LabClient, Effect.Success<typeof pageClient>>()(
  '@manna/film/lab/Client',
) {
  /** The client of the lab that served the page. */
  static readonly layer = Layer.effect(LabClient, pageClient).pipe(
    Layer.provideMerge(FetchHttpClient.layer),
  );
  /** The client of the lab at `origin`: a process with no page (a test). */
  static readonly layerAt = (origin: string) =>
    Layer.effect(LabClient, clientAt(origin)).pipe(Layer.provideMerge(FetchHttpClient.layer));
  /**
   * The client a server render of a page reads the lab with: the render's
   * own reads (`request.fetch`, answered by the lab that renders it), each
   * path resolved against the page's origin, as the browser resolves it.
   */
  static readonly layerRendering = (request: PageRequest) => {
    const origin = new URL(request.url).origin;
    const atOrigin = Layer.effect(
      HttpClient.HttpClient,
      Effect.map(
        HttpClient.HttpClient,
        HttpClient.mapRequest(HttpClientRequest.prependUrl(origin)),
      ),
    ).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, request.fetch)),
    );
    return Layer.effect(LabClient, pageClient).pipe(Layer.provideMerge(atOrigin));
  };
}
