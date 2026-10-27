import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { BibleDatabase } from '../bible-db/bible-database.js';
import * as BibleDatabaseBun from '../bible-db/bible-database-bun.js';
import { defaultBibleSyncPaths, syncBible } from './bible-sync.js';

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const writeAsset = Effect.fn('BibleSyncTest.writeAsset')(function* <A>(
  assetsDirectory: string,
  name: string,
  value: A,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(path.join(assetsDirectory, name), encodeJson(value));
});

const readGenesis = (database: string) =>
  Effect.gen(function* () {
    const bible = yield* BibleDatabase;
    return (yield* bible.getChapter(1, 1))[0]?.text ?? '';
  }).pipe(Effect.provide(BibleDatabaseBun.layerBun(database)));

const pathsFor = (config: Record<string, string>) =>
  defaultBibleSyncPaths().pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config))),
  );

const makeFixture = Effect.fn('BibleSyncTest.makeFixture')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-sync-' });
  const assetsDirectory = path.join(directory, 'assets');
  yield* fs.makeDirectory(assetsDirectory, { recursive: true });
  yield* writeAsset(assetsDirectory, 'kjv.json', {
    metadata: { name: 'King James Version', year: '1611/1769' },
    verses: [{ book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'In the beginning' }],
  });
  yield* writeAsset(assetsDirectory, 'kjv-strongs.json', [
    {
      book: 1,
      chapter: 1,
      verse: 1,
      words: [{ text: 'In' }, { text: 'beginning', strongs: ['H7225'] }],
    },
  ]);
  yield* writeAsset(assetsDirectory, 'strongs.json', {
    H7225: { lemma: 'reshith', xlit: 'reshith', def: 'beginning' },
  });
  yield* writeAsset(assetsDirectory, 'cross-refs.json', {
    '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
  });
  yield* writeAsset(assetsDirectory, 'cross-refs-tske.json', {
    '1.1.1': { refs: [{ book: 58, chapter: 1, verse: 1 }] },
  });
  yield* writeAsset(assetsDirectory, 'margin-notes.json', {
    '1.1.1': [{ type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
  });
  yield* writeAsset(assetsDirectory, 'naves-topical-bible.json', {
    meta: {
      id: 'test-topics',
      title: 'Test topics',
      license: 'public-domain',
      provenance: { source_url: 'https://example.test/topics', source_hash: 'test-hash' },
    },
    data: [
      {
        entry_id: 'test-topics.creation',
        topic: 'CREATION',
        alt_topics: [],
        subtopics: [
          {
            label: 'General references',
            references: [{ raw: 'Gen 1:1', osis: ['Gen.1.1'] }],
          },
        ],
      },
    ],
  });
  return { directory, assetsDirectory };
});

describe('Bible sync', () => {
  const test = it.scopedLive.layer(BunServices.layer);

  test('builds only workspace databases across force, existing outputs and home configurations', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { directory, assetsDirectory } = yield* makeFixture();

      for (const mode of ['HOME', 'USERPROFILE', 'neither']) {
        for (const force of [false, true]) {
          for (const existing of [false, true]) {
            const label = `${mode}-${String(force)}-${String(existing)}`;
            const home = path.join(directory, `empty home Ω ${label}`);
            yield* fs.makeDirectory(home);
            const config: Record<string, string> = {};
            if (mode !== 'neither') config[mode] = home;
            const paths = yield* pathsFor(config);
            expect(paths.database).toBe(path.resolve(import.meta.dir, '../../data/bible.db'));
            const output = path.join(directory, `${label}.db`);
            if (existing) yield* fs.writeFileString(output, 'existing workspace database');
            yield* syncBible(force, { ...paths, assetsDirectory, database: output });
            expect(yield* fs.readDirectory(home)).toEqual([]);
            expect(yield* fs.exists(`${output}.building`)).toBe(false);
            if (existing && !force) {
              expect(yield* fs.readFileString(output)).toBe('existing workspace database');
            } else {
              expect(yield* readGenesis(output)).toBe('In the beginning');
            }
          }
        }
      }
    }));

  test('preserves an installed runtime tree and its bytes during a forced workspace rebuild', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { directory, assetsDirectory } = yield* makeFixture();
      const database = path.join(directory, 'bible.db');
      const home = path.join(directory, 'existing home Ω');
      const runtime = path.join(home, '.bible');
      yield* fs.makeDirectory(runtime, { recursive: true });
      for (const name of ['bible.db', 'bible.db-wal', 'bible.db-shm', '.sentinel']) {
        yield* fs.writeFileString(path.join(runtime, name), `sentinel ${name}`);
      }
      const paths = yield* pathsFor({ HOME: home });
      yield* syncBible(true, { ...paths, assetsDirectory, database });

      expect(yield* fs.readDirectory(home)).toEqual(['.bible']);
      expect((yield* fs.readDirectory(runtime)).toSorted()).toEqual(
        ['bible.db', 'bible.db-wal', 'bible.db-shm', '.sentinel'].toSorted(),
      );
      for (const name of yield* fs.readDirectory(runtime)) {
        expect(yield* fs.readFileString(path.join(runtime, name))).toBe(`sentinel ${name}`);
      }

      expect(yield* readGenesis(database)).toBe('In the beginning');
      expect(yield* fs.exists(`${database}.building`)).toBe(false);

      yield* writeAsset(assetsDirectory, 'kjv.json', {
        metadata: { name: 'King James Version', year: '1611/1769' },
        verses: [{ book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'Changed source' }],
      });

      yield* syncBible(false, { ...paths, assetsDirectory, database });
      expect(yield* readGenesis(database)).toBe('In the beginning');
    }));
});
