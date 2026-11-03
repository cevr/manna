import { Effect, Fiber, Layer, Option } from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { describe, expect, it } from 'effect-bun-test';

import {
  CONTENT_MANIFEST_MAX_BYTES,
  CONTENT_MANIFEST_MAX_REDIRECTS,
  CONTENT_MANIFEST_ORIGINS,
  CONTENT_MANIFEST_TIMEOUT_MILLIS,
  CONTENT_MANIFEST_URL,
  isAllowedManifestOrigin,
} from './model.js';
import {
  ADAPTER_EXPECTATIONS,
  adapterConformance,
  decisionOverClient,
  fixtureManifestClient,
  FIXTURE_MANIFEST_ORIGINS,
  FIXTURE_MANIFEST_URL,
  FORBIDDEN_MANIFEST_URL,
  OFFERED_MANIFEST_BODY,
  OVERRUN_MANIFEST_BODY,
  OVERRUN_REVISION,
  unreachableManifestClient,
} from './testing.js';

interface RoutedClient {
  readonly layer: Layer.Layer<HttpClient.HttpClient>;
  readonly asked: () => readonly string[];
}

const routedClient = (routes: ReadonlyMap<string, Response>): RoutedClient => {
  const asked: string[] = [];
  return {
    asked: () => asked,
    layer: Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          asked.push(request.url);
          const answer = Option.getOrElse(
            Option.fromUndefinedOr(routes.get(request.url)),
            () => new Response('no such route', { status: 404 }),
          );
          return HttpClientResponse.fromWeb(request, answer.clone());
        }),
      ),
    ),
  };
};

const chunkedBody = (bytes: number): ReadableStream<Uint8Array> => {
  const chunk = new Uint8Array(16_384).fill(120);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    },
  });
};

