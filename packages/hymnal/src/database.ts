/** Bun-only corpus projection. The phone imports hymn.ts, never this module. */
import type { Database } from 'bun:sqlite';
import { Effect, Option, Schema } from 'effect';

import type { SourceText } from '../scripts/source-text.js';
import { keyOnPitch, pitchClass } from './chord.js';
import {
  type Hymn,
  type Index,
  type Plain,
  type Reason,
  type Sung,
  sung,
  type Topics,
} from './hymn.js';
import { KEY_TRANSPOSES, keySet, recordingKey } from './recordings.js';

export const SCHEMA_VERSION = 2;
export const BUILDER_VERSION = '1';
const META_KEYS = [
  'book',
  'builder_version',
  'census_sha256',
  'compiled_sha256',
  'format_version',
  'input_sha256',
  'metres_sha256',
  'recording_credits',
  'recordings_sha256',
  'source_text_sha256',
  'topics_sha256',
] as const;

export const MetreEvidence = Schema.Struct({
  hymns: Schema.Array(
    Schema.Struct({
      number: Schema.Int,
      metre: Schema.NullOr(Schema.String),
      reader: Schema.String,
      images: Schema.Array(Schema.String),
    }),
  ),
});
export type MetreEvidence = typeof MetreEvidence.Type;
export const CensusEvidence = Schema.Struct({
  base: Schema.Struct({ repo: Schema.String, commit: Schema.String }),
  witness: Schema.Struct({ repo: Schema.String, commit: Schema.String }),
  hymns: Schema.Array(
    Schema.Struct({
      number: Schema.Int,
      row: Schema.Literals(['matches', 'fixed', 'unsettled', 'nopage']),
      source: Schema.String,
      pages: Schema.Array(Schema.String),
      base: Schema.String,
      readings: Schema.Struct({ reader: Schema.Int, ocr: Schema.Int }),
      witness: Schema.Struct({ hunks: Schema.Int, digest: Schema.String }),
    }),
  ),
});
export type CensusEvidence = typeof CensusEvidence.Type;

export interface DatabaseSources {
  readonly source: SourceText;
  readonly hymns: readonly Hymn[];
  readonly index: Index;
  readonly topics: Topics;
  readonly metres: MetreEvidence;
  readonly census: CensusEvidence;
  readonly meta: Readonly<Record<(typeof META_KEYS)[number], string>>;
}

const SQLiteCause = Schema.Struct({ code: Schema.String, errno: Schema.Int });

export class CorpusDatabaseError extends Schema.TaggedError<CorpusDatabaseError>()(
  'CorpusDatabaseError',
  {
    operation: Schema.String,
    number: Schema.optionalKey(Schema.Int),
    cause: Schema.optional(SQLiteCause),
  },
) {
  /** Codes carry the SQLite failure without SQL, parameters or corpus values. */
  static fromSqlite = (operation: string, cause: unknown) =>
    CorpusDatabaseError.make({
      operation,
      cause: Option.getOrUndefined(Schema.decodeUnknownOption(SQLiteCause)(cause)),
    });
}

type StoredPart =
  | Sung
  | (Omit<Plain, 'lines' | 'why'> & {
      readonly lines: readonly string[];
      readonly why: readonly Reason[];
    });
const partLines = (part: StoredPart): readonly string[] => {
  if (part._tag === 'Plain') return part.lines;
  return part.lines.map((line) =>
    line.map((s, i) => `${i > 0 && line[i - 1]?.word !== s.word ? ' ' : ''}${s.text}`).join(''),
  );
};

