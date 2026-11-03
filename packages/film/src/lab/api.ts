import { Cause, Context, Effect, Layer, Predicate, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import * as HttpApiClient from 'effect/http-api/HttpApiClient';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import { LabHttpApi, Refusal, isRefusal } from '../core/api.ts';
import type { PageRequest } from '../core/page-render.ts';

class LabUnreachable extends Schema.TaggedError<LabUnreachable>()('LabUnreachable', {
  message: Schema.String,
}) {}

export type LabFailure = Refusal | LabUnreachable;

const LabFailure = Schema.Union([Refusal, LabUnreachable]);

export const served =
  <A, I>(key: string, success: Schema.Codec<A, I>) =>
  (read: Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>) =>
    Atom.serializable(read, {
      key,
      schema: AsyncResult.Schema({ success, error: LabFailure }),
    });

export const called = <A, E extends { readonly message: string }, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, LabFailure, R> =>
  Effect.mapError(self, (error): LabFailure => {
    if (isRefusal(error)) return error;
    return LabUnreachable.make({ message: error.message });
  });

export const reasonOf = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  if (Predicate.hasProperty(squashed, 'message') && Predicate.isString(squashed.message))
    return squashed.message;
  return String(squashed);
};

const pageClient = HttpApiClient.make(LabHttpApi);

const clientAt = (origin: string) => HttpApiClient.make(LabHttpApi, { baseUrl: origin });

export class LabClient extends Context.Service<LabClient, Effect.Success<typeof pageClient>>()(
  '@manna/film/lab/Client',
) {
  static readonly layer = Layer.effect(LabClient, pageClient).pipe(
    Layer.provideMerge(FetchHttpClient.layer),
  );
  static readonly layerAt = (origin: string) =>
    Layer.effect(LabClient, clientAt(origin)).pipe(Layer.provideMerge(FetchHttpClient.layer));
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