describe('§10 M9 the manifest adapter', () => {
  it.effect('answers the whole cross-host table', () =>
    Effect.gen(function* () {
      expect(yield* adapterConformance).toEqual(ADAPTER_EXPECTATIONS);
    }),
  );

  it.effect('refuses a schema-major overrun', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: OVERRUN_MANIFEST_BODY }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.overrun);
      if (decision._tag !== 'refused') return;
      expect(decision.reason).toBe('schema-major');
      expect(String(decision.available.revision)).toBe(String(OVERRUN_REVISION));
    }),
  );

  it.effect('offers a manifest this build may install', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: OFFERED_MANIFEST_BODY }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.offered);
    }),
  );

  it.effect('reports offline when the host cannot reach the manifest', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({ client: unreachableManifestClient });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.unreachable);
    }),
  );

  it.effect('reports offline for a non-2xx rather than failing', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: 'no manifest is published', status: 404 }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.notFound);
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('404');
    }),
  );

  it.effect('reports offline for a body that is not a manifest', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: '<html>gateway error</html>' }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.malformed);
    }),
  );

  it.effect('refuses an address outside the allowed release origins, without fetching', () =>
    Effect.gen(function* () {
      let requests = 0;
      const counting: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            requests += 1;
            return HttpClientResponse.fromWeb(request, new Response(OFFERED_MANIFEST_BODY));
          }),
        ),
      );

      const decision = yield* decisionOverClient({
        client: counting,
        url: FORBIDDEN_MANIFEST_URL,
      });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('allowed release origin');
      expect(requests).toBe(0);
    }),
  );

  it.effect('refuses a hostname that only looks like the release host', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: OFFERED_MANIFEST_BODY }),
        url: 'https://github.com.attacker.test/manifest.json',
      });
      expect(decision._tag).toBe('offline');
    }),
  );

  it.effect('admits the pinned release URL', () =>
    Effect.sync(() => {
      expect(isAllowedManifestOrigin(CONTENT_MANIFEST_URL)).toBe(true);
    }),
  );

  it.effect('refuses a manifest whose declared size exceeds the cap, without reading it', () =>
    Effect.gen(function* () {
      const oversized: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(OFFERED_MANIFEST_BODY, {
                headers: {
                  'content-length': String(CONTENT_MANIFEST_MAX_BYTES + 1),
                },
              }),
            ),
          ),
        ),
      );

      const decision = yield* decisionOverClient({ client: oversized });
      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('size');
    }),
  );

  it.effect('reads a manifest whose declared size is exactly the cap', () =>
    Effect.gen(function* () {
      const atCap: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(OFFERED_MANIFEST_BODY, {
                headers: { 'content-length': String(CONTENT_MANIFEST_MAX_BYTES) },
              }),
            ),
          ),
        ),
      );

      expect((yield* decisionOverClient({ client: atCap }))._tag).toBe('offer');
    }),
  );

  it.effect('reports offline when the manifest read exceeds the timeout', () =>
    Effect.gen(function* () {
      const hanging: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.never),
      );

      const running = yield* Effect.forkChild(decisionOverClient({ client: hanging }));
      yield* TestClock.adjust(CONTENT_MANIFEST_TIMEOUT_MILLIS + 1);
      const decision = yield* Fiber.join(running);

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('timed out');
    }),
  );

  it.effect('reports offline for a manifest whose digest is not a sha256', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({
          body: '{"revision":"manifest-bad-digest","artifacts":{"topics":{"revision":"content-v4","url":"http://127.0.0.1:64999/topics.db","sha256":"not-a-digest","size":16384,"schema_major":1}}}',
        }),
      });
      expect(decision._tag).toBe('offline');
    }),
  );
  it.effect('follows one redirect to an allowed origin and reads the manifest there', () =>
    Effect.gen(function* () {
      const target = 'http://127.0.0.1:64999/redirected.json';
      const routed = routedClient(
        new Map([
          [FIXTURE_MANIFEST_URL, new Response('', { status: 302, headers: { location: target } })],
          [target, new Response(OFFERED_MANIFEST_BODY, { status: 200 })],
        ]),
      );

      const decision = yield* decisionOverClient({ client: routed.layer });

      expect(decision._tag).toBe('offer');
      expect(routed.asked()).toEqual([FIXTURE_MANIFEST_URL, target]);
    }),
  );

  it.effect('refuses a redirect that leaves the allowed origins', () =>
    Effect.gen(function* () {
      const routed = routedClient(
        new Map([
          [
            FIXTURE_MANIFEST_URL,
            new Response('', {
              status: 302,
              headers: { location: 'https://manifest.attacker.test/manifest.json' },
            }),
          ],
        ]),
      );

      const decision = yield* decisionOverClient({ client: routed.layer });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('allowed release origin');
      expect(routed.asked()).toEqual([FIXTURE_MANIFEST_URL]);
    }),
  );

  it.effect('stops following after the redirect bound', () =>
    Effect.gen(function* () {
      const step = (index: number) => `http://127.0.0.1:64999/hop-${String(index)}.json`;
      const routes = new Map<string, Response>([
        [FIXTURE_MANIFEST_URL, new Response('', { status: 302, headers: { location: step(0) } })],
      ]);
      for (let index = 0; index <= CONTENT_MANIFEST_MAX_REDIRECTS; index += 1) {
        routes.set(
          step(index),
          new Response('', { status: 302, headers: { location: step(index + 1) } }),
        );
      }
      const routed = routedClient(routes);

      const decision = yield* decisionOverClient({ client: routed.layer });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('redirected more times');
      expect(routed.asked().length).toBe(CONTENT_MANIFEST_MAX_REDIRECTS + 1);
    }),
  );

  it.effect('refuses an oversized body that declares no content length', () =>
    Effect.gen(function* () {
      const chunked: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(chunkedBody(CONTENT_MANIFEST_MAX_BYTES * 2), { status: 200 }),
            ),
          ),
        ),
      );

      const decision = yield* decisionOverClient({ client: chunked });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('size');
    }),
  );

  it.effect('the production allowlist is the release host alone', () =>
    Effect.sync(() => {
      expect(CONTENT_MANIFEST_ORIGINS).toEqual([new URL(CONTENT_MANIFEST_URL).origin]);
      expect(isAllowedManifestOrigin('http://127.0.0.1:64999/manifest.json')).toBe(false);
      expect(isAllowedManifestOrigin('http://localhost:64999/manifest.json')).toBe(false);
      expect(FIXTURE_MANIFEST_ORIGINS).toEqual([new URL(FIXTURE_MANIFEST_URL).origin]);
    }),
  );
});
