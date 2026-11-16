import * as BunServices from '@effect/platform-bun/BunServices';
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Effect, Equal, FileSystem, Layer, Option, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';
import * as SqlClient from 'effect/sql/SqlClient';

import { BibleCorpusArchive, StrongsLexiconAsset } from './archive.js';
import { BibleCorpus } from './bible-corpus.js';

const LexiconJson = Schema.fromJsonString(Schema.Record(Schema.String, StrongsLexiconAsset));

/** A `strongs` row of the bible database, its absent fields as Options. */
const StrongsRow = Schema.Struct({
  number: Schema.String,
  lemma: Schema.String,
  transliteration: Schema.OptionFromNullOr(Schema.String),
  pronunciation: Schema.OptionFromNullOr(Schema.String),
  definition: Schema.String,
  kjv_definition: Schema.OptionFromNullOr(Schema.String),
});
type StrongsRow = typeof StrongsRow.Type;
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(StrongsRow));

/** Whether a row's field holds what the entry's field holds, absent on both sides counting as the same. */
const holds = (row: Option.Option<string>, entry: Option.Option<string>) =>
  Equal.equals(row, entry);

/** The numbers whose `strongs` row differs from the asset's entry in any field, or that one side lacks. */
const drift = (
  rows: ReadonlyArray<StrongsRow>,
  lexicon: Readonly<Record<string, StrongsLexiconAsset>>,
) => {
  const byNumber = new Map(rows.map((row) => [row.number, row]));
  const differs = Object.entries(lexicon).filter(([number, entry]) =>
    Option.match(Option.fromUndefinedOr(byNumber.get(number)), {
      onNone: () => true,
      onSome: (row) =>
        row.lemma !== entry.lemma ||
        !holds(row.transliteration, Option.fromUndefinedOr(entry.xlit)) ||
        !holds(row.pronunciation, Option.fromUndefinedOr(entry.pron)) ||
        row.definition !== entry.def ||
        !holds(row.kjv_definition, Option.fromUndefinedOr(entry.kjvDef)),
    }),
  );
  const extra = rows.filter((row) => !Object.hasOwn(lexicon, row.number));
  return [...differs.map(([number]) => number), ...extra.map((row) => row.number)];
};

/** A corpus of one made-up verse and the whole Strong's lexicon. */
const archiveOf = (lexicon: Readonly<Record<string, StrongsLexiconAsset>>) =>
  BibleCorpusArchive.make({
    kjv: { verses: [{ book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'made up' }] },
    strongsVerses: [],
    strongsLexicon: lexicon,
    openBibleCrossReferences: {},
    tskeCrossReferences: {},
    marginNotes: {},
    topics: {
      meta: {
        id: 'naves-topical-bible',
        title: 'made up',
        license: 'public-domain',
        provenance: {
          source_url: 'https://example.test/topics',
          source_hash: `sha256:${'a'.repeat(64)}`,
        },
      },
      data: [],
    },
  });

const corpus = BibleCorpus.layer.pipe(
  Layer.provideMerge(SqliteBun.layer({ filename: ':memory:', disableWAL: true })),
);

it.scopedLive(
  "the bible database's Strong's rows are the lexicon asset's entries, every field, and an old row shows",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sql = yield* SqlClient.SqlClient;
      const lexicon = yield* Schema.decodeEffect(LexiconJson)(
        yield* fs.readFileString(new URL('../../assets/strongs.json', import.meta.url).pathname),
      );
      yield* BibleCorpus.use((installer) =>
        installer.install(archiveOf(lexicon), '2026-11-16T00:00:00.000Z'),
      );
      const rows = sql`
        SELECT number, lemma, transliteration, pronunciation, definition, kjv_definition
        FROM strongs`.pipe(Effect.flatMap(decodeRows));
      expect(drift(yield* rows, lexicon)).toEqual([]);
      yield* sql`UPDATE strongs SET definition = '.', lemma = '' WHERE number = 'G25'`;
      expect(drift(yield* rows, lexicon)).toEqual(['G25']);
    }).pipe(Effect.provide(Layer.merge(corpus, BunServices.layer))),
);
