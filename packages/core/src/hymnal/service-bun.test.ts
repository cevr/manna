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
import {
  type HymnalError,
  type HymnalIndexesMissing,
  HymnalService,
  type HymnNotFoundError,
} from './service.js';
import { layerHymnalBun } from './service-bun.js';

/** The operation a call failed in, `false` for another error, or `succeeded`. */
const failedOperation = <A>(
  call: Effect.Effect<A, HymnalError | HymnalIndexesMissing | HymnNotFoundError>,
) =>
  Effect.match(call, {
    onFailure: (error) => {
      if (error._tag === 'HymnalIndexesMissing') return error.message;
      return error._tag === 'HymnalError' && error.operation;
    },
    onSuccess: () => 'succeeded',
  });

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

/**
 * Made-up index tables, the columns the reader reads. Two topics, two tunes
 * and two metres share a name, so the first-by-name and all-by-name rules show.
 */
const writeIndexes = (file: string) => {
  const db = new Database(file);
  db.exec(`CREATE TABLE index_files(name TEXT PRIMARY KEY,title TEXT,note TEXT);
    CREATE TABLE index_topics(topic INTEGER PRIMARY KEY,name TEXT,parent TEXT);
    CREATE TABLE index_topic_refs(topic INTEGER,kind TEXT,ordinal INTEGER,number INTEGER,page INTEGER);
    CREATE TABLE index_passages(source TEXT,ordinal INTEGER,number INTEGER,stanza TEXT,page INTEGER,
      kind TEXT,book INTEGER,chapter INTEGER,verse INTEGER,to_chapter INTEGER,to_verse INTEGER);
    CREATE TABLE index_passage_verses(source TEXT,ordinal INTEGER,piece INTEGER,from_verse INTEGER,to_verse INTEGER);
    CREATE TABLE index_passage_see(ordinal INTEGER PRIMARY KEY,hymn INTEGER,see INTEGER,page INTEGER);
    CREATE TABLE index_people(role TEXT,person INTEGER,name TEXT,source INTEGER,see TEXT);
    CREATE TABLE index_person_hymns(role TEXT,person INTEGER,ordinal INTEGER,number INTEGER,page INTEGER);
    CREATE TABLE index_tunes(tune INTEGER PRIMARY KEY,name TEXT,alias INTEGER);
    CREATE TABLE index_tune_hymns(tune INTEGER,ordinal INTEGER,number INTEGER,page INTEGER);
    CREATE TABLE index_metres(metre INTEGER PRIMARY KEY,name TEXT,gloss TEXT);
    CREATE TABLE index_metre_tune_hymns(metre INTEGER,tune INTEGER,ordinal INTEGER,number INTEGER,page INTEGER);
    INSERT INTO index_files VALUES('topical','Topical',NULL);
    INSERT INTO index_topics VALUES(1,'Topic A',NULL),(2,'Topic B','Topic A'),(3,'Topic A',NULL);
    INSERT INTO index_topic_refs VALUES(1,'hymn',0,5,10),(1,'hymn',1,7,12),(1,'reading',0,700,800),
      (2,'hymn',0,7,12),(3,'hymn',0,9,14);
    INSERT INTO index_passages VALUES
      ('scriptural-by-hymn',0,7,'2',12,'chapter',19,23,NULL,NULL,NULL),
      ('scriptural-by-hymn',1,7,NULL,12,'span',40,5,3,6,2),
      ('scriptural-by-hymn',2,5,NULL,10,'chapter',1,1,NULL,NULL,NULL),
      ('scriptural',0,5,NULL,10,'chapter',19,23,NULL,NULL,NULL),
      ('scriptural',1,7,'2',12,'chapter',19,23,NULL,NULL,NULL),
      ('scriptural',2,9,NULL,14,'span',19,22,30,23,2),
      ('scriptural',3,11,NULL,16,'chapter',19,24,NULL,NULL,NULL),
      ('scriptural',4,13,NULL,18,'chapter',20,23,NULL,NULL,NULL);
    INSERT INTO index_passage_verses VALUES('scriptural-by-hymn',0,1,4,6),('scriptural-by-hymn',0,0,1,3),
      ('scriptural',1,0,4,6);
    INSERT INTO index_passage_see VALUES(0,7,9,12),(1,7,5,12);
    INSERT INTO index_people VALUES('author',1,'Person P',0,NULL),('author',2,'Person Q',0,NULL),
      ('composer',1,'Person R',0,NULL);
    INSERT INTO index_person_hymns VALUES('author',1,0,7,12),('author',2,0,5,10),('composer',1,0,7,12);
    INSERT INTO index_tunes VALUES(1,'Tune X',0),(2,'Tune Y',1),(3,'Tune X',0);
    INSERT INTO index_tune_hymns VALUES(1,0,7,12),(1,1,5,10),(2,0,7,12),(3,0,9,14);
    INSERT INTO index_metres VALUES(1,'8.7.8.7',NULL),(2,'C.M.',NULL),(3,'8.7.8.7',NULL);
    INSERT INTO index_metre_tune_hymns VALUES(1,1,0,5,10),(1,0,1,3,8),(1,0,0,7,12),(2,0,0,7,12),(3,0,0,11,16);`);
  db.close();
};

