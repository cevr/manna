import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import {
  Config,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Record as Records,
  Schema,
} from 'effect';

import { CategoryId, HymnId } from '../types/ids.js';
import {
  Category,
  Hymn,
  HymnSummary,
  HymnVerse,
  hymnFirstLine,
  passageReaches,
  type CategoryRow,
  type HymnIndexes,
  HymnRow,
  type IndexPassage,
  type IndexRef,
  type PassageQuery,
} from './schemas.js';
import {
  HymnalError,
  type HymnalIndexesMissing,
  HymnalService,
  HymnNotFoundError,
  INDEX_TABLES,
  indexesMissing,
  isIndexedHymn,
} from './service.js';

const HymnVersesJson = Schema.fromJsonString(Schema.Array(HymnVerse));
const decodeHymnVerses = Schema.decodeUnknownSync(HymnVersesJson);

const firstLineFromJson = (json: string): string => hymnFirstLine(decodeHymnVerses(json));

const NormalizedRow = Schema.Struct({
  id: Schema.Int,
  title: Schema.String,
  category_id: Schema.Int,
  category: Schema.String,
});
const VerseLine = Schema.Struct({
  verse_id: Schema.Int,
  stanza_id: Schema.Int,
  text: Schema.String,
});
const normalizedSelect = `SELECT h.id, h.title, t.id AS category_id, t.name AS category
 FROM hymns h JOIN hymn_topics ht ON ht.hymn_id=h.id JOIN topics t ON t.id=ht.topic_id`;

/** Assemble ordered verses from source lines. Shared refrains keep their negative legacy IDs. */
const normalizedRow = (db: Database, id: number): Option.Option<HymnRow> => {
  const value = db.query(`${normalizedSelect} WHERE h.id=? ORDER BY t.id LIMIT 1`).get(id);
  if (Predicate.isNull(value)) return Option.none();
  const row = Schema.decodeUnknownSync(NormalizedRow)(value);
  const lines = Schema.decodeUnknownSync(Schema.Array(VerseLine))(
    db
      .query(`
    SELECT s.verse_id, s.id AS stanza_id, l.text FROM stanzas s JOIN lines l ON l.stanza_id=s.id
    JOIN hymns h ON h.id=s.hymn_id WHERE s.hymn_id=?
    ORDER BY CASE WHEN h.kind='hymn' AND s.verse_id<0 THEN -1 ELSE s.ordinal END, l.ordinal`)
      .all(id),
  );
  const verses = new Map<number, { id: number; text: string }>();
  for (const line of lines) {
    const previous = verses.get(line.stanza_id);
    if (Predicate.isUndefined(previous))
      verses.set(line.stanza_id, { id: line.verse_id, text: line.text });
    else previous.text += `\n${line.text}`;
  }
  return Option.some({
    id: row.id,
    name: row.title,
    category_id: row.category_id,
    category: row.category,
    verses: Schema.encodeSync(
      Schema.fromJsonString(Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String }))),
    )([...verses.values()]),
  });
};

