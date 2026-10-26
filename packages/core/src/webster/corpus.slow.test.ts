import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Result, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';

import { verifyWebsterDatabase } from '../platform-bun/corpus-verify.js';
import { layerWebsterBun } from './service-bun.js';
import { WebsterService } from './service.js';
import { WEBSTER_SOURCE } from './source.js';

const filename = new URL('../../data/webster.db', import.meta.url).pathname;
const smoke = WebsterService.use((service) =>
  Effect.gen(function* () {
    expect((yield* service.lookup('dismayed')).entries[0]?.definition).toContain(
      'Disheartened; deprived of courage.',
    );
    expect((yield* service.lookup('anticonstitutional')).entries).toHaveLength(2);
    expect((yield* service.lookup('counter-revolution')).entries).toHaveLength(3);
    expect((yield* service.lookup('abideth')).entries[0]?.headword).toBe('abide');
    expect((yield* service.lookup('loveth')).entries[0]?.headword).toBe('love');
    expect(
      (yield* service.search('disheartened')).some((entry) => entry.headword === 'dismayed'),
    ).toBe(true);
  }),
).pipe(Effect.provide(layerWebsterBun({ filename }).pipe(Layer.provide(BunServices.layer))));

it.scoped(
  'full pinned corpus verifies manifest, census, source projection and cross-content FTS integrity',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.exists(filename)).toBe(true);
      const manifest = yield* Schema.decodeEffect(
        Schema.fromJsonString(
          Schema.Struct({ size: Schema.Int, sha256: Schema.String, sourceSha256: Schema.String }),
        ),
      )(yield* fs.readFileString(filename.replace(/\.db$/u, '.manifest.json')));
      const bytes = yield* fs.readFile(filename);
      expect(manifest.size).toBe(bytes.length);
      expect(manifest.sha256).toBe(new Bun.CryptoHasher('sha256').update(bytes).digest('hex'));
      expect(manifest.sourceSha256).toBe(WEBSTER_SOURCE.sha256);
      expect(yield* verifyWebsterDatabase(filename)).toBe(62391);
      yield* smoke;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-full-' });
      const stale = `${dir}/stale.db`;
      yield* fs.copyFile(filename, stale);
      yield* Effect.acquireUseRelease(
        Effect.sync(() => new Database(stale)),
        (db) => Effect.sync(() => db.exec('DELETE FROM entries_fts WHERE rowid = 2')),
        (db) => Effect.sync(() => db.close()),
      );
      expect(Result.isFailure(yield* Effect.result(verifyWebsterDatabase(stale)))).toBe(true);
    }).pipe(Effect.provide(BunServices.layer)),
);
