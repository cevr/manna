/* oxlint-disable effect/noGlobals -- owned loopback HTTP fixture; Bun.serve is the host boundary tested by the actual fetch adapter. */
import { Context, Effect, Exit, Layer, Stream } from 'effect';
import { expect, it } from 'effect-bun-test';
import { CHUNK, Http, Offline, offlineLayer } from './cache';
import { httpLayer } from './http';
import { fake } from './fixture';

it.effect('offline multi-range requests obey the deployed bucket CORS headers', () =>
  Effect.gen(function* () {
    const bucket = yield* Effect.promise(() =>
      Bun.file(new URL('../../infra/bucket.ts', import.meta.url)).text(),
    );
    const allowed = [
      ...(bucket.match(/allowedHeaders:\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g),
    ].map((m) => m[1]);
    expect(allowed).toEqual(['range']);
    const rejected: string[] = [];
    let requests = 0;
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          hostname: '127.0.0.1',
          port: 0,
          fetch(request) {
            requests++;
            // Bun is not a browser: enforce the browser's non-safelisted request
            // header check as well as returning the deployed CORS allow list.
            for (const name of ['range', 'if-range'])
              if (request.headers.has(name) && !allowed.includes(name)) rejected.push(name);
            if (rejected.length) return new Response('', { status: 403 });
            const match = /bytes=(\d+)-(\d+)/.exec(request.headers.get('Range') ?? '');
            const at = Number(match?.[1]),
              last = Math.min(Number(match?.[2]), CHUNK + 7);
            const bytes = new Uint8Array(last - at + 1);
            if (at === 0) {
              bytes[0] = 255;
              bytes[1] = 251;
            }
            return new Response(bytes, {
              status: 206,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': allowed.join(','),
                'Access-Control-Expose-Headers': 'content-length,content-range,etag,accept-ranges',
                'Content-Type': 'audio/mpeg',
                'Content-Range': `bytes ${at}-${last}/${CHUNK + 8}`,
                ETag: '"v1"',
              },
            });
          },
        }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    );
    const f = fake();
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      yield* cache.enqueue({ number: 100, offset: 0 });
      yield* cache.changes.pipe(
        Stream.filter((s) => s.active + s.queued === 0),
        Stream.take(1),
        Stream.runDrain,
      );
      expect(rejected).toEqual([]);
      expect(requests).toBe(2);
      expect((yield* cache.snapshot).saved).toBe(1);
      // oxlint-disable-next-line effect/noInlineProvide -- this test boundary owns its dynamic loopback server and storage fixture.
    }).pipe(
      Effect.provide(
        offlineLayer.pipe(
          Layer.provide(f.media),
          Layer.provide(httpLayer(`http://127.0.0.1:${server.port}`)),
        ),
      ),
    );
  }).pipe(Effect.scoped),
);

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
        http.range({ number: 100, offset: -5 }, at, at + CHUNK - 1),
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