const literalFts = (query: string) => `"${query.replaceAll('"', '""')}"`;
/** Operators stay literal; single-letter tokens would broaden through Unicode folding. */
const canUseFts = (query: string) => {
  if (/[^\p{L}\p{M}\p{N}\s'’]/u.test(query)) return false;
  const tokens =
    query
      .normalize('NFD')
      .replaceAll(/\p{M}/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.some((token) => Array.from(token).length > 1);
};
const literalLike = (query: string) =>
  `%${query.toLowerCase().replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
const boundedLimit = (limit: number) => {
  if (!Number.isFinite(limit)) return 20;
  if (limit < 0) return 920;
  return Math.min(920, Math.max(0, Math.floor(limit)));
};

/** Each format owns its queries; the layer selects one reader before serving requests. */
const legacyReader = (db: Database) => ({
  readRow: (id: number) => {
    const value = db.query('SELECT * FROM hymns WHERE id=?').get(id);
    if (Predicate.isNull(value)) return Option.none<HymnRow>();
    return Option.some(Schema.decodeUnknownSync(HymnRow)(value));
  },
  categories: () => db.query<CategoryRow, []>('SELECT * FROM categories ORDER BY id').all(),
  categoryRows: (id: number) =>
    db.query<HymnRow, [number]>('SELECT * FROM hymns WHERE category_id = ? ORDER BY id').all(id),
  searchRows: (query: string, limit: number) => {
    const term = `%${query.toLowerCase()}%`;
    return db
      .query<HymnRow, [string, string, number]>(`
      SELECT * FROM hymns WHERE LOWER(name) LIKE ? OR LOWER(verses) LIKE ?
      ORDER BY id LIMIT ?`)
      .all(term, term, limit);
  },
});

const normalizedReader = (db: Database) => {
  const readRow = (id: number) => normalizedRow(db, id);
  const readIds = (ids: readonly { id: number }[]) =>
    ids.flatMap(({ id }) => Option.toArray(readRow(id)));
  const likeSql = `SELECT rowid AS id FROM hymns_fts
    WHERE LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(full_text) LIKE ? ESCAPE '\\'`;
  return {
    readRow,
    categories: () => db.query<CategoryRow, []>('SELECT id, name FROM topics ORDER BY id').all(),
    categoryRows: (id: number) =>
      readIds(
        db
          .query<{ id: number }, [number]>(
            'SELECT hymn_id AS id FROM hymn_topics WHERE topic_id=? ORDER BY hymn_id',
          )
          .all(id),
      ),
    searchRows: (query: string, limit: number) => {
      const term = literalLike(query);
      if (!canUseFts(query))
        return readIds(
          db
            .query<{ id: number }, [string, string, number]>(`${likeSql} ORDER BY id LIMIT ?`)
            .all(term, term, limit),
        );
      return readIds(
        db
          .query<{ id: number }, [string, string, string, number]>(`
        SELECT rowid AS id FROM hymns_fts WHERE hymns_fts MATCH ?
        UNION ${likeSql} ORDER BY id LIMIT ?`)
          .all(`{title full_text}: ${literalFts(query)}`, term, term, limit),
      );
    },
  };
};

const IndexRefRow = Schema.Struct({
  number: Schema.Int,
  page: Schema.Int,
  stanza: Schema.OptionFromNullOr(Schema.String),
});
const passageFields = {
  source: Schema.String,
  ordinal: Schema.Int,
  number: Schema.Int,
  page: Schema.Int,
  stanza: Schema.OptionFromNullOr(Schema.String),
  book: Schema.Int,
  chapter: Schema.Int,
};
/** A passage row: a chapter holds no verse columns, a span holds all three. */
const PassageRow = Schema.Union([
  Schema.Struct({ ...passageFields, kind: Schema.Literal('chapter') }),
  Schema.Struct({
    ...passageFields,
    kind: Schema.Literal('span'),
    verse: Schema.Int,
    to_chapter: Schema.Int,
    to_verse: Schema.Int,
  }),
]);
const PieceRow = Schema.Struct({ from_verse: Schema.Int, to_verse: Schema.Int });
const TopicRow = Schema.Struct({
  name: Schema.String,
  parent: Schema.OptionFromNullOr(Schema.String),
});
const TuneRow = Schema.Struct({ name: Schema.String, alias: Schema.Int });
const NameRow = Schema.Struct({ name: Schema.String });
const SeeRow = Schema.Struct({ see: Schema.Int });

const decodeRows = <S extends Schema.Decoder<unknown>>(schema: S) =>
  Schema.decodeUnknownSync(Schema.Array(schema));

/** A row's optional column as an optional key: present when the column holds a value. */
const present = <K extends string>(
  key: K,
  value: Option.Option<string>,
): { readonly [P in K]?: string } =>
  Option.match(value, {
    onNone: () => ({}),
    onSome: (held) => Records.singleton(key, held),
  });

const toRef = (row: typeof IndexRefRow.Type): IndexRef => ({
  number: row.number,
  page: row.page,
  ...present('stanza', row.stanza),
});

/** The index tables' queries, each in the printed order its index gives. */
const indexReader = (db: Database) => {
  const piecesSql =
    'SELECT from_verse, to_verse FROM index_passage_verses WHERE source=? AND ordinal=? ORDER BY piece';
  const passage = (row: typeof PassageRow.Type): IndexPassage => {
    if (row.kind === 'chapter')
      return {
        _tag: 'Chapter',
        book: row.book,
        chapter: row.chapter,
        verses: decodeRows(PieceRow)(db.query(piecesSql).all(row.source, row.ordinal)).map(
          (piece) => ({
            from: piece.from_verse,
            to: piece.to_verse,
          }),
        ),
      };
    return {
      _tag: 'Span',
      book: row.book,
      from: { chapter: row.chapter, verse: row.verse },
      to: { chapter: row.to_chapter, verse: row.to_verse },
    };
  };
  const passages = (where: string, ...params: (string | number)[]) =>
    decodeRows(PassageRow)(
      db.query(`SELECT * FROM index_passages WHERE ${where} ORDER BY ordinal`).all(...params),
    );
  const refs = (sql: string, ...params: (string | number)[]) =>
    decodeRows(IndexRefRow)(db.query(sql).all(...params)).map(toRef);
  const names = (sql: string, ...params: (string | number)[]) =>
    decodeRows(NameRow)(db.query(sql).all(...params)).map((row) => row.name);
  const people = (role: 'author' | 'composer', id: number) =>
    names(
      `SELECT name FROM index_people p WHERE role=? AND EXISTS (SELECT 1 FROM index_person_hymns r
       WHERE r.role=p.role AND r.person=p.person AND r.number=?) ORDER BY person`,
      role,
      id,
    );

  return {
    hymn: (id: number): HymnIndexes => ({
      number: id,
      topics: decodeRows(TopicRow)(
        db
          .query(`SELECT name, parent FROM index_topics t WHERE EXISTS (SELECT 1 FROM index_topic_refs r
            WHERE r.topic=t.topic AND r.kind='hymn' AND r.number=?) ORDER BY topic`)
          .all(id),
      ).map((row) => ({ name: row.name, ...present('parent', row.parent) })),
      passages: passages("source='scriptural-by-hymn' AND number=?", id).map((row) => ({
        passage: passage(row),
        ...present('stanza', row.stanza),
      })),
      see: decodeRows(SeeRow)(
        db.query('SELECT see FROM index_passage_see WHERE hymn=? ORDER BY ordinal').all(id),
      ).map((row) => row.see),
      tunes: decodeRows(TuneRow)(
        db
          .query(`SELECT name, alias FROM index_tunes t WHERE EXISTS (SELECT 1 FROM index_tune_hymns r
            WHERE r.tune=t.tune AND r.number=?) ORDER BY tune`)
          .all(id),
      ).map((row) => ({ name: row.name, alias: row.alias === 1 })),
      metres: names(
        `SELECT name FROM index_metres m WHERE EXISTS (SELECT 1 FROM index_metre_tune_hymns r
         WHERE r.metre=m.metre AND r.number=?) ORDER BY metre`,
        id,
      ),
      authors: people('author', id),
      composers: people('composer', id),
    }),
    topic: (name: string) =>
      refs(
        `SELECT number, page, NULL AS stanza FROM index_topic_refs WHERE kind='hymn' AND topic=
         (SELECT min(topic) FROM index_topics WHERE name=?) ORDER BY ordinal`,
        name,
      ),
    tune: (name: string) =>
      refs(
        `SELECT r.number, r.page, NULL AS stanza FROM index_tune_hymns r JOIN index_tunes t
         ON t.tune=r.tune WHERE t.name=? ORDER BY r.tune, r.ordinal`,
        name,
      ),
    metre: (name: string) =>
      refs(
        `SELECT number, page, NULL AS stanza FROM index_metre_tune_hymns WHERE metre=
         (SELECT min(metre) FROM index_metres WHERE name=?) ORDER BY tune, ordinal`,
        name,
      ),
    passage: (query: PassageQuery) =>
      passages("source='scriptural' AND book=?", query.book)
        .filter((row) => passageReaches(passage(row), query))
        .map(toRef),
  };
};

const hasTable = (db: Database, name: string) =>
  !Predicate.isNull(
    db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name),
  );

/** The index tables `db` lacks, in `INDEX_TABLES` order. */
const absentIndexTables = (db: Database) => INDEX_TABLES.filter((name) => !hasTable(db, name));

/**
 * Whether the hymnal database at `path` holds hymns but lacks an index table,
 * so `manna init` replaces it. A file that does not open as one is kept: false.
 */
export const hymnalNeedsIndexes = (path: string): Effect.Effect<boolean> =>
  Effect.acquireUseRelease(
    Effect.try(() => new Database(path, { readonly: true })),
    (db) => Effect.try(() => hasTable(db, 'hymns') && absentIndexTables(db).length > 0),
    (db) => Effect.sync(() => db.close(false)),
  ).pipe(Effect.orElseSucceed(() => false));

export const layerHymnalBun: Layer.Layer<
  HymnalService,
  HymnalError | Config.ConfigError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  HymnalService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const homeDirectory = yield* Config.String('HOME');
    const defaultDbPath = path.join(homeDirectory, '.bible', 'hymnal.db');
    const dbPath = yield* Config.String('HYMNAL_DB_PATH').pipe(Config.withDefault(defaultDbPath));

    if (!(yield* fs.exists(dbPath))) {
      return yield* HymnalError.make({
        operation: 'open',
        cause: dbPath,
        message: `Hymnal database not found at ${dbPath}.`,
      });
    }

    const db = yield* Effect.try({
      try: () => new Database(dbPath, { readonly: true }),
      catch: (cause) =>
        HymnalError.make({
          operation: 'open',
          message: `Failed to open hymnal database at ${dbPath}`,
          cause,
        }),
    });

    yield* Effect.addFinalizer(() =>
      Effect.try({
        try: () => db.close(false),
        catch: (cause) =>
          HymnalError.make({
            operation: 'close',
            message: 'Failed to close hymnal database',
            cause,
          }),
      }).pipe(Effect.ignore),
    );

    const versionRow = yield* Effect.try({
      try: () => db.query('PRAGMA user_version').get(),
      catch: (cause) => HymnalError.make({ operation: 'version', cause }),
    });
    const { user_version: version } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ user_version: Schema.Int }),
    )(versionRow).pipe(
      Effect.mapError((cause) => HymnalError.make({ operation: 'version', cause })),
    );
    if (version !== 0 && version !== 2)
      return yield* HymnalError.make({
        operation: 'version',
        cause: version,
        message: 'Unsupported hymnal corpus version',
      });
    const reader = { 0: legacyReader, 2: normalizedReader }[version](db);
    const summary = (row: HymnRow) =>
      HymnSummary.make({
        id: HymnId.make(row.id),
        name: row.name,
        category: row.category,
        firstLine: firstLineFromJson(row.verses),
      });

    const getHymn = Effect.fn('HymnalService.getHymn')(function* (id: HymnId) {
      const hymn = yield* Effect.try({
        try: () =>
          Option.map(reader.readRow(id), (row) =>
            Hymn.make({
              id: HymnId.make(row.id),
              name: row.name,
              category: row.category,
              categoryId: CategoryId.make(row.category_id),
              verses: decodeHymnVerses(row.verses),
            }),
          ),
        catch: (cause) => HymnalError.make({ operation: 'getHymn', cause }),
      });

      return yield* Effect.fromOption(hymn, () => HymnNotFoundError.make({ id }));
    });

    const getCategories = Effect.try({
      try: () =>
        reader
          .categories()
          .map((row) => Category.make({ id: CategoryId.make(row.id), name: row.name })),
      catch: (cause) => HymnalError.make({ operation: 'getCategories', cause }),
    }).pipe(Effect.withSpan('HymnalService.getCategories'));

    const getHymnsByCategory = Effect.fn('HymnalService.getHymnsByCategory')(
      (categoryId: CategoryId) =>
        Effect.try({
          try: () => reader.categoryRows(categoryId).map(summary),
          catch: (cause) => HymnalError.make({ operation: 'getHymnsByCategory', cause }),
        }),
    );

    const searchHymns = Effect.fn('HymnalService.searchHymns')((query: string, limit = 20) =>
      Effect.try({
        try: () => {
          const maximum = boundedLimit(limit);
          // SQLite text/FTS treats NUL as a terminator; no corpus entry contains it.
          if (query.includes('\0')) return [];
          return reader.searchRows(query, maximum).map(summary);
        },
        catch: (cause) => HymnalError.make({ operation: 'searchHymns', cause }),
      }),
    );

    const absent = yield* Effect.try({
      try: () => absentIndexTables(db),
      catch: (cause) =>
        HymnalError.make({
          operation: 'indexes',
          cause,
          message: `this hymnal.db's tables could not be listed: ${String(cause)}`,
        }),
    });
    const index = Option.liftPredicate(absent, (tables) => tables.length === 0).pipe(
      Option.map(() => indexReader(db)),
    );
    const fromIndexes = <A>(
      read: (index: ReturnType<typeof indexReader>) => A,
    ): Effect.Effect<A, HymnalError | HymnalIndexesMissing> =>
      Option.match(index, {
        onNone: () => Effect.fail(indexesMissing(absent)),
        onSome: (reader) =>
          Effect.try({
            try: () => read(reader),
            catch: (cause) =>
              HymnalError.make({
                operation: 'indexes',
                cause,
                message: `this hymnal.db's index tables could not be read: ${String(cause)}`,
              }),
          }),
      });

    const getHymnIndexes = Effect.fn('HymnalService.getHymnIndexes')(function* (id: HymnId) {
      if (!isIndexedHymn(id)) return yield* HymnNotFoundError.make({ id });
      return yield* fromIndexes((reader) => reader.hymn(id));
    });
    const getTopicHymns = Effect.fn('HymnalService.getTopicHymns')((name: string) =>
      fromIndexes((index) => index.topic(name)),
    );
    const getTuneHymns = Effect.fn('HymnalService.getTuneHymns')((name: string) =>
      fromIndexes((index) => index.tune(name)),
    );
    const getMetreHymns = Effect.fn('HymnalService.getMetreHymns')((metre: string) =>
      fromIndexes((index) => index.metre(metre)),
    );
    const getPassageHymns = Effect.fn('HymnalService.getPassageHymns')((query: PassageQuery) =>
      fromIndexes((index) => index.passage(query)),
    );

    return HymnalService.of({
      getHymn,
      getCategories,
      getHymnsByCategory,
      searchHymns,
      getHymnIndexes,
      getTopicHymns,
      getTuneHymns,
      getMetreHymns,
      getPassageHymns,
    });
  }),
);