/** Relational checks complement the source schemas. Failure carries only number and field. */
export const validateSources = Effect.fn('CorpusDatabase.validate')(function* (
  sources: DatabaseSources,
) {
  const { source, hymns, index, topics, metres, census } = sources;
  if (hymns.length !== 695 || hymns.some((h, i) => h.number !== i + 1))
    return yield* CorpusDatabaseError.make({ operation: 'hymn-domain' });
  if (
    index.hymns.length !== hymns.length ||
    index.hymns.some((h, i) => h.number !== hymns[i]?.number || h.title !== hymns[i]?.title)
  )
    return yield* CorpusDatabaseError.make({ operation: 'index-membership' });
  if (census.hymns.length !== 695 || census.hymns.some((h, i) => h.number !== i + 1))
    return yield* CorpusDatabaseError.make({ operation: 'census-domain' });
  if (
    new Set(metres.hymns.map((h) => h.number)).size !== metres.hymns.length ||
    metres.hymns.some((h) => h.number < 1 || h.number > 695)
  )
    return yield* CorpusDatabaseError.make({ operation: 'shape-domain' });
  for (const hymn of hymns) {
    const number = hymn.number;
    if (topics.topics.filter((t) => t.first <= number && number <= t.last).length !== 1)
      return yield* CorpusDatabaseError.make({ operation: 'topic-membership', number });
    if (hymn.verses.text !== hymn.stanzas.length)
      return yield* CorpusDatabaseError.make({ operation: 'stanza-count', number });
    yield* validateTiming(hymn);
  }
  if (
    source.hymns.filter((h) => h.number > 695).some((h) => h.categoryId < 63 || h.categoryId > 68)
  )
    return yield* CorpusDatabaseError.make({ operation: 'reading-membership' });
});

const validateTiming = Effect.fn('CorpusDatabase.validateTiming')(function* (hymn: Hymn) {
  const timing = hymn.timing;
  if (timing === undefined) return;
  const occurrences = sung(hymn);
  if (occurrences.length !== timing.lines.length)
    return yield* CorpusDatabaseError.make({
      operation: 'timing-occurrences',
      number: hymn.number,
    });
  for (const [i, occurrence] of occurrences.entries()) {
    const count =
      occurrence.part._tag === 'Plain' ? 0 : occurrence.part.lines[occurrence.line]?.length;
    if (timing.lines[i]?.syllables.length !== count)
      return yield* CorpusDatabaseError.make({
        operation: 'timing-syllables',
        number: hymn.number,
      });
  }
});

