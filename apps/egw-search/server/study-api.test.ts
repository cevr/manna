import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Context, Effect, FileSystem, Layer, Logger, Option, type Scope } from 'effect';
import { Etag, HttpPlatform } from 'effect/http';
import { HttpApiTest } from 'effect/http-api';

import { SearchApi } from './api.js';
import { StudyPacks, studyGroupOver, studyVersionAt } from './study-api.js';

/** A made-up pack as `tools/study.ts` writes one: its version before its body. */
const madeUp = (version: string) =>
  `{"format":1,"version":"${version}","count":1,"sum":0,"parts":["1.1.1"]}`;

const XREFS = madeUp('1-0a0b0c0d');

/** The handler through the `HttpApi` test client, over `packs` by key. */
const asking = (packs: ReadonlyMap<string, string>) =>
  Effect.gen(function* () {
    const client = yield* HttpApiTest.groups(SearchApi, ['study']);
    return (name: 'xrefs' | 'tags' | 'lexicon', ifNoneMatch?: string) =>
      Effect.gen(function* () {
        const response = yield* client.study.pack({
          params: { name },
          headers: { 'if-none-match': ifNoneMatch },
          responseMode: 'response-only',
        });
        return {
          status: response.status,
          etag: response.headers['etag'],
          cacheControl: response.headers['cache-control'],
          body: yield* response.text,
        };
      });
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        studyGroupOver(packs),
        Etag.layer,
        HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
        BunServices.layer,
      ),
    ),
  );

const runScoped = <A, E>(program: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(Logger.layer([]))));

describe('GET /api/study/:name', () => {
  test('answers a published pack whole, its version as its ETag, cacheable for an hour', () =>
    runScoped(
      Effect.gen(function* () {
        const ask = yield* asking(new Map([['xrefs.json', XREFS]]));
        const answer = yield* ask('xrefs');
        expect(answer.status).toBe(200);
        expect(answer.body).toBe(XREFS);
        expect(answer.etag).toBe('"1-0a0b0c0d"');
        expect(answer.cacheControl).toBe('public, max-age=3600');
      }),
    ));

  test('answers 304 with no body for its version, and the pack for any other', () =>
    runScoped(
      Effect.gen(function* () {
        const ask = yield* asking(new Map([['xrefs.json', XREFS]]));
        const same = yield* ask('xrefs', '"1-0a0b0c0d"');
        expect([same.status, same.body]).toEqual([304, '']);
        const older = yield* ask('xrefs', '"1-00000000"');
        expect([older.status, older.body]).toEqual([200, XREFS]);
      }),
    ));

  test('a pack not yet published is 404, and one whose head names no version is 500', () =>
    runScoped(
      Effect.gen(function* () {
        const ask = yield* asking(new Map([['tags.json', '{"parts":[]}']]));
        expect((yield* ask('lexicon')).status).toBe(404);
        expect((yield* ask('tags')).status).toBe(500);
      }),
    ));
});

describe('the Bun server reads the packs from a directory', () => {
  test('a file there is the pack, an absent one none', () =>
    runScoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(`${directory}/xrefs.json`, XREFS);
        const packs = Context.get(
          yield* Layer.build(StudyPacks.layerDirectory(directory)),
          StudyPacks,
        );
        expect(yield* packs.current('xrefs')).toEqual(
          Option.some({ version: '1-0a0b0c0d', body: XREFS }),
        );
        expect(yield* packs.current('tags')).toEqual(Option.none());
      }).pipe(Effect.provide(BunServices.layer)),
    ));

  test("the version is read from the head alone, as the phone's downloader reads it", () => {
    expect(studyVersionAt(XREFS)).toEqual(Option.some('1-0a0b0c0d'));
    expect(studyVersionAt(`${' '.repeat(300)}${XREFS}`)).toEqual(Option.none());
  });
});