/** Independent synthetic schema fixtures avoid reading either corpus or owner state in fast tests. */
const writeSynthetic = (
  file: string,
  mode:
    | 'normalized'
    | 'indexes'
    | 'partial'
    | 'corrupt'
    | 'spanNull'
    | 'unknown'
    | 'decode'
    | 'storage',
) => {
  const db = new Database(file);
  if (mode === 'indexes') {
    db.close();
    writeSynthetic(file, 'normalized');
    writeIndexes(file);
    return;
  }
  if (mode === 'partial') {
    db.close();
    writeSynthetic(file, 'normalized');
    const partial = new Database(file);
    partial.exec('CREATE TABLE index_files(name TEXT PRIMARY KEY,title TEXT,note TEXT)');
    partial.close();
    return;
  }
  if (mode === 'corrupt' || mode === 'spanNull') {
    db.close();
    writeSynthetic(file, 'indexes');
    const indexed = new Database(file);
    const rows = {
      corrupt: "INSERT INTO index_topic_refs VALUES(1,'hymn',2,7,'page')",
      spanNull: "INSERT INTO index_passages VALUES('scriptural',5,15,NULL,20,'span',30,1,NULL,2,4)",
    };
    indexed.exec(rows[mode]);
    indexed.close();
    return;
  }
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
    const title = 'O\'Brien "Delta" Ωmega a e title';
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
    'keeps operator-like queries and lone accented letters on literal substring search',
    () =>
      Effect.gen(function* () {
        const service = yield* HymnalService;
        for (const query of ['a*', 'é', '{title}', 'title:'])
          expect(
            (yield* service.searchHymns(query)).map((h) => Number(h.id)),
            'literal-query',
          ).toEqual([]);
        expect((yield* service.searchHymns('title')).map((h) => Number(h.id))).toEqual([1]);
      }).pipe(Effect.provide(syntheticLayer('normalized'))),
  );

  it.effect('excludes topic-only matches from title and text search', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      expect((yield* service.searchHymns('synthetic')).length).toBe(0);
    }).pipe(Effect.provide(syntheticLayer('normalized'))),
  );
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
  it.effect('reads where a hymn stands in each index, in printed order', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      expect(yield* service.getHymnIndexes(HymnId.make(7))).toEqual({
        number: 7,
        topics: [{ name: 'Topic A' }, { name: 'Topic B', parent: 'Topic A' }],
        passages: [
          {
            passage: {
              _tag: 'Chapter',
              book: 19,
              chapter: 23,
              verses: [
                { from: 1, to: 3 },
                { from: 4, to: 6 },
              ],
            },
            stanza: '2',
          },
          {
            passage: {
              _tag: 'Span',
              book: 40,
              from: { chapter: 5, verse: 3 },
              to: { chapter: 6, verse: 2 },
            },
          },
        ],
        see: [9, 5],
        tunes: [
          { name: 'Tune X', alias: false },
          { name: 'Tune Y', alias: true },
        ],
        metres: ['8.7.8.7', 'C.M.'],
        authors: ['Person P'],
        composers: ['Person R'],
      });
      expect(yield* service.getHymnIndexes(HymnId.make(600))).toEqual({
        number: 600,
        topics: [],
        passages: [],
        see: [],
        tunes: [],
        metres: [],
        authors: [],
        composers: [],
      });
      const outside = yield* Effect.result(service.getHymnIndexes(HymnId.make(696)));
      expect(Result.isFailure(outside) && outside.failure._tag === 'HymnNotFoundError').toBe(true);
    }).pipe(Effect.provide(syntheticLayer('indexes'))),
  );
  it.effect('lists a topic, tune or metre by name, and an unknown name has none', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const numbers = (refs: readonly { number: number }[]) => refs.map((ref) => ref.number);
      expect(yield* service.getTopicHymns('Topic A')).toEqual([
        { number: 5, page: 10 },
        { number: 7, page: 12 },
      ]);
      expect(numbers(yield* service.getTuneHymns('Tune X'))).toEqual([7, 5, 9]);
      expect(numbers(yield* service.getMetreHymns('8.7.8.7'))).toEqual([7, 3, 5]);
      expect(yield* service.getTopicHymns('Topic Z')).toEqual([]);
      expect(yield* service.getTuneHymns('Tune Z')).toEqual([]);
      expect(yield* service.getMetreHymns('9.9.9')).toEqual([]);
    }).pipe(Effect.provide(syntheticLayer('indexes'))),
  );
  it.effect('finds the scriptural entries that reach a verse or a chapter', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const numbers = (refs: readonly { number: number }[]) => refs.map((ref) => ref.number);
      expect(yield* service.getPassageHymns({ book: 19, chapter: 23, verse: 5 })).toEqual([
        { number: 5, page: 10 },
        { number: 7, page: 12, stanza: '2' },
      ]);
      expect(numbers(yield* service.getPassageHymns({ book: 19, chapter: 23, verse: 1 }))).toEqual([
        5, 9,
      ]);
      expect(numbers(yield* service.getPassageHymns({ book: 19, chapter: 23 }))).toEqual([5, 7, 9]);
      expect(numbers(yield* service.getPassageHymns({ book: 19, chapter: 22 }))).toEqual([9]);
      expect(numbers(yield* service.getPassageHymns({ book: 19, chapter: 25 }))).toEqual([]);
    }).pipe(Effect.provide(syntheticLayer('indexes'))),
  );
  it.effect('fails each index method over a database without the index tables', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const operations = yield* Effect.all([
        failedOperation(service.getHymnIndexes(HymnId.make(7))),
        failedOperation(service.getTopicHymns('Topic A')),
        failedOperation(service.getTuneHymns('Tune X')),
        failedOperation(service.getMetreHymns('8.7.8.7')),
        failedOperation(service.getPassageHymns({ book: 19, chapter: 23 })),
      ]);
      expect(new Set(operations)).toEqual(
        new Set(['this hymnal.db has no indexes; run manna init to replace it']),
      );
    }).pipe(Effect.provide(syntheticLayer('normalized'))),
  );
  it.effect('names the absent tables of a partly indexed database and still reads its hymns', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      expect(yield* failedOperation(service.getTopicHymns('Topic A'))).toBe(
        'this hymnal.db lacks the index tables index_topics, index_topic_refs, index_passages, ' +
          'index_passage_verses, index_passage_see, index_people, index_person_hymns, index_tunes, ' +
          'index_tune_hymns, index_metres, index_metre_tune_hymns; run manna init to replace it',
      );
      expect((yield* service.getHymn(HymnId.make(1))).id).toBe(HymnId.make(1));
    }).pipe(Effect.provide(syntheticLayer('partial'))),
  );
  it.effect('reports an undecodable index row as a corpus error with a message', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const result = yield* Effect.result(service.getTopicHymns('Topic A'));
      expect(Result.isFailure(result) && result.failure._tag).toBe('HymnalError');
      expect(Result.isFailure(result) && result.failure.message).toStartWith(
        "this hymnal.db's index tables could not be read: ",
      );
    }).pipe(Effect.provide(syntheticLayer('corrupt'))),
  );
  it.effect('fails a span row without its first verse rather than reading verse 1', () =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const result = yield* Effect.result(service.getPassageHymns({ book: 30, chapter: 1 }));
      expect(Result.isFailure(result) && result.failure._tag).toBe('HymnalError');
    }).pipe(Effect.provide(syntheticLayer('spanNull'))),
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