const CORPUS_SCHEMA = `
PRAGMA foreign_keys=ON;
PRAGMA user_version=2;
CREATE TABLE corpus_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE hymns (
 id INTEGER PRIMARY KEY, book TEXT NOT NULL, number INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('hymn','reading')), title TEXT NOT NULL, first_line TEXT NOT NULL,
 tonic TEXT, minor INTEGER CHECK(minor IN (0,1)), meter_numerator INTEGER, meter_denominator INTEGER,
 verses_text INTEGER, verses_midi INTEGER, verses_exact INTEGER CHECK(verses_exact IN (0,1)),
 refrain_order TEXT CHECK(refrain_order IN ('after-each','first-and-after-each','before-each','first-and-last','after-last')),
 UNIQUE(book,number), CHECK(id=number),
 CHECK((kind='hymn' AND number BETWEEN 1 AND 695 AND tonic IS NOT NULL AND minor IS NOT NULL)
 OR (kind='reading' AND number BETWEEN 696 AND 920 AND tonic IS NULL AND minor IS NULL
 AND meter_numerator IS NULL AND meter_denominator IS NULL AND verses_text IS NULL
 AND verses_midi IS NULL AND verses_exact IS NULL AND refrain_order IS NULL))
) STRICT;
CREATE TABLE stanzas (
 id INTEGER PRIMARY KEY, hymn_id INTEGER NOT NULL REFERENCES hymns(id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 verse_id INTEGER NOT NULL, tag TEXT NOT NULL CHECK(tag IN ('Plain','Sung')),
 level TEXT NOT NULL CHECK(level IN ('text','line','syllable')), reasons TEXT NOT NULL, fit TEXT,
 UNIQUE(hymn_id,ordinal), UNIQUE(hymn_id,verse_id),
 CHECK((tag='Plain' AND level='text') OR (tag='Sung' AND level IN ('line','syllable') AND fit IS NOT NULL))
) STRICT;
CREATE TABLE lines (
 id INTEGER PRIMARY KEY, stanza_id INTEGER NOT NULL REFERENCES stanzas(id),
 ordinal INTEGER NOT NULL CHECK(ordinal>=0), text TEXT NOT NULL, UNIQUE(stanza_id,ordinal)
) STRICT;
CREATE TABLE syllables (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 text TEXT NOT NULL, word INTEGER NOT NULL CHECK(word>=0), notes INTEGER NOT NULL CHECK(notes>=0),
 beats REAL NOT NULL CHECK(beats>=0), UNIQUE(line_id,ordinal)
) STRICT;
CREATE TABLE chords (
 syllable_id INTEGER NOT NULL REFERENCES syllables(id), level TEXT NOT NULL CHECK(level IN ('full','guitar')),
 ordinal INTEGER NOT NULL CHECK(ordinal>=0), at REAL NOT NULL CHECK(at>=0),
 root INTEGER NOT NULL CHECK(root BETWEEN 0 AND 11), quality TEXT NOT NULL,
 bass INTEGER CHECK(bass BETWEEN 0 AND 11), PRIMARY KEY(syllable_id,level,ordinal)
) STRICT;
CREATE TABLE topics (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('topic','reading-section')),
 first INTEGER NOT NULL, last INTEGER NOT NULL, provenance TEXT NOT NULL, CHECK(first<=last)
) STRICT;
CREATE TABLE hymn_topics (
 hymn_id INTEGER NOT NULL REFERENCES hymns(id), topic_id INTEGER NOT NULL REFERENCES topics(id),
 PRIMARY KEY(hymn_id,topic_id)
) STRICT;
CREATE INDEX hymn_topics_topic ON hymn_topics(topic_id,hymn_id);
CREATE TABLE hymn_keys (
 hymn_id INTEGER NOT NULL REFERENCES hymns(id), transpose INTEGER NOT NULL CHECK(transpose BETWEEN -5 AND 6),
 tonic TEXT NOT NULL, minor INTEGER NOT NULL CHECK(minor IN (0,1)), PRIMARY KEY(hymn_id,transpose)
) STRICT;
CREATE TABLE recordings (
 hymn_id INTEGER NOT NULL, transpose INTEGER NOT NULL, recording_set TEXT NOT NULL, object_key TEXT NOT NULL,
 availability TEXT NOT NULL CHECK(availability='unknown'), credits_key TEXT NOT NULL REFERENCES corpus_meta(key),
 sha256 TEXT, bytes INTEGER, duration REAL, measurements TEXT,
 PRIMARY KEY(hymn_id,transpose), FOREIGN KEY(hymn_id,transpose) REFERENCES hymn_keys(hymn_id,transpose),
 UNIQUE(recording_set,object_key)
) STRICT;
CREATE TABLE hymn_census (
 hymn_id INTEGER PRIMARY KEY REFERENCES hymns(id), status TEXT NOT NULL CHECK(status IN ('matches','fixed','unsettled','nopage')),
 source TEXT NOT NULL, pages TEXT NOT NULL, base_digest TEXT NOT NULL, witness_digest TEXT NOT NULL,
 witness_hunks INTEGER NOT NULL, reader_count INTEGER NOT NULL, ocr_count INTEGER NOT NULL,
 base_commit TEXT NOT NULL, witness_commit TEXT NOT NULL
) STRICT;
CREATE TABLE hymn_metres (
 hymn_id INTEGER PRIMARY KEY REFERENCES hymns(id), metre TEXT NOT NULL, reader TEXT NOT NULL, provenance TEXT NOT NULL
) STRICT;
CREATE TABLE timelines (
 hymn_id INTEGER PRIMARY KEY REFERENCES hymns(id), per_beat INTEGER NOT NULL, intro INTEGER NOT NULL, end INTEGER NOT NULL
) STRICT;
CREATE TABLE tempos (
 hymn_id INTEGER NOT NULL REFERENCES timelines(hymn_id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 at INTEGER NOT NULL, microseconds INTEGER NOT NULL CHECK(microseconds>0), PRIMARY KEY(hymn_id,ordinal)
) STRICT;
CREATE TABLE line_times (
 id INTEGER PRIMARY KEY, hymn_id INTEGER NOT NULL REFERENCES timelines(hymn_id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 line_id INTEGER NOT NULL REFERENCES lines(id), start INTEGER NOT NULL, until INTEGER NOT NULL,
 played INTEGER NOT NULL CHECK(played IN (0,1)), even INTEGER NOT NULL CHECK(even IN (0,1)), UNIQUE(hymn_id,ordinal)
) STRICT;
CREATE INDEX line_times_line ON line_times(line_id);
CREATE TABLE syllable_times (
 line_time_id INTEGER NOT NULL REFERENCES line_times(id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 syllable_id INTEGER NOT NULL REFERENCES syllables(id), start INTEGER NOT NULL, PRIMARY KEY(line_time_id,ordinal)
) STRICT;
CREATE INDEX syllable_times_syllable ON syllable_times(syllable_id);
CREATE VIRTUAL TABLE hymns_fts USING fts5(title, first_line, refrain, full_text, topics, tokenize='unicode61');
`;

