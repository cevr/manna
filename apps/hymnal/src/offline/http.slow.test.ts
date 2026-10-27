/* oxlint-disable effect/noGlobals -- owned loopback HTTP fixture; Bun.serve is the host boundary tested by the actual fetch adapter. */
import { Context, Effect, Exit, Layer } from 'effect';
import { expect, it } from 'effect-bun-test';
import { Http } from './cache';
import { httpLayer } from './http';

class Origin extends Context.Service<Origin, { readonly url: string; readonly paths: string[] }>()(
  'test/OfflineOrigin',
) {}
const origin = (mode: string) =>
  Layer.effect(Origin)(
    Effect.gen(function* () {
      const paths: string[] = [];
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: '127.0.0.1',
            port: 0,
            fetch(request) {
              const path = new URL(request.url).pathname;
              paths.push(path);
              const range = request.headers.get('Range');
              let bytes = Uint8Array.from([255, 251, 0, 0, 0, 0, 0, 0]);
              let status = 206;
              const headers = new Headers({
                'Content-Type': 'audio/mpeg',
                'Content-Range': 'bytes 0-7/8',
                ETag: '"v1"',
              });
              if (mode === 'truncated') bytes = bytes.slice(0, 4);
              if (mode === 'overflow') bytes = new Uint8Array(9);
              if (mode === 'html') headers.set('Content-Type', 'text/html');
              if (mode === 'ignored') status = 200;
              if (mode === 'changed' && range?.startsWith('bytes=8-')) status = 416;
              return new Response(bytes, { status, headers });
            },
          }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      );
      return { url: `http://127.0.0.1:${server.port}`, paths };
    }),
  );
for (const mode of ['good', 'truncated', 'overflow', 'html', 'ignored', 'changed']) {
  const layer = Layer.unwrap(Effect.map(Origin, (o) => httpLayer(o.url))).pipe(
    Layer.provideMerge(origin(mode)),
  );
  it.effect(`offline bounded range adapter ${mode}`, () =>
    Effect.gen(function* () {
      const http = yield* Http;
      const server = yield* Origin;
      let at = 0;
      if (mode === 'changed') at = 8;
      const result = yield* Effect.exit(
        http.range({ number: 100, offset: -5 }, at, at + 262143, '"old"'),
      );
      if (mode === 'good' || mode === 'changed') {
        expect(Exit.isSuccess(result)).toBe(true);
        if (Exit.isSuccess(result)) {
          expect(result.value.bytes.length).toBe(8);
          expect(result.value.at).toBe(0);
        }
      } else expect(Exit.isFailure(result)).toBe(true);
      expect(server.paths.every((p) => p === '/audio/warm-1-down5/sdah/100.mp3')).toBe(true);
      let requests = 1;
      if (mode === 'changed') requests = 2;
      expect(server.paths.length).toBe(requests);
    }).pipe(Effect.provide(layer)),
  );
}
