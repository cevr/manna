import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Config, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { SqlError } from 'effect/sql/SqlError';

import { EGWParagraphDatabase } from './book-database.js';

export const layerBunConfig: Layer.Layer<
  EGWParagraphDatabase,
  SqlError | Config.ConfigError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = EGWParagraphDatabase.layerCore.pipe(
  Layer.provide(
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homeDir = yield* Config.String('HOME').pipe(
          Config.orElse(() => Config.String('USERPROFILE')),
          Config.withDefault('.'),
        );
        const defaultDbPath = path.join(homeDir, '.bible', 'egw-paragraphs.db');
        const dbFile = yield* Config.String('EGW_PARAGRAPH_DB').pipe(
          Config.withDefault(defaultDbPath),
        );
        const dbPath = path.resolve(dbFile);
        yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true }).pipe(Effect.orDie);
        return SqliteBun.layer({ filename: dbPath });
      }),
    ),
  ),
);

export const layerBun = (filename: string): Layer.Layer<EGWParagraphDatabase, SqlError> =>
  EGWParagraphDatabase.layerCore.pipe(Layer.provide(SqliteBun.layer({ filename })));

export const Live: Layer.Layer<
  EGWParagraphDatabase,
  SqlError | Config.ConfigError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = layerBunConfig;

export const Default = Live;
