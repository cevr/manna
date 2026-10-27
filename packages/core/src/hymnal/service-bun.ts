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
const literalLike = (query: string) =>
  `%${query.toLowerCase().replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
const boundedLimit = (limit: number) => {
  if (!Number.isFinite(limit)) return 20;
  if (limit < 0) return 920;
  return Math.min(920, Math.max(0, Math.floor(limit)));
};
const categorySql = (version: number) => {
  if (version === 2) return 'SELECT id, name FROM topics ORDER BY id';
  return 'SELECT * FROM categories ORDER BY id';
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
    const readRow = (id: number) => {
      if (version === 2) return normalizedRow(db, id);
      const value = db.query('SELECT * FROM hymns WHERE id=?').get(id);
      if (Predicate.isNull(value)) return Option.none<HymnRow>();
      return Option.some(Schema.decodeUnknownSync(HymnRow)(value));
    };
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
          Option.map(readRow(id), (row) =>
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
        db
          .query<CategoryRow, []>(categorySql(version))
          .all()
          .map((row) => Category.make({ id: CategoryId.make(row.id), name: row.name })),
      catch: (cause) => HymnalError.make({ operation: 'getCategories', cause }),
    }).pipe(Effect.withSpan('HymnalService.getCategories'));

    const getHymnsByCategory = Effect.fn('HymnalService.getHymnsByCategory')(
      (categoryId: CategoryId) =>
        Effect.try({
          try: () => {
            if (version === 0)
              return db
                .query<HymnRow, [number]>('SELECT * FROM hymns WHERE category_id = ? ORDER BY id')
                .all(categoryId)
                .map(summary);
            return db
              .query<{ hymn_id: number }, [number]>(
                'SELECT hymn_id FROM hymn_topics WHERE topic_id=? ORDER BY hymn_id',
              )
              .all(categoryId)
              .flatMap(({ hymn_id }) => Option.toArray(readRow(hymn_id)))
              .map(summary);
          },
          catch: (cause) => HymnalError.make({ operation: 'getHymnsByCategory', cause }),
        }),
    );

    const searchHymns = Effect.fn('HymnalService.searchHymns')((query: string, limit = 20) =>
      Effect.try({
        try: () => {
          const maximum = boundedLimit(limit);
          // SQLite text/FTS treats NUL as a terminator; no corpus entry contains it.
          if (query.includes('\0')) return [];
          if (version === 2) {
            const term = literalLike(query);
            return db
              .query<{ id: number }, [string, string, string, number]>(`
              SELECT rowid AS id FROM hymns_fts WHERE hymns_fts MATCH ?
              UNION SELECT rowid AS id FROM hymns_fts
                WHERE LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(full_text) LIKE ? ESCAPE '\\'
              ORDER BY id LIMIT ?`)
              .all(`{title full_text}: ${literalFts(query)}`, term, term, maximum)
              .flatMap(({ id }) => Option.toArray(readRow(id)))
              .map(summary);
          }
          const searchTerm = `%${query.toLowerCase()}%`;
          return db
            .query<HymnRow, [string, string, number]>(
              `SELECT * FROM hymns
                 WHERE LOWER(name) LIKE ? OR LOWER(verses) LIKE ?
                 ORDER BY id
                 LIMIT ?`,
            )
            .all(searchTerm, searchTerm, maximum)
            .map((row) =>
              HymnSummary.make({
                id: HymnId.make(row.id),
                name: row.name,
                category: row.category,
                firstLine: firstLineFromJson(row.verses),
              }),
            );
        },
        catch: (cause) => HymnalError.make({ operation: 'searchHymns', cause }),
      }),
    );

    return HymnalService.of({ getHymn, getCategories, getHymnsByCategory, searchHymns });
  }),
);
