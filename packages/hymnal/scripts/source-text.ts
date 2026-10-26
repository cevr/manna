/** Independent corpus source. SQLite is only an explicit, read-only capture input. */
import { Database } from 'bun:sqlite';
import { HymnalService, HymnId, CategoryId } from '@manna/core/hymnal';
import {
  Category,
  Hymn,
  HymnSummary,
  HymnVerse,
  hymnFirstLine,
} from '../../core/src/hymnal/schemas.js';
import { HymnalError, HymnNotFoundError } from '../../core/src/hymnal/service.js';
import { VerseId } from '../../core/src/types/ids.js';
import { Effect, FileSystem, Layer, Schema } from 'effect';

export const SOURCE_TEXT = new URL('../data/source-text.json', import.meta.url).pathname;
const Verse = Schema.Struct({ id: Schema.Int, text: Schema.String });
export const SourceText = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literal('sdah-1985'),
  categories: Schema.Array(Schema.Struct({ id: Schema.Int, name: Schema.String })),
  hymns: Schema.Array(
    Schema.Struct({
      number: Schema.Int,
      title: Schema.String,
      categoryId: Schema.Int,
      verses: Schema.Array(Verse),
    }),
  ),
}).check(
  Schema.makeFilter((source) => {
    if (source.categories.length !== 68 || source.categories.some((c, i) => c.id !== i + 1))
      return 'source category domain';
    if (source.hymns.length !== 920 || source.hymns.some((h, i) => h.number !== i + 1))
      return 'source number domain';
    for (const hymn of source.hymns) {
      if (!source.categories.some((c) => c.id === hymn.categoryId))
        return 'source category reference';
      if (
        hymn.verses.length === 0 ||
        new Set(hymn.verses.map((v) => v.id)).size !== hymn.verses.length
      )
        return 'source verse identity';
    }
    return true;
  }),
);
export type SourceText = typeof SourceText.Type;

export class SourceTextError extends Schema.TaggedError<SourceTextError>()('SourceTextError', {
  operation: Schema.String,
}) {}

/** Schema diagnostics may contain source strings. Only the operation leaves this boundary. */
export const decodeSourceText = (text: string) =>
  Schema.decodeEffect(Schema.fromJsonString(SourceText))(text).pipe(
    Effect.mapError(() => SourceTextError.make({ operation: 'decode' })),
  );

export const readSourceText = Effect.fn('SourceText.read')(function* (file = SOURCE_TEXT) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError(() => SourceTextError.make({ operation: 'read' })));
  return yield* decodeSourceText(text);
});

/** Reuses the existing text contract at build time; never reads a generated database. */
export const layerSourceText = Layer.effect(
  HymnalService,
  Effect.gen(function* () {
    const source = yield* readSourceText().pipe(
      Effect.mapError(() =>
        HymnalError.make({
          operation: 'source-text',
          message: 'Invalid corpus source',
          cause: 'source validation',
        }),
      ),
    );
    const names = new Map(source.categories.map((c) => [c.id, c.name]));
    const rows = new Map(source.hymns.map((h) => [h.number, h]));
    const project = (row: SourceText['hymns'][number]) =>
      Hymn.make({
        id: HymnId.make(row.number),
        name: row.title,
        categoryId: CategoryId.make(row.categoryId),
        category: names.get(row.categoryId) ?? '',
        verses: row.verses.map((v) => HymnVerse.make({ id: VerseId.make(v.id), text: v.text })),
      });
    const summary = (row: SourceText['hymns'][number]) => {
      const hymn = project(row);
      return HymnSummary.make({
        id: hymn.id,
        name: hymn.name,
        category: hymn.category,
        firstLine: hymnFirstLine(hymn.verses),
      });
    };
    return HymnalService.of({
      getHymn: Effect.fn('SourceText.getHymn')(function* (id: HymnId) {
        const row = rows.get(id);
        if (row === undefined) return yield* HymnNotFoundError.make({ id });
        return project(row);
      }),
      getCategories: Effect.succeed(
        source.categories.map((c) => Category.make({ ...c, id: CategoryId.make(c.id) })),
      ),
      getHymnsByCategory: Effect.fn('SourceText.getHymnsByCategory')((id: CategoryId) =>
        Effect.succeed(source.hymns.filter((h) => h.categoryId === id).map(summary)),
      ),
      searchHymns: Effect.fn('SourceText.searchHymns')((query: string, limit = 20) =>
        Effect.succeed(
          source.hymns
            .filter((h) =>
              `${h.title}\n${h.verses.map((v) => v.text).join('\n')}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .slice(0, limit)
            .map(summary),
        ),
      ),
    });
  }),
);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--capture-db');
  const out = args.indexOf('--out');
  if (at < 0 || !args[at + 1] || out < 0 || !args[out + 1]) {
    console.error('source-text requires --capture-db <copied-legacy-db> --out <source-file>');
    process.exitCode = 1;
  } else {
    const db = new Database(args[at + 1], { readonly: true });
    const categories = db
      .query<{ id: number; name: string }, []>('SELECT id, name FROM categories ORDER BY id')
      .all();
    const hymns = db
      .query<{ id: number; name: string; category_id: number; verses: string }, []>(
        'SELECT id, name, category_id, verses FROM hymns ORDER BY id',
      )
      .all()
      .map((row) => ({
        number: row.id,
        title: row.name,
        categoryId: row.category_id,
        verses: Schema.decodeSync(Schema.fromJsonString(Schema.Array(Verse)))(row.verses),
      }));
    db.close();
    const source = await Effect.runPromise(
      decodeSourceText(JSON.stringify({ version: 1, book: 'sdah-1985', categories, hymns })),
    );
    await Bun.write(args[out + 1] ?? SOURCE_TEXT, `${JSON.stringify(source)}\n`);
    console.log(`source-text captured rows=${hymns.length} categories=${categories.length}`);
  }
}