type Binding = number | string | null;
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const insertInto = (db: Database, table: string, columns: string) => {
  const query = db.query(
    `INSERT INTO ${table} (${columns}) VALUES (${columns
      .split(',')
      .map(() => '?')
      .join(',')})`,
  );
  return (...values: Binding[]) => query.run(...values);
};

/** SQLite mutation stays behind this one writer, invoked only by compile-db.ts. */
export const populateDatabase = Effect.fn('CorpusDatabase.populate')(function* (
  db: Database,
  sources: DatabaseSources,
) {
  yield* validateSources(sources);
  yield* Effect.try({
    try: () => {
      db.exec('PRAGMA foreign_keys=ON');
      db.transaction(() => {
        db.exec(CORPUS_SCHEMA);
        for (const key of META_KEYS)
          insertInto(db, 'corpus_meta', 'key,value')(key, sources.meta[key]);
        writeTopics(db, sources);
        const writer = makePartWriter(db);
        for (const hymn of sources.hymns) writeHymn(db, sources, writer, hymn);
        for (const reading of sources.source.hymns.filter((h) => h.number > 695))
          writeReading(db, sources, writer, reading);
        writeEvidence(db, sources);
        db.exec("INSERT INTO hymns_fts(hymns_fts) VALUES('optimize')");
      })();
    },
    catch: (cause) => CorpusDatabaseError.fromSqlite('populate', cause),
  });
});

const writeTopics = (db: Database, sources: DatabaseSources) => {
  const insert = insertInto(db, 'topics', 'id,name,kind,first,last,provenance');
  for (const topic of sources.topics.topics)
    insert(topic.id, topic.name, 'topic', topic.first, topic.last, 'sdah-1985/topics.json');
  for (const category of sources.source.categories.filter((c) => c.id > 62)) {
    const numbers = sources.source.hymns
      .filter((h) => h.categoryId === category.id)
      .map((h) => h.number);
    insert(
      category.id,
      category.name,
      'reading-section',
      Math.min(...numbers),
      Math.max(...numbers),
      'source-text.json',
    );
  }
};

