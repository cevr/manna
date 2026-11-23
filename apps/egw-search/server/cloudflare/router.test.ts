import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import type * as Http from 'alchemy/Http';
import { makeRequestEffect } from 'alchemy/Workers/Workerd/HttpServer';
import { Effect, Layer, Logger, Option, Schema as S, Scope } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';

import { GOLDEN_TOPIC_QUERY, goldenSearchLayer } from '@manna/core/search/testing';
import { NO_SELECTION } from '@manna/core/writings';

import { CommentaryPackSchema, SearchRequest, type SearchSlot } from '../api.js';
import { CommentaryPacks, edgeStore } from '../commentary-api.js';
import { countedCorpus, madeUpCorpus, madeUpPack } from '../commentary-fixture.js';
import { StudyPacks } from '../study-api.js';
import { VectorIndexLoad } from '../vector-index.js';
import { searchRouter } from './router.ts';

/** A value as a settled promise, the way the Web `Cache` answers. */
const settled = <A>(value: A) => Effect.runPromise(Effect.succeed(value));

/** An edge cache in memory: a Web `Cache`'s `match` and `put`, by URL. */
const memoryCache = () => {
  const kept = new Map<string, Response>();
  const keyOf = (key: RequestInfo | URL) => new Request(key).url;
  const cache: Pick<Cache, 'match' | 'put'> = {
    match: (key) => settled(kept.get(keyOf(key))?.clone()),
    put: (key, response) => settled(void kept.set(keyOf(key), response)),
  };
  return { kept, open: () => settled(cache) };
};

/** The study packs' bucket, as `bun run study:publish` leaves it: the tags alone published. */
const STUDY_TAGS = '{"format":1,"version":"1-00c0ffee","count":1,"sum":12648430,"parts":["-"]}';
const STUDY_BUCKET = new Map([['tags.json', STUDY_TAGS]]);

/** The Worker's services over a counted made-up corpus and an edge cache. */
const servicesOver = (
  corpus: ReturnType<typeof countedCorpus>,
  cache: ReturnType<typeof memoryCache>,
) =>
  Layer.mergeAll(
    goldenSearchLayer(),
    Layer.succeed(VectorIndexLoad, VectorIndexLoad.of({ readiness: Effect.succeed('ready') })),
    SqliteClient.layer({ filename: ':memory:' }),
    CommentaryPacks.layerStore(edgeStore(cache.open)).pipe(Layer.provide(corpus.layer)),
    StudyPacks.layerRead((key) => Effect.succeed(Option.fromUndefinedOr(STUDY_BUCKET.get(key)))),
  ).pipe(Layer.orDie);

/**
 * The Worker builds its router on the first request, inside that request's
 * fiber. These tests build it the same way and then ask it again, so a
 * router that kept anything of the first request answers the second wrong.
 */
const services = servicesOver(countedCorpus(madeUpCorpus), memoryCache());

const store = { names: Effect.succeed([]), open: () => Effect.succeedNone };

const searching = (q: string): SearchRequest => ({
  q,
  scope: 'egw',
  section: NO_SELECTION,
  type: NO_SELECTION,
  subtype: NO_SELECTION,
  excludeApparatus: false,
  limit: 10,
  context: 0,
});

const batchBody = S.encodeSync(S.fromJsonString(S.Struct({ requests: S.Array(SearchRequest) })));

/** A POST to the batch endpoint, as the page sends one search. */
const batchRequest = (q: string) =>
  HttpServerRequest.fromWeb(
    new Request('http://localhost/api/search/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: batchBody({ requests: [searching(q)] }),
    }),
  );

/** The batch's one answer, a line per hit. */
const hitLines = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.promise((): Promise<{ readonly results: readonly SearchSlot[] }> =>
    HttpServerResponse.toWeb(response).json(),
  ).pipe(
    Effect.map(({ results }) =>
      results.flatMap((slot) => {
        if (slot._tag === 'Failed') return [`failed: ${slot.message}`];
        return slot.response.hits.map((hit) => `${hit.bookCode} ${hit.text}`);
      }),
    ),
  );

