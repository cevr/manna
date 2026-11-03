import { Effect, Layer, Option, Schema } from 'effect';
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http';

import { corpusGeneration, corpusRevision } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { TOPICS_SCHEMA_MAJOR } from '../corpus-supply/file-artifact.js';
import {
  ContentFloor,
  ContentManifest,
  ContentManifestEntry,
  decideUpdate,
  type ContentDecision,
} from './model.js';

import { layerHttpContentManifestAt, readManifestOver } from './manifest-http.js';
import { ContentActivation, ContentUpdate } from './service.js';

const encodeManifest = Schema.encodeSync(Schema.fromJsonString(ContentManifest));

export const FIXTURE_MANIFEST_URL = 'http://127.0.0.1:64999/manifest.json';

export const FIXTURE_MANIFEST_ORIGINS: readonly string[] = [new URL(FIXTURE_MANIFEST_URL).origin];

export const liveAdapterOrigins = (...urls: readonly string[]): readonly string[] =>
  urls.map((url) => new URL(url).origin);

export const FORBIDDEN_MANIFEST_URL = 'https://manifest.attacker.test/manifest.json';

export const OVERRUN_MANIFEST_BODY = encodeManifest(
  ContentManifest.make({
    revision: corpusRevision('manifest-overrun'),
    artifacts: {
      topics: ContentManifestEntry.make({
        revision: corpusRevision('content-v9'),
        url: 'https://manifest.test/topics.db',
        sha256: `sha256:${'c'.repeat(64)}`,
        size: 16_384,
        schema_major: TOPICS_SCHEMA_MAJOR + 1,
        generation: corpusGeneration(9),
      }),
    },
  }),
);

export const OFFERED_MANIFEST_BODY = encodeManifest(
  ContentManifest.make({
    revision: corpusRevision('manifest-offered'),
    artifacts: {
      topics: ContentManifestEntry.make({
        revision: corpusRevision('content-v4'),
        url: 'https://manifest.test/topics.db',
        sha256: `sha256:${'d'.repeat(64)}`,
        size: 16_384,
        schema_major: TOPICS_SCHEMA_MAJOR,
        generation: corpusGeneration(4),
      }),
    },
  }),
);

export const FIXTURE_FLOOR: ContentFloor = ContentFloor.make({
  pinned: Option.none(),
  pinnedGeneration: Option.none(),
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

export const fixtureManifestClient = (input: {
  readonly body: string;
  readonly status?: number;
}): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(input.body, { status: input.status ?? 200 }),
        ),
      ),
    ),
  );

export const unreachableManifestClient: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          description: 'the fixture client is offline',
        }),
      }),
    ),
  ),
);

export const decisionOverClient = (input: {
  readonly client: Layer.Layer<HttpClient.HttpClient>;
  readonly url?: string;
  readonly origins?: readonly string[];
}): Effect.Effect<ContentDecision> =>
  readManifestOver(
    input.url ?? FIXTURE_MANIFEST_URL,
    input.origins ?? FIXTURE_MANIFEST_ORIGINS,
  ).pipe(
    Effect.provide(input.client),
    Effect.map((manifest) =>
      decideUpdate({
        corpus: 'topics',
        floor: FIXTURE_FLOOR,
        installed: Option.none(),
        manifest,
      }),
    ),
  );

export const ADAPTER_EXPECTATIONS = {
  overrun: 'refused',
  offered: 'offer',
  unreachable: 'offline',
  notFound: 'offline',
  malformed: 'offline',
} satisfies Record<string, ContentDecision['_tag']>;

export const OVERRUN_REVISION = corpusRevision('content-v9');

export const refusingContentUpdate: Layer.Layer<ContentUpdate> = ContentUpdate.Live.pipe(
  Layer.provide(
    layerHttpContentManifestAt(FIXTURE_MANIFEST_URL, FIXTURE_MANIFEST_ORIGINS).pipe(
      Layer.provide(fixtureManifestClient({ body: OVERRUN_MANIFEST_BODY })),
    ),
  ),
  Layer.provide(CorpusSupply.layer),
  Layer.provide(ContentActivation.Inert),
);

export const ADAPTER_CASES = {
  overrun: fixtureManifestClient({ body: OVERRUN_MANIFEST_BODY }),
  offered: fixtureManifestClient({ body: OFFERED_MANIFEST_BODY }),
  unreachable: unreachableManifestClient,
  notFound: fixtureManifestClient({ body: 'not found', status: 404 }),
  malformed: fixtureManifestClient({ body: '{"revision":"m","artifacts":{"topics":{}}}' }),
} satisfies Record<keyof typeof ADAPTER_EXPECTATIONS, Layer.Layer<HttpClient.HttpClient>>;

export const adapterConformance: Effect.Effect<Record<string, ContentDecision['_tag']>> =
  Effect.forEach(Object.entries(ADAPTER_CASES), ([name, client]) =>
    decisionOverClient({ client }).pipe(
      Effect.map((decision): readonly [string, ContentDecision['_tag']] => [name, decision._tag]),
    ),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));

export const ADAPTER_RESPONSES = {
  overrun: { body: OVERRUN_MANIFEST_BODY, status: 200 },
  offered: { body: OFFERED_MANIFEST_BODY, status: 200 },
  notFound: { body: OFFERED_MANIFEST_BODY, status: 404 },
  malformed: { body: '{"revision":"m","artifacts":{"topics":{}}}', status: 200 },
} satisfies Record<
  Exclude<keyof typeof ADAPTER_EXPECTATIONS, 'unreachable'>,
  { readonly body: string; readonly status: number }
>;

export const ADAPTER_ROUTES: readonly (readonly [
  string,
  { readonly body: string; readonly status: number },
])[] = Object.entries(ADAPTER_RESPONSES).map(([name, response]) => [`/${name}.json`, response]);

export const liveAdapterConformance = (input: {
  readonly client: Layer.Layer<HttpClient.HttpClient>;
  readonly baseUrl: string;
  readonly closedUrl: string;
}): Effect.Effect<Record<string, ContentDecision['_tag']>> =>
  Effect.forEach(
    [
      ...ADAPTER_ROUTES.map(([path]) => ({
        name: path.replace('/', '').replace('.json', ''),
        url: `${input.baseUrl}${path}`,
      })),
      { name: 'unreachable', url: input.closedUrl },
    ],
    (probe) =>
      decisionOverClient({
        client: input.client,
        url: probe.url,
        origins: liveAdapterOrigins(input.baseUrl, input.closedUrl),
      }).pipe(
        Effect.map((decision): readonly [string, ContentDecision['_tag']] => [
          probe.name,
          decision._tag,
        ]),
      ),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));
