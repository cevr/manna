import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer, Logger, Schema as S, type Scope } from 'effect';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';
import { HttpApiBuilder, HttpApiTest } from 'effect/http-api';

import { SearchService } from '@manna/core/search';

import { CommentaryPackSchema, SearchApi } from './api.js';
import { CommentaryMemoryLive, namesVersion } from './commentary-api.js';
import { countedCorpus, madeUpCorpus, madeUpPack } from './commentary-fixture.js';
import { notesSum } from './commentary.js';
import { SearchGroupLive } from './search-api.js';
import { studyGroupOver } from './study-api.js';
import { VectorIndexLoad } from './vector-index.js';

const decodePack = S.decodeUnknownSync(S.fromJsonString(CommentaryPackSchema));

/** The handler through the `HttpApi` test client, as the Bun server serves
 *  it: the pack kept in memory over `corpus`. */
const asking = (corpus: ReturnType<typeof countedCorpus>) =>
  Effect.gen(function* () {
    const client = yield* HttpApiTest.groups(SearchApi, ['commentary']);
    return (ifNoneMatch?: string) =>
      Effect.gen(function* () {
        const response = yield* client.commentary.pack({
          headers: { 'if-none-match': ifNoneMatch },
          responseMode: 'response-only',
        });
        return {
          status: response.status,
          etag: response.headers['etag'],
          cacheControl: response.headers['cache-control'],
          contentType: response.headers['content-type'],
          body: yield* response.text,
        };
      });
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        CommentaryMemoryLive.pipe(Layer.provide(corpus.layer)),
        Etag.layer,
        HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
        BunServices.layer,
      ),
    ),
  );

const run = <A, E>(program: Effect.Effect<A, E>) =>
  Effect.runPromise(program.pipe(Effect.provide(Logger.layer([]))));

const runScoped = <A, E>(program: Effect.Effect<A, E, Scope.Scope>) => run(Effect.scoped(program));

describe('GET /api/commentary/pack', () => {
  test('answers the pack with its version as its ETag, cacheable for an hour', () =>
    runScoped(
      Effect.gen(function* () {
        const ask = yield* asking(countedCorpus(madeUpCorpus));
        const answer = yield* ask();
        const pack = decodePack(answer.body);

        expect(answer.status).toBe(200);
        expect(answer.contentType).toStartWith('application/json');
        expect(answer.cacheControl).toBe('public, max-age=3600');
        expect(answer.etag).toBe(`"${pack.version}"`);
        expect({ notes: pack.notes, verses: pack.verses }).toEqual(madeUpPack);
        expect(pack.count).toBe(3);
        expect(pack.sum).toBe(notesSum(pack.notes));
      }),
    ));

  test('If-None-Match naming the version answers 304 with no body; another value the pack', () =>
    runScoped(
      Effect.gen(function* () {
        const ask = yield* asking(countedCorpus(madeUpCorpus));
        const { etag = '', body } = yield* ask();

        const unchanged = yield* ask(etag);
        expect([unchanged.status, unchanged.body, unchanged.etag]).toEqual([304, '', etag]);
        expect((yield* ask(`W/${etag}`)).status).toBe(304);
        expect((yield* ask('"0-00000000"')).status).toBe(200);
        expect((yield* ask('"0-00000000"')).body).toBe(body);
      }),
    ));

  test('the second ask within the hour reads nothing from the corpus', () =>
    runScoped(
      Effect.gen(function* () {
        const corpus = countedCorpus(madeUpCorpus);
        const ask = yield* asking(corpus);
        yield* ask();
        const first = corpus.reads.value;
        yield* ask();
        expect(first).toBeGreaterThan(0);
        expect(corpus.reads.value).toBe(first);
      }),
    ));

  test('no links at all answer a valid empty pack', () =>
    runScoped(
      Effect.gen(function* () {
        const ask = yield* asking(countedCorpus({ books: madeUpCorpus.books }));
        const pack = decodePack((yield* ask()).body);
        expect([pack.count, pack.notes, pack.verses, pack.version]).toEqual([
          0,
          [],
          {},
          '0-811c9dc5',
        ]);
      }),
    ));

  test('a corpus that cannot be read answers 500, and the next ask reads again', () =>
    runScoped(
      Effect.gen(function* () {
        const corpus = countedCorpus(madeUpCorpus, { failing: true });
        const ask = yield* asking(corpus);
        const failed = yield* ask();
        expect(failed.status).toBe(500);
        expect(failed.body).not.toContain('note');
        const reads = corpus.reads.value;
        expect((yield* ask()).status).toBe(500);
        expect(corpus.reads.value).toBeGreaterThan(reads);
      }),
    ));
});

describe('the Bun server', () => {
  test('serves the pack beside search from the one SearchApi, as main.ts builds it', () =>
    run(
      Effect.gen(function* () {
        const corpus = countedCorpus(madeUpCorpus);
        const search = Layer.mergeAll(
          Layer.succeed(SearchService, SearchService.of({ query: () => Effect.die('unused') })),
          Layer.succeed(
            VectorIndexLoad,
            VectorIndexLoad.of({ readiness: Effect.succeed('ready') }),
          ),
          SqliteClient.layer({ filename: ':memory:' }).pipe(Layer.orDie),
        );
        const { handler, dispose } = HttpRouter.toWebHandler(
          HttpApiBuilder.layer(SearchApi).pipe(
            Layer.provide(
              Layer.mergeAll(
                SearchGroupLive.pipe(Layer.provide(search)),
                CommentaryMemoryLive.pipe(Layer.provide(corpus.layer)),
                studyGroupOver(),
              ),
            ),
            Layer.provide([Etag.layer, HttpPlatform.layer]),
            Layer.provide(BunServices.layer),
          ),
          { disableLogger: true },
        );
        const answer = yield* Effect.promise(() =>
          handler(new Request('http://localhost/api/commentary/pack?any=query')),
        );
        const body = yield* Effect.promise(() => answer.text());
        const health = yield* Effect.promise(() => handler(new Request('http://localhost/health')));
        yield* Effect.promise(dispose);

        expect(answer.status).toBe(200);
        expect(decodePack(body).count).toBe(3);
        expect(health.status).toBe(200);
      }),
    ));
});

describe('namesVersion', () => {
  test('reads a tag list, weak or strong, quoted or bare, and *', () => {
    expect(namesVersion('"3-0000abcd"', '3-0000abcd')).toBe(true);
    expect(namesVersion('W/"3-0000abcd"', '3-0000abcd')).toBe(true);
    expect(namesVersion('"x", "3-0000abcd"', '3-0000abcd')).toBe(true);
    expect(namesVersion('3-0000abcd', '3-0000abcd')).toBe(true);
    expect(namesVersion('*', '3-0000abcd')).toBe(true);
    expect(namesVersion('"3-0000abce"', '3-0000abcd')).toBe(false);
    expect(namesVersion('', '3-0000abcd')).toBe(false);
  });
});
