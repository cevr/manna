import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, FileSystem, Layer, Logger, type Scope } from 'effect';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';

import { SearchService } from '@manna/core/search';

import { bunRoutes } from './bun-routes.js';
import { CommentaryMemoryLive } from './commentary-api.js';
import { countedCorpus, madeUpCorpus } from './commentary-fixture.js';
import { SearchGroupLive } from './search-api.js';
import { studyGroupOver } from './study-api.js';
import { VectorIndexLoad } from './vector-index.js';

const TAGS = '{"format":1,"version":"1-00c0ffee","count":1,"sum":12648430,"parts":["-"]}';

/** A page on another origin, as Heartseed's web build is to egw.cvr.im. */
const ORIGIN = 'http://127.0.0.1:4999';

/** What a cross-origin reader sees of an answer: its status and CORS headers. */
const seen = (answer: Response) => ({
  status: answer.status,
  allowOrigin: answer.headers.get('access-control-allow-origin'),
  exposed: answer.headers.get('access-control-expose-headers'),
  etag: answer.headers.get('etag'),
});

/** The Bun server's routes, as `main.ts` builds them, over a made-up corpus,
 *  the tags pack alone published, and an empty page directory; and an ask. */
const serving = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const page = yield* fs.makeTempDirectoryScoped();
  yield* fs.writeFileString(`${page}/index.html`, '<!doctype html>');
  const search = Layer.mergeAll(
    Layer.succeed(SearchService, SearchService.of({ query: () => Effect.die('unused') })),
    Layer.succeed(VectorIndexLoad, VectorIndexLoad.of({ readiness: Effect.succeed('ready') })),
    SqliteClient.layer({ filename: ':memory:' }).pipe(Layer.orDie),
  );
  const groups = Layer.mergeAll(
    SearchGroupLive.pipe(Layer.provide(search)),
    CommentaryMemoryLive.pipe(Layer.provide(countedCorpus(madeUpCorpus).layer)),
    studyGroupOver(new Map([['tags.json', TAGS]])),
  );
  const { handler, dispose } = HttpRouter.toWebHandler(
    bunRoutes(groups, page).pipe(
      Layer.provide([Etag.layer, HttpPlatform.layer]),
      Layer.provide(BunServices.layer),
    ),
    { disableLogger: true },
  );
  yield* Effect.addFinalizer(() => Effect.promise(dispose));
  return (path: string, init: RequestInit = {}) =>
    Effect.gen(function* () {
      const request = new Request(`http://localhost${path}`, {
        ...init,
        headers: { origin: ORIGIN, ...init.headers },
      });
      const answer = yield* Effect.promise(() => handler(request));
      yield* Effect.promise(() => answer.arrayBuffer());
      return answer;
    });
});

const run = <A, E>(program: Effect.Effect<A, E, FileSystem.FileSystem | Scope.Scope>) =>
  Effect.runPromise(
    program.pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(BunServices.layer, Logger.layer([]))),
    ),
  );

describe('the Bun server answers the packs across origins', () => {
  test('a pack, its 304 and a pack not published carry the origin and expose the ETag', () =>
    run(
      Effect.gen(function* () {
        const ask = yield* serving;
        const pack = seen(yield* ask('/api/commentary/pack'));
        expect(pack).toMatchObject({ status: 200, allowOrigin: '*', exposed: 'etag' });
        const same = seen(
          yield* ask('/api/commentary/pack', { headers: { 'if-none-match': pack.etag ?? '' } }),
        );
        expect(same).toMatchObject({ status: 304, allowOrigin: '*', exposed: 'etag' });
        expect(seen(yield* ask('/api/study/tags'))).toEqual({
          status: 200,
          allowOrigin: '*',
          exposed: 'etag',
          etag: '"1-00c0ffee"',
        });
        expect(seen(yield* ask('/api/study/xrefs'))).toMatchObject({
          status: 404,
          allowOrigin: '*',
        });
      }),
    ));

  test("If-None-Match's preflight is answered for the packs alone", () =>
    run(
      Effect.gen(function* () {
        const ask = yield* serving;
        const preflight = {
          method: 'OPTIONS',
          headers: {
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'if-none-match',
          },
        };
        for (const path of ['/api/commentary/pack', '/api/study/lexicon']) {
          const answer = yield* ask(path, preflight);
          expect([path, answer.status]).toEqual([path, 204]);
          expect(answer.headers.get('access-control-allow-origin')).toBe('*');
          expect(answer.headers.get('access-control-allow-methods')).toBe('GET');
          expect(answer.headers.get('access-control-allow-headers')).toBe('if-none-match');
        }
        const other = yield* ask('/api/search/batch', preflight);
        expect(other.headers.get('access-control-allow-origin')).toBeNull();
        expect((yield* ask('/health')).headers.get('access-control-allow-origin')).toBeNull();
      }),
    ));
});
