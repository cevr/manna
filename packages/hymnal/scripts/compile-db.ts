/** Sole corpus SQLite writer. No generated database or installed user path is an input. */
import * as BunServices from '@effect/platform-bun/BunServices';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Path, Schema } from 'effect';

import {
  BUILDER_VERSION,
  CensusEvidence,
  checkDatabase,
  CorpusDatabaseError,
  type DatabaseSources,
  populateDatabase,
  SCHEMA_VERSION,
  MetreEvidence,
} from '../src/database.js';
import { Hymn, Index, Topics } from '../src/hymn.js';
import { IndexesSchema } from '../src/index-tables.js';
import { IndexName, Rulings } from '../src/indexes.js';
import {
  KEY_TRANSPOSES,
  RECORDING_CREDITS,
  RECORDING_SET,
  recordingKey,
  keySet,
} from '../src/recordings.js';
import { decodeSourceText } from './source-text.js';

export const DATA = new URL('../data/', import.meta.url).pathname;
export const OUTPUT = new URL('../../core/data/hymnal.db', import.meta.url).pathname;
const sha256 = (text: string) => new Bun.CryptoHasher('sha256').update(text).digest('hex');
/** Index files fail on any key their schema does not name, as `indexes.ts` reads them. */
const STRICT = { onExcessProperty: 'error' } as const;

const decodeJson = <A, I>(schema: Schema.Codec<A, I>, text: string, operation: string) =>
  Schema.decodeEffect(Schema.fromJsonString(schema))(text).pipe(
    Effect.mapError(() => CorpusDatabaseError.make({ operation })),
  );

export const readDatabaseSources = Effect.fn('CorpusDatabase.readSources')(function* (
  directory = DATA,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) =>
    fs
      .readFileString(path.join(directory, file))
      .pipe(Effect.mapError(() => CorpusDatabaseError.make({ operation: `read:${file}` })));
  const names = yield* fs
    .readDirectory(path.join(directory, 'sdah-1985'))
    .pipe(Effect.mapError(() => CorpusDatabaseError.make({ operation: 'read:compiled' })));
  const numbered = names.filter((n) => /^\d+\.json$/.test(n)).toSorted();
  if (
    numbered.length !== 695 ||
    numbered.some((name, i) => name !== `${String(i + 1).padStart(3, '0')}.json`)
  )
    return yield* CorpusDatabaseError.make({ operation: 'compiled-files' });
  const compiled: Hymn[] = [];
  const compiledHashes: string[] = [];
  for (const name of numbered) {
    const text = yield* read(`sdah-1985/${name}`);
    compiled.push(yield* decodeJson(Hymn, text, `decode:${name}`));
    compiledHashes.push(`${name}:${sha256(text)}`);
  }
  const sourceText = yield* read('source-text.json');
  const indexText = yield* read('sdah-1985/index.json');
  const topicsText = yield* read('sdah-1985/topics.json');
  const metreText = yield* read('shapes.json');
  const censusText = yield* read('census.json');
  const source = yield* decodeSourceText(sourceText).pipe(
    Effect.mapError(() => CorpusDatabaseError.make({ operation: 'decode:source-text' })),
  );
  const index = yield* decodeJson(Index, indexText, 'decode:index');
  const topics = yield* decodeJson(Topics, topicsText, 'decode:topics');
  const metres = yield* decodeJson(MetreEvidence, metreText, 'decode:shapes');
  const census = yield* decodeJson(CensusEvidence, censusText, 'decode:census');
  const indexTexts: Array<[IndexName | 'rulings', string]> = [];
  for (const name of [...IndexName.literals, 'rulings' as const].toSorted())
    indexTexts.push([name, yield* read(`indexes/${name}.json`)]);
  const parsed = new Map<string, unknown>();
  for (const [name, text] of indexTexts)
    parsed.set(name, yield* decodeJson(Schema.Unknown, text, `decode:${name}`));
  const indexFiles = Object.fromEntries(IndexName.literals.map((name) => [name, parsed.get(name)]));
  const indexes = yield* Schema.decodeEffect(IndexesSchema)(indexFiles, STRICT).pipe(
    Effect.mapError(() => CorpusDatabaseError.make({ operation: 'decode:indexes' })),
  );
  const rulings = yield* Schema.decodeUnknownEffect(Rulings)(parsed.get('rulings'), STRICT).pipe(
    Effect.mapError(() => CorpusDatabaseError.make({ operation: 'decode:rulings' })),
  );
  const recordings = JSON.stringify({
    set: RECORDING_SET,
    credits: RECORDING_CREDITS,
    choices: [0, ...KEY_TRANSPOSES].map((transpose) => ({
      transpose,
      set: keySet(transpose),
      keys: compiled.map((h) => recordingKey(h.number)),
    })),
  });
  const fingerprints = {
    source_text_sha256: sha256(sourceText),
    compiled_sha256: sha256([...compiledHashes, `index.json:${sha256(indexText)}`].join('\n')),
    topics_sha256: sha256(topicsText),
    metres_sha256: sha256(metreText),
    census_sha256: sha256(censusText),
    indexes_sha256: sha256(
      indexTexts.map(([name, text]) => `${name}.json:${sha256(text)}`).join('\n'),
    ),
    recordings_sha256: sha256(recordings),
  };
  const sources: DatabaseSources = {
    source,
    hymns: compiled,
    index,
    topics,
    metres,
    census,
    indexes,
    rulings,
    meta: {
      book: 'sdah-1985',
      builder_version: BUILDER_VERSION,
      format_version: String(SCHEMA_VERSION),
      ...fingerprints,
      input_sha256: sha256(JSON.stringify(fingerprints)),
      recording_credits: JSON.stringify(RECORDING_CREDITS),
    },
  };
  return sources;
});

