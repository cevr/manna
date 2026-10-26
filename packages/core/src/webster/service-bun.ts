import { Database } from 'bun:sqlite';
import { Config, Effect, Layer, Option, Path, Schema } from 'effect';

import { WebsterEntry, WebsterError } from './model.js';
import { checkWebsterSchema } from './schema-bun.js';
import { makeWebsterApi, searchTerms, validateLimit, WebsterService } from './service.js';

export const layerWebsterBun = (input: { readonly filename?: string } = {}) =>
  Layer.effect(
    WebsterService,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const filename = yield* Option.match(Option.fromUndefinedOr(input.filename), {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.gen(function* () {
            const override = yield* Config.String('WEBSTER_DB_PATH').pipe(Config.option);
            if (Option.isSome(override)) return override.value;
            const home = yield* Config.String('HOME');
            return path.join(home, '.bible', 'webster.db');
          }),
      });
      const failure = (operation: string, cause: unknown) =>
        WebsterError.make({
          operation,
          cause,
          message: `Cannot ${operation} Webster database at ${filename}. Run bun run build:webster and manna init; binary distributions must include data/webster.db.`,
        });
      const db = yield* Effect.acquireRelease(
        Effect.try({
          try: () => new Database(filename, { readonly: true, create: false }),
          catch: (cause) => failure('open', cause),
        }),
        (opened) => Effect.sync(() => opened.close()),
      );
      yield* checkWebsterSchema(db);
      const decode = Schema.decodeUnknownEffect(Schema.Array(WebsterEntry));
      const byKey = Effect.fn('Webster.byKey')((key: string) =>
        Effect.try({
          try: () =>
            db
              .query('SELECT id, headword, definition FROM entries WHERE key = ? ORDER BY id')
              .all(key),
          catch: (cause) => failure('lookup', cause),
        }).pipe(
          Effect.flatMap((rows) =>
            decode(rows).pipe(Effect.mapError((cause) => failure('lookup', cause))),
          ),
        ),
      );
      const search = Effect.fn('Webster.search')(function* (query: string, limit = 20) {
        yield* validateLimit(limit);
        const terms = searchTerms(query);
        if (terms.length === 0) return [];
        const expression = 'definition : (' + terms.map((term) => `"${term}"`).join(' AND ') + ')';
        const rows = yield* Effect.try({
          try: () =>
            db
              .query(
                'SELECT e.id, e.headword, e.definition FROM entries_fts JOIN entries e ON e.id = entries_fts.rowid WHERE entries_fts MATCH ? ORDER BY bm25(entries_fts), e.id LIMIT ?',
              )
              .all(expression, limit),
          catch: (cause) => failure('search', cause),
        });
        return yield* decode(rows).pipe(Effect.mapError((cause) => failure('search', cause)));
      });
      return WebsterService.of(makeWebsterApi(byKey, search));
    }),
  );