/** The router built lazily, as the Worker builds it, and a search through
 *  it: the first search builds it. */
const lazyRouter = Effect.gen(function* () {
  const scope = yield* Scope.Scope;
  const context = yield* Layer.build(services);
  const app = yield* Effect.cached(searchRouter(context, store, scope));
  return (q: string) =>
    Effect.flatten(app).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, batchRequest(q)),
      Effect.flatMap(hitLines),
    );
});

const run = <A, E>(program: Effect.Effect<A, E, Scope.Scope | BunServices.BunServices>) =>
  Effect.runPromise(
    program.pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(BunServices.layer, Logger.layer([]))),
    ),
  );

describe('searchRouter built inside the first request', () => {
  test('a later POST is answered from its own body, not the first one', () =>
    run(
      Effect.gen(function* () {
        const search = yield* lazyRouter;
        const topic = yield* search(GOLDEN_TOPIC_QUERY);
        expect(topic.length).toBeGreaterThan(0);

        expect(yield* search('qqxzv')).toEqual([]);
        expect(yield* search(GOLDEN_TOPIC_QUERY)).toEqual(topic);
      }),
    ));

  test('a search after a first one that found nothing still finds its hits', () =>
    run(
      Effect.gen(function* () {
        const search = yield* lazyRouter;
        expect(yield* search('qqxzv')).toEqual([]);
        expect((yield* search(GOLDEN_TOPIC_QUERY)).length).toBeGreaterThan(0);
      }),
    ));
});

const decodePack = S.decodeUnknownSync(S.fromJsonString(CommentaryPackSchema));

/** A Web request answered through alchemy's Worker bridge, as the deployed
 *  Worker's `fetch` answers it: the response's own handlers (CORS) applied. */
const bridged = <R>(
  request: Request,
  fetch: Http.HttpEffect<R>,
): Effect.Effect<Response, never, R> =>
  makeRequestEffect(request as unknown as Parameters<typeof makeRequestEffect>[0], fetch);

/** The Worker's router over `corpus` and `cache`, built on the first ask, and
 *  an ask of the pack through it. */
const packRouter = (
  corpus: ReturnType<typeof countedCorpus>,
  cache: ReturnType<typeof memoryCache>,
) =>
  Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    const context = yield* Layer.build(servicesOver(corpus, cache));
    const app = yield* Effect.cached(searchRouter(context, store, scope));
    return (url: string, headers: Record<string, string> = {}, method = 'GET') =>
      bridged(new Request(url, { method, headers }), Effect.flatten(app)).pipe(
        Effect.flatMap((web) =>
          Effect.gen(function* () {
            const body = yield* Effect.promise(() => web.text());
            const header = (name: string) => web.headers.get(name) ?? '';
            return {
              status: web.status,
              etag: header('etag'),
              body,
              cors: {
                origin: header('access-control-allow-origin'),
                exposed: header('access-control-expose-headers'),
                methods: header('access-control-allow-methods'),
                headers: header('access-control-allow-headers'),
              },
            };
          }),
        ),
      );
  });

