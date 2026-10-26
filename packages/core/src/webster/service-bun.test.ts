import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Result } from 'effect';
import { expect, it } from 'bun:test';

import { writeWebsterFixture } from './fixture-bun.js';
import { layerWebsterBun } from './service-bun.js';
import { WebsterService } from './service.js';
import type { WebsterEntry } from './model.js';

const exercise = (filename: string, cases: readonly (readonly [string, string])[]) =>
  Effect.gen(function* () {
    const service = yield* WebsterService;
    for (const [query, expected] of cases) {
      for (const spelling of [query, query.toUpperCase(), `  ${query}  `])
        expect((yield* service.lookup(spelling)).entries.map((entry) => entry.headword)).toEqual([
          expected,
        ]);
    }
    expect((yield* service.lookup('dismayed')).entries.map((entry) => entry.id)).toEqual([1]);
    expect((yield* service.lookup('duplicate')).entries.map((entry) => entry.id)).toEqual([4, 5]);
    expect((yield* service.lookup('unknowneth')).entries).toEqual([]);
    expect((yield* service.lookup('sitteth')).entries.map((entry) => entry.headword)).toEqual([
      'sitte',
    ]);
    expect((yield* service.search('courage deprived')).map((entry) => entry.id)).toEqual([1]);
    for (const query of ['courage', '"courage"', 'courage--'])
      expect((yield* service.search(query, 1)).map((entry) => entry.id)).toEqual([2]);
    for (const query of ['', '---', 'courage OR absent', 'NEAR(courage)'])
      expect(yield* service.search(query)).toEqual([]);
    expect((yield* service.search('charitable OR NEAR')).map((entry) => entry.id)).toEqual([6]);
    expect((yield* service.search('equal')).map((entry) => entry.id)).toEqual([4, 5]);
    expect(yield* service.search('headwordonly')).toEqual([]);
    expect(Result.isFailure(yield* Effect.result(service.search('courage', 101)))).toBe(true);
  }).pipe(Effect.provide(layerWebsterBun({ filename }).pipe(Layer.provide(BunServices.layer))));

it('real readonly SQLite carries bounded KJV rules and literal ranked AND definition search', () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-adapter-' });
        const filename = `${dir}/fixture.db`;
        const cases: [string, string][] = [
          ['abideth', 'abide'],
          ['loveth', 'love'],
          ['speaketh', 'speak'],
          ['speakest', 'speak'],
          ['makest', 'make'],
        ];
        for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
          cases.push(
            [`bare${letter}keth`, `bare${letter}k`],
            [`bare${letter}kest`, `bare${letter}k`],
          );
          cases.push(
            [`final${letter}keth`, `final${letter}ke`],
            [`final${letter}kest`, `final${letter}ke`],
          );
          cases.push(
            [`double${letter}kketh`, `double${letter}k`],
            [`double${letter}kkest`, `double${letter}k`],
          );
        }
        const entries: WebsterEntry[] = [
          { id: 1, headword: 'dismayed', definition: 'Disheartened; deprived of courage.' },
          { id: 2, headword: 'dismay', definition: 'Courage.' },
          { id: 3, headword: 'headwordonly', definition: 'Unrelated.' },
          { id: 4, headword: 'duplicate', definition: 'Equal.' },
          { id: 5, headword: 'duplicate', definition: 'Equal.' },
          { id: 6, headword: 'operator', definition: 'Charitable OR NEAR.' },
          { id: 7, headword: 'sit', definition: 'To rest.' },
          { id: 8, headword: 'sitte', definition: 'Retained e.' },
          { id: 9, headword: 'sitt', definition: 'Bare root.' },
        ];
        for (const headword of new Set(cases.map(([, root]) => root)))
          entries.push({ id: entries.length + 1, headword, definition: 'Synthetic.' });
        yield* writeWebsterFixture(filename, entries);
        yield* exercise(filename, cases);
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  ));

it('missing, wrong-schema and corrupt storage fails with a typed actionable error and creates no file', () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-storage-' });
        yield* fs.writeFileString(`${dir}/corrupt.db`, 'not sqlite');
        yield* writeWebsterFixture(`${dir}/wrong.db`, []);
        yield* Effect.acquireUseRelease(
          Effect.sync(() => new Database(`${dir}/wrong.db`)),
          (db) =>
            Effect.sync(() => db.exec("UPDATE meta SET value = '1913' WHERE key = 'edition'")),
          (db) => Effect.sync(() => db.close()),
        );
        for (const file of ['absent.db', 'corrupt.db', 'wrong.db']) {
          const result = yield* Effect.result(exercise(`${dir}/${file}`, []));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) expect(String(result.failure)).toContain('Webster');
        }
        expect(yield* fs.exists(`${dir}/absent.db`)).toBe(false);
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  ));