const makePartWriter = (db: Database) => {
  let stanzaId = 0;
  let lineId = 0;
  let syllableId = 0;
  const stanza = insertInto(db, 'stanzas', 'id,hymn_id,ordinal,verse_id,tag,level,reasons,fit');
  const line = insertInto(db, 'lines', 'id,stanza_id,ordinal,text');
  const syllable = insertInto(db, 'syllables', 'id,line_id,ordinal,text,word,notes,beats');
  const chord = insertInto(db, 'chords', 'syllable_id,level,ordinal,at,root,quality,bass');
  return (number: number, ordinal: number, verseId: number, part: StoredPart) => {
    stanzaId++;
    stanza(
      stanzaId,
      number,
      ordinal,
      verseId,
      part._tag,
      part._tag === 'Plain' ? 'text' : part.level,
      encodeJson(part.why),
      part.fit === undefined ? null : encodeJson(part.fit),
    );
    return partLines(part).map((text, i) => {
      lineId++;
      line(lineId, stanzaId, i, text);
      const ids: number[] = [];
      if (part._tag === 'Sung')
        for (const [j, s] of (part.lines[i] ?? []).entries()) {
          syllableId++;
          ids.push(syllableId);
          syllable(syllableId, lineId, j, s.text, s.word, s.notes, s.beats);
          for (const level of ['full', 'guitar'] as const)
            for (const [k, p] of (s[level] ?? []).entries())
              chord(
                syllableId,
                level,
                k,
                p.at,
                p.chord.root,
                p.chord.quality,
                p.chord.bass ?? null,
              );
        }
      return { id: lineId, syllables: ids };
    });
  };
};
type PartWriter = ReturnType<typeof makePartWriter>;

const writeHymn = (db: Database, sources: DatabaseSources, writer: PartWriter, hymn: Hymn) => {
  const firstLine = partLines(hymn.stanzas[0])[0] ?? '';
  insertInto(
    db,
    'hymns',
    'id,book,number,kind,title,first_line,tonic,minor,meter_numerator,meter_denominator,verses_text,verses_midi,verses_exact,refrain_order',
  )(
    hymn.number,
    hymn.book,
    hymn.number,
    'hymn',
    hymn.title,
    firstLine,
    hymn.key.tonic,
    Number(hymn.key.minor),
    hymn.meter.numerator,
    hymn.meter.denominator,
    hymn.verses.text,
    hymn.verses.midi,
    Number(hymn.verses.exact),
    hymn.refrain?.order ?? null,
  );
  const parts = new Map<number | 'refrain', ReturnType<PartWriter>>();
  hymn.stanzas.forEach((part, i) => parts.set(i + 1, writer(hymn.number, i, i, part)));
  if (hymn.refrain)
    parts.set('refrain', writer(hymn.number, hymn.stanzas.length, -1, hymn.refrain.part));
  const topic = sources.topics.topics.find((t) => t.first <= hymn.number && hymn.number <= t.last);
  if (topic) insertInto(db, 'hymn_topics', 'hymn_id,topic_id')(hymn.number, topic.id);
  const keys = insertInto(db, 'hymn_keys', 'hymn_id,transpose,tonic,minor');
  const recording = insertInto(
    db,
    'recordings',
    'hymn_id,transpose,recording_set,object_key,availability,credits_key',
  );
  for (const transpose of [0, ...KEY_TRANSPOSES].toSorted((a, b) => a - b)) {
    const key =
      transpose === 0
        ? hymn.key
        : keyOnPitch(pitchClass(hymn.key.tonic) + transpose, hymn.key.minor);
    keys(hymn.number, transpose, key.tonic, Number(key.minor));
    recording(
      hymn.number,
      transpose,
      keySet(transpose),
      recordingKey(hymn.number),
      'unknown',
      'recording_credits',
    );
  }
  writeTiming(db, hymn, parts);
  insertInto(db, 'hymns_fts', 'rowid,title,first_line,refrain,full_text,topics')(
    hymn.number,
    hymn.title,
    firstLine,
    hymn.refrain ? partLines(hymn.refrain.part).join('\n') : '',
    [...hymn.stanzas, ...(hymn.refrain ? [hymn.refrain.part] : [])].flatMap(partLines).join('\n'),
    topic?.name ?? '',
  );
};