describe('the commentary pack through the Worker router', () => {
  test('answers the pack, and the second ask within the hour reads it from the edge cache', () =>
    run(
      Effect.gen(function* () {
        const corpus = countedCorpus(madeUpCorpus);
        const cache = memoryCache();
        const ask = yield* packRouter(corpus, cache);

        const first = yield* ask('https://egw.example/api/commentary/pack');
        const pack = decodePack(first.body);
        expect(first.status).toBe(200);
        expect({ notes: pack.notes, verses: pack.verses }).toEqual(madeUpPack);
        expect([...cache.kept.keys()]).toEqual(['https://egw.example/api/commentary/pack']);
        const reads = corpus.reads.value;
        expect(reads).toBeGreaterThan(0);

        const second = yield* ask('https://egw.example/api/commentary/pack?again=1');
        expect([second.status, second.body, second.etag]).toEqual([200, first.body, first.etag]);
        const unchanged = yield* ask('https://egw.example/api/commentary/pack', {
          'if-none-match': first.etag,
        });
        expect([unchanged.status, unchanged.body]).toEqual([304, '']);
        expect(corpus.reads.value).toBe(reads);
      }),
    ));

  test('a failed read answers 500 and is not kept', () =>
    run(
      Effect.gen(function* () {
        const cache = memoryCache();
        const ask = yield* packRouter(countedCorpus(madeUpCorpus, { failing: true }), cache);
        expect((yield* ask('https://egw.example/api/commentary/pack')).status).toBe(500);
        expect(cache.kept.size).toBe(0);
      }),
    ));
});

describe('the study packs through the Worker router', () => {
  test('a published pack is answered from its bucket, 304 for its version, and one not published is 404', () =>
    run(
      Effect.gen(function* () {
        const ask = yield* packRouter(countedCorpus(madeUpCorpus), memoryCache());
        const tags = yield* ask('https://egw.example/api/study/tags');
        expect([tags.status, tags.body, tags.etag]).toEqual([200, STUDY_TAGS, '"1-00c0ffee"']);
        const same = yield* ask('https://egw.example/api/study/tags', {
          'if-none-match': tags.etag,
        });
        expect([same.status, same.body]).toEqual([304, '']);
        expect((yield* ask('https://egw.example/api/study/xrefs')).status).toBe(404);
      }),
    ));
});

describe('the packs across origins through the Worker router', () => {
  /** A page on another origin, as Heartseed's web build is to egw.cvr.im. */
  const origin = { origin: 'http://127.0.0.1:4999' };
  const read = { origin: '*', exposed: 'etag', methods: '', headers: '' };

  test('a pack, its 304 and a pack not published carry the origin and expose the ETag', () =>
    run(
      Effect.gen(function* () {
        const ask = yield* packRouter(countedCorpus(madeUpCorpus), memoryCache());
        const pack = yield* ask('https://egw.example/api/commentary/pack', origin);
        expect([pack.status, pack.cors]).toEqual([200, read]);
        const same = yield* ask('https://egw.example/api/commentary/pack', {
          ...origin,
          'if-none-match': pack.etag,
        });
        expect([same.status, same.cors]).toEqual([304, read]);
        const tags = yield* ask('https://egw.example/api/study/tags', origin);
        expect([tags.status, tags.cors]).toEqual([200, read]);
        const tagsSame = yield* ask('https://egw.example/api/study/tags', {
          ...origin,
          'if-none-match': tags.etag,
        });
        expect([tagsSame.status, tagsSame.cors]).toEqual([304, read]);
        const absent = yield* ask('https://egw.example/api/study/xrefs', origin);
        expect([absent.status, absent.cors.origin]).toEqual([404, '*']);
      }),
    ));

  test("If-None-Match's preflight is answered for the packs alone", () =>
    run(
      Effect.gen(function* () {
        const ask = yield* packRouter(countedCorpus(madeUpCorpus), memoryCache());
        const preflight = {
          ...origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'if-none-match',
        };
        for (const path of ['/api/commentary/pack', '/api/study/words']) {
          const answer = yield* ask(`https://egw.example${path}`, preflight, 'OPTIONS');
          expect([path, answer.status, answer.cors.origin]).toEqual([path, 204, '*']);
          expect([answer.cors.methods, answer.cors.headers]).toEqual(['GET', 'if-none-match']);
        }
        const search = yield* ask('https://egw.example/api/search/batch', preflight, 'OPTIONS');
        expect([search.status, search.cors.origin]).toEqual([404, '']);
        const health = yield* ask('https://egw.example/health', origin);
        expect([health.status, health.cors.origin]).toEqual([200, '']);
      }),
    ));
});