/** Build in a fresh sibling, validate after reopen, then publish with one atomic rename. */
export const buildDatabase = Effect.fn('CorpusDatabase.build')(function* (
  out: string,
  sources: DatabaseSources,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!path.isAbsolute(out))
    return yield* CorpusDatabaseError.make({ operation: 'absolute-output-required' });
  yield* fs.makeDirectory(path.dirname(out), { recursive: true });
  const temporary = yield* fs.makeTempFileScoped({
    directory: path.dirname(out),
    prefix: '.hymnal-',
  });
  const open = Effect.acquireRelease(
    Effect.try({
      try: () => new Database(temporary),
      catch: (cause) => CorpusDatabaseError.fromSqlite('open-candidate', cause),
    }),
    (db) => Effect.sync(() => db.close()),
  );
  yield* Effect.scoped(
    Effect.gen(function* () {
      const db = yield* open;
      yield* populateDatabase(db, sources);
    }),
  );
  yield* Effect.scoped(
    Effect.gen(function* () {
      const db = yield* open;
      yield* checkDatabase(db, sources);
    }),
  );
  yield* fs.rename(temporary, out);
}, Effect.scoped);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = at < 0 ? OUTPUT : args[at + 1];
  const program = Effect.gen(function* () {
    if (out === undefined) return yield* CorpusDatabaseError.make({ operation: 'missing-output' });
    const sources = yield* readDatabaseSources();
    yield* buildDatabase(out, sources);
    console.log(
      `PASS corpus-db-build schema=${SCHEMA_VERSION} hymns=${sources.hymns.length} readings=${sources.source.hymns.length - sources.hymns.length}`,
    );
  });
  const result = await Effect.runPromise(
    Effect.result(program.pipe(Effect.scoped, Effect.provide(BunServices.layer))),
  );
  if (result._tag === 'Failure') {
    console.error(`FAIL corpus-db-build error=${result.failure._tag}`);
    if (result.failure._tag === 'CorpusDatabaseError')
      console.error(`FAIL operation=${result.failure.operation}`);
    process.exitCode = 1;
  }
}