const writeTiming = (
  db: Database,
  hymn: Hymn,
  parts: ReadonlyMap<number | 'refrain', ReturnType<PartWriter>>,
) => {
  const timing = hymn.timing;
  if (!timing) return;
  insertInto(db, 'timelines', 'hymn_id,per_beat,intro,end')(
    hymn.number,
    timing.perBeat,
    timing.intro,
    timing.end,
  );
  const tempo = insertInto(db, 'tempos', 'hymn_id,ordinal,at,microseconds');
  timing.tempos.forEach(([at, micros], i) => tempo(hymn.number, i, at, micros));
  const lineTime = insertInto(db, 'line_times', 'hymn_id,ordinal,line_id,start,until,played,even');
  const syllableTime = insertInto(db, 'syllable_times', 'line_time_id,ordinal,syllable_id,start');
  const occurrences = sung(hymn);
  timing.lines.forEach((line, i) => {
    const occurrence = occurrences[i];
    const source = occurrence && parts.get(occurrence.verse)?.[occurrence.line];
    // validateSources proves this mapping; the FK additionally refuses a missing source line.
    const id = Number(
      lineTime(
        hymn.number,
        i,
        source?.id ?? -1,
        line.start,
        line.until,
        Number(line.played),
        Number(line.even),
      ).lastInsertRowid,
    );
    line.syllables.forEach((start, k) => syllableTime(id, k, source?.syllables[k] ?? -1, start));
  });
};

const writeReading = (
  db: Database,
  sources: DatabaseSources,
  writer: PartWriter,
  reading: SourceText['hymns'][number],
) => {
  const firstLine =
    (reading.verses.find((v) => v.id >= 0) ?? reading.verses[0])?.text.split('\n')[0] ?? '';
  insertInto(db, 'hymns', 'id,book,number,kind,title,first_line')(
    reading.number,
    sources.source.book,
    reading.number,
    'reading',
    reading.title,
    firstLine,
  );
  reading.verses.forEach((verse, i) => {
    const [first = '', ...rest] = verse.text.split('\n');
    writer(reading.number, i, verse.id, { _tag: 'Plain', lines: [first, ...rest], why: [] });
  });
  insertInto(db, 'hymn_topics', 'hymn_id,topic_id')(reading.number, reading.categoryId);
  insertInto(db, 'hymns_fts', 'rowid,title,first_line,refrain,full_text,topics')(
    reading.number,
    reading.title,
    firstLine,
    '',
    reading.verses.map((v) => v.text).join('\n'),
    sources.source.categories.find((c) => c.id === reading.categoryId)?.name ?? '',
  );
};

const writeEvidence = (db: Database, sources: DatabaseSources) => {
  const census = insertInto(
    db,
    'hymn_census',
    'hymn_id,status,source,pages,base_digest,witness_digest,witness_hunks,reader_count,ocr_count,base_commit,witness_commit',
  );
  for (const row of sources.census.hymns)
    census(
      row.number,
      row.row,
      row.source,
      encodeJson(row.pages),
      row.base,
      row.witness.digest,
      row.witness.hunks,
      row.readings.reader,
      row.readings.ocr,
      sources.census.base.commit,
      sources.census.witness.commit,
    );
  const metre = insertInto(db, 'hymn_metres', 'hymn_id,metre,reader,provenance');
  for (const row of sources.metres.hymns)
    if (row.metre !== null)
      metre(
        row.number,
        row.metre,
        row.reader,
        encodeJson({ source: 'shapes.json', images: row.images }),
      );
};

/** Run on the closed/reopened candidate too, before atomic publication. */
export const checkDatabase = Effect.fn('CorpusDatabase.check')((db: Database) =>
  Effect.try({
    try: () => {
      const valid =
        db.query('PRAGMA foreign_key_check').all().length === 0 &&
        db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()
          ?.integrity_check === 'ok';
      db.exec("INSERT INTO hymns_fts(hymns_fts) VALUES('integrity-check')");
      return valid;
    },
    catch: (cause) => CorpusDatabaseError.fromSqlite('integrity', cause),
  }).pipe(
    Effect.flatMap((valid) =>
      valid ? Effect.void : Effect.fail(CorpusDatabaseError.make({ operation: 'integrity' })),
    ),
  ),
);
