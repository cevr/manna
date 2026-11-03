import { Effect, Option } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { describe, expect, it } from 'effect-bun-test';

import { ADAPTER_EXPECTATIONS, ADAPTER_ROUTES, liveAdapterConformance } from './testing.js';

const serveFixtures = Effect.acquireRelease(
  Effect.sync(() => {
    const routes = new Map(ADAPTER_ROUTES);
    // oxlint-disable-next-line effect/noGlobals -- the point of this suite is a real socket, not a platform service over one
    return Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) => {
        const route = Option.fromUndefinedOr(routes.get(new URL(request.url).pathname));
        return Option.match(route, {
          onNone: () => new Response('no such fixture', { status: 404 }),
          onSome: (found) => new Response(found.body, { status: found.status }),
        });
      },
    });
  }),
  (server) => Effect.promise(() => server.stop(true)),
);

describe('§10 M9 the manifest adapter, over Bun’s real HTTP client', () => {
  it.scopedLive('answers the whole cross-host table over a real socket', () =>
    Effect.gen(function* () {
      const server = yield* serveFixtures;
      const table = yield* liveAdapterConformance({
        client: FetchHttpClient.layer,
        baseUrl: `http://127.0.0.1:${String(server.port)}`,
        closedUrl: 'http://127.0.0.1:1/manifest.json',
      });
      expect(table).toEqual(ADAPTER_EXPECTATIONS);
    }),
  );
});
