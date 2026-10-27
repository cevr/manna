/**
 * The Bun hymnal adapter against a real SQLite file.
 *
 * The hymnal stores refrains as verses with negative ids (-1, -2, …) ahead of
 * stanza 0. Decoding them is the adapter's job, so it is tested here rather
 * than through `HymnalService.Test`, which never decodes anything.
 */

import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Result, Schema } from 'effect';

import { CategoryId, HymnId, VerseId } from '../types/ids.js';
import { HymnVerse, isRefrain } from './schemas.js';
import { HymnalService } from './service.js';
import { layerHymnalBun } from './service-bun.js';

const encodeVerses = Schema.encodeSync(Schema.fromJsonString(Schema.Array(HymnVerse)));

const writeHymnalWithRefrain = (dbPath: string) => {
  const db = new Database(dbPath);
  db.run('CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  db.run(`CREATE TABLE hymns (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, verses TEXT NOT NULL,
    category TEXT NOT NULL, category_id INTEGER NOT NULL)`);
  db.run(`INSERT INTO categories VALUES (1, 'Adoration and Praise')`);
  db.query('INSERT INTO hymns VALUES (?, ?, ?, ?, ?)').run(
    2,
    'All Creatures of Our God and King',
    encodeVerses([
      HymnVerse.make({
        id: VerseId.make(-1),
        text: 'Oh, praise Him! Oh, praise Him!\nAlleluia, alleluia, alleluia!',
      }),
      HymnVerse.make({
        id: VerseId.make(0),
        text: 'All creatures of our God and King,\nLift up your voice with us and sing:',
      }),
      HymnVerse.make({ id: VerseId.make(1), text: 'O rushing wind and breezes soft,' }),
    ]),
    'Adoration and Praise',
    1,
  );
  db.close();
};

/** The real adapter over a fresh hymnal file holding one hymn with a refrain. */
const HymnalWithRefrain = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'hymnal-' });
    const dbPath = `${directory}/hymnal.db`;
    writeHymnalWithRefrain(dbPath);
    const provider = ConfigProvider.make((path) => {
      if (path.join('_') === 'HYMNAL_DB_PATH') {
        return Effect.succeed(ConfigProvider.makeValue(dbPath));
      }
      if (path.join('_') === 'HOME') return Effect.succeed(ConfigProvider.makeValue(directory));
      return Effect.undefined;
    });
    return layerHymnalBun.pipe(Layer.provide(ConfigProvider.layer(provider)));
  }),
).pipe(Layer.provide(BunServices.layer), Layer.fresh);

describe('layerHymnalBun', () => {
  it.effect('reads a hymn whose refrain carries a negative verse id', () =>
    Effect.gen(function* () {
      const hymn = yield* HymnalService.use((service) => service.getHymn(HymnId.make(2)));
      expect(hymn.verses.map((verse) => Number(verse.id))).toEqual([-1, 0, 1]);
      expect(hymn.verses.map(isRefrain)).toEqual([true, false, false]);
    }).pipe(Effect.provide(HymnalWithRefrain)),
  );

  it.effect('finds it by lyric and summarizes it by its opening stanza, not its refrain', () =>
    Effect.gen(function* () {
      const [match] = yield* HymnalService.use((service) => service.searchHymns('praise him'));
      expect(match?.id).toBe(HymnId.make(2));
      expect(match?.firstLine).toBe('All creatures of our God and King,');
    }).pipe(Effect.provide(HymnalWithRefrain)),
  );
});

/** Independent synthetic schema fixtures avoid reading either corpus or owner state in fast tests. */
const writeSynthetic = (file: string, mode: 'normalized' | 'unknown' | 'decode' | 'storage') => {
  const db = new Database(file);
  if (mode === 'normalized') {
    db.exec(`PRAGMA user_version=2;
      CREATE TABLE topics(id INTEGER PRIMARY KEY,name TEXT);
      CREATE TABLE hymns(id INTEGER PRIMARY KEY,title TEXT,kind TEXT);
      CREATE TABLE hymn_topics(hymn_id INTEGER,topic_id INTEGER);
      CREATE TABLE stanzas(id INTEGER PRIMARY KEY,hymn_id INTEGER,ordinal INTEGER,verse_id INTEGER);
      CREATE TABLE lines(stanza_id INTEGER,ordinal INTEGER,text TEXT);
      CREATE VIRTUAL TABLE hymns_fts USING fts5(title,first_line,refrain,full_text,topics,tokenize='unicode61');
      INSERT INTO topics VALUES(1,'Synthetic');
      INSERT INTO hymns VALUES(2,'Second fixture','hymn');
      INSERT INTO hymn_topics VALUES(1,1),(2,1);
      INSERT INTO stanzas VALUES(1,1,0,0),(2,1,1,-1),(3,2,0,0);
      INSERT INTO lines VALUES(1,0,'alpha springboard'),(1,1,'omega stanza'),(2,0,'refrain token'),(3,0,'alpha second');`);
    const title = 'O\'Brien "Delta" Ωmega';
    db.query('INSERT INTO hymns VALUES(?,?,?)').run(1, title, 'hymn');
    db.query(
      'INSERT INTO hymns_fts(rowid,title,first_line,refrain,full_text,topics) VALUES(?,?,?,?,?,?)',
    ).run(
      1,
      title,
      'alpha springboard',
      'refrain token',
      'alpha springboard\nomega stanza\nrefrain token',
      'Synthetic',
    );
    db.query(
      'INSERT INTO hymns_fts(rowid,title,first_line,refrain,full_text,topics) VALUES(?,?,?,?,?,?)',
    ).run(2, 'Second fixture', 'alpha second', '', 'alpha second', 'Synthetic');
  } else if (mode === 'unknown') db.exec('PRAGMA user_version=99');
  else if (mode === 'decode') {
    db.exec(`CREATE TABLE hymns(id INTEGER,name TEXT,category_id INTEGER,category TEXT,verses TEXT);
      INSERT INTO hymns VALUES(1,'Synthetic',1,'Synthetic','invalid-json')`);
  }
  db.close();
};

const syntheticLayer = (mode: Parameters<typeof writeSynthetic>[1]) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'hymnal-synthetic-' });
      const file = `${dir}/corpus.db`;
      writeSynthetic(file, mode);
      const config = ConfigProvider.layer(
        ConfigProvider.fromEnv({ env: { HOME: dir, HYMNAL_DB_PATH: file } }),
      );
      return layerHymnalBun.pipe(Layer.provide(config));
    }),
  ).pipe(Layer.provide(BunServices.layer), Layer.fresh);

describe('versioned corpus reader', () => {
  it.effect(
    'reconstructs ordered normalized verses and preserves the portable lookup contracts',
    () =>
      Effect.gen(function* () {
        const service = yield* HymnalService;
        const hymn = yield* service.getHymn(HymnId.make(1));
        expect(hymn.id).toBe(HymnId.make(1));
        expect(hymn.verses.map((v) => Number(v.id))).toEqual([-1, 0]);
        expect(hymn.verses[1]?.text === 'alpha springboard\nomega stanza').toBe(true);
        expect((yield* service.getCategories).map((c) => Number(c.id))).toEqual([1]);
        const category = yield* service.getHymnsByCategory(CategoryId.make(1));
        expect(category.map((h) => Number(h.id))).toEqual([1, 2]);
        expect(category[0]?.firstLine === 'alpha springboard').toBe(true);
        const missing = yield* Effect.result(service.getHymn(HymnId.make(3)));
        expect(Result.isFailure(missing) && missing.failure._tag === 'HymnNotFoundError').toBe(
          true,
        );
      }).pipe(Effect.provide(syntheticLayer('normalized'))),
  );
  it.effect(
    'searches words and substrings with literal punctuation, Unicode, bounded limits and stable order',
    () =>
      Effect.gen(function* () {
        const service = yield* HymnalService;
        for (const query of ["O'Brien", '"Delta"', 'Ωmega', 'pringbo', 'refrain', '"']) {
          const matches = yield* service.searchHymns(query);
          expect(matches.some((h) => h.id === 1)).toBe(true);
        }
        for (const query of ['*', 'NEAR(', 'alpha OR impossible', '%', '_', String.fromCharCode(0)])
          expect((yield* service.searchHymns(query)).length).toBe(0);
        expect((yield* service.searchHymns('alpha', 1)).map((h) => Number(h.id))).toEqual([1]);
        expect((yield* service.searchHymns('alpha', 0)).length).toBe(0);
        expect((yield* service.searchHymns('alpha', -1)).map((h) => Number(h.id))).toEqual([1, 2]);
        expect((yield* service.searchHymns('', 920)).map((h) => Number(h.id))).toEqual([1, 2]);
      }).pipe(Effect.provide(syntheticLayer('normalized'))),
  );
  for (const mode of ['unknown', 'decode', 'storage'] as const)
    it.effect(`reports ${mode} failures as corpus errors`, () =>
      Effect.gen(function* () {
        const service = yield* HymnalService;
        return yield* service.getHymn(HymnId.make(1));
      }).pipe(
        Effect.provide(syntheticLayer(mode)),
        Effect.result,
        Effect.map((result) => {
          expect(Result.isFailure(result) && result.failure._tag === 'HymnalError').toBe(true);
        }),
      ),
    );
});
