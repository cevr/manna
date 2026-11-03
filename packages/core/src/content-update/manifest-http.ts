import { Config, Effect, Layer, Option, Schema, Stream } from 'effect';
import { FetchHttpClient, Headers, HttpClient } from 'effect/http';
import type { HttpClientError } from 'effect/http';

import {
  CONTENT_MANIFEST_MAX_BYTES,
  CONTENT_MANIFEST_MAX_REDIRECTS,
  CONTENT_MANIFEST_ORIGINS,
  CONTENT_MANIFEST_TIMEOUT_MILLIS,
  CONTENT_MANIFEST_URL,
  ContentManifest,
  isAllowedOrigin,
  manifestFetched,
  manifestUnavailable,
  redirectTarget,
  type ManifestFetchOutcome,
} from './model.js';
import { ContentManifestSource } from './service.js';

const contentManifestUrl: Config.Config<string> = Config.String('BIBLE_CONTENT_MANIFEST_URL').pipe(
  Config.withDefault(CONTENT_MANIFEST_URL),
);

const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(ContentManifest));

const manualRedirects = Effect.provideService(FetchHttpClient.RequestInit, {
  redirect: 'manual',
});

interface BodyFold {
  readonly chunks: readonly Uint8Array[];
  readonly read: number;
  readonly overflowed: boolean;
}

const boundedBody = (
  stream: Stream.Stream<Uint8Array, HttpClientError.HttpClientError>,
): Effect.Effect<Option.Option<string>, HttpClientError.HttpClientError> =>
  stream.pipe(
    Stream.runFold(
      (): BodyFold => ({ chunks: [], read: 0, overflowed: false }),
      (state: BodyFold, chunk: Uint8Array): BodyFold => {
        const read = state.read + chunk.byteLength;
        if (read > CONTENT_MANIFEST_MAX_BYTES) {
          return { chunks: [], read, overflowed: true };
        }
        return { chunks: [...state.chunks, chunk], read, overflowed: false };
      },
    ),
    Effect.map((state) => {
      if (state.overflowed) return Option.none<string>();
      const body = new Uint8Array(state.read);
      let offset = 0;
      for (const chunk of state.chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return Option.some(new TextDecoder().decode(body));
    }),
  );

export const readManifestOver = (
  url: string,
  origins: readonly string[] = CONTENT_MANIFEST_ORIGINS,
): Effect.Effect<ManifestFetchOutcome, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const hop = (
      address: string,
      followed: number,
    ): Effect.Effect<
      ManifestFetchOutcome,
      HttpClientError.HttpClientError | Schema.SchemaError,
      HttpClient.HttpClient
    > =>
      Effect.gen(function* () {
        if (!isAllowedOrigin(address, origins)) {
          return manifestUnavailable('manifest address is not an allowed release origin');
        }
        const response = yield* HttpClient.get(address);
        const next = redirectTarget(
          response.status,
          Headers.get(response.headers, 'location'),
          address,
        );
        if (Option.isSome(next)) {
          if (followed >= CONTENT_MANIFEST_MAX_REDIRECTS) {
            return manifestUnavailable('manifest redirected more times than this build follows');
          }
          return yield* hop(next.value, followed + 1);
        }
        if (response.status < 200 || response.status >= 300) {
          return manifestUnavailable(`manifest responded HTTP ${String(response.status)}`);
        }
        const declared = Option.flatMap(Headers.get(response.headers, 'content-length'), (raw) =>
          Schema.decodeOption(Schema.Int)(Number(raw)),
        );
        if (Option.exists(declared, (length) => length > CONTENT_MANIFEST_MAX_BYTES)) {
          return manifestUnavailable('manifest body exceeds the size this build will read');
        }
        const body = yield* boundedBody(response.stream);
        if (Option.isNone(body)) {
          return manifestUnavailable('manifest body exceeds the size this build will read');
        }
        return manifestFetched(yield* decodeManifest(body.value));
      });
    return yield* hop(url, 0);
  }).pipe(
    manualRedirects,
    Effect.timeoutOrElse({
      duration: CONTENT_MANIFEST_TIMEOUT_MILLIS,
      orElse: () => Effect.succeed(manifestUnavailable('manifest read timed out')),
    }),
    Effect.catchTags({
      HttpClientError: (cause) =>
        Effect.succeed(manifestUnavailable(`manifest unreachable: ${cause.reason._tag}`)),
      SchemaError: () =>
        Effect.succeed(
          manifestUnavailable('manifest body is not a content manifest this build can read'),
        ),
    }),
    Effect.scoped,
  );

export const layerHttpContentManifestAt = (
  url: string,
  origins?: readonly string[],
): Layer.Layer<ContentManifestSource, never, HttpClient.HttpClient> =>
  Layer.effect(
    ContentManifestSource,
    Effect.map(HttpClient.HttpClient, (client) =>
      ContentManifestSource.of({
        read: readManifestOver(url, origins).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      }),
    ),
  );

export const layerHttpContentManifest: Layer.Layer<
  ContentManifestSource,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  ContentManifestSource,
  Effect.gen(function* () {
    const url = yield* contentManifestUrl;
    const client = yield* HttpClient.HttpClient;
    return ContentManifestSource.of({
      read: readManifestOver(url).pipe(Effect.provideService(HttpClient.HttpClient, client)),
    });
  }).pipe(Effect.orDie),
);
