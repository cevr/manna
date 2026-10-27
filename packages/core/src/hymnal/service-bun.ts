import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, Effect, FileSystem, Layer, Option, Path, Predicate, Schema } from 'effect';

import { CategoryId, HymnId } from '../types/ids.js';
import {
  Category,
  Hymn,
  HymnSummary,
  HymnVerse,
  hymnFirstLine,
  type CategoryRow,
  HymnRow,
} from './schemas.js';
import { HymnalError, HymnalService, HymnNotFoundError } from './service.js';

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

    return HymnalService.of({ getHymn, getCategories, getHymnsByCategory, searchHymns });
  }),
);
