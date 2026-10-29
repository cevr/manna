/** All comparisons report only number, table, field and index. No corpus value enters a matcher. */
import * as BunServices from '@effect/platform-bun/BunServices';
import { Database } from 'bun:sqlite';
import {
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  type Path,
  Result,
  Schema,
} from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { HymnalService, HymnId } from '@manna/core/hymnal';
import { layerHymnalBun } from '@manna/core/hymnal/bun';

import { buildDatabase, DATA, OUTPUT, readDatabaseSources } from '../scripts/compile-db.js';
import { readSourceText } from '../scripts/source-text.js';
import { keyOnPitch, pitchClass } from './chord.js';
import type { DatabaseSources } from './database.js';
import { type Fit, type Hymn, type Part, type Reason, type Syllable, sung } from './hymn.js';
import { keySet, recordingKey } from './recordings.js';

const open = (file: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new Database(file)),
    (db) => Effect.sync(() => db.close()),
  );

const searchProbes = [
  'worship',
  'advent',
  'scripture',
  'praise',
  'sabbath',
  'morning',
  'evening',
  'second',
  'nature',
  'communion',
  'death',
  'kingdom',
  'and',
  'love',
  'grace',
  'faith',
  'hope',
  'jesus',
  'christ',
  'god',
  'lord',
  'spirit',
  'holy',
  'father',
  'son',
  'cross',
  'blood',
  'heaven',
  'earth',
  'glory',
  'light',
  'life',
  'peace',
  'joy',
  'heart',
  'soul',
  'home',
  'prayer',
  'trust',
  'mercy',
  'save',
  'saved',
  'salvation',
  'come',
  'sing',
  'song',
  'pardon',
  'word',
  'truth',
  'church',
  'service',
  'mission',
  'baptism',
  'resurrection',
  'eternal',
  'judgment',
  'creation',
  'redemption',
  'the',
  'in',
  'of',
  'a*',
  'é',
  '{title}',
  'title:',
] as const;

it.effect(
  'keeps legacy search IDs and order for word and operator probes without Git history',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const legacy = `${dir}/legacy.db`;
      // The independent source capture preserves every v0 title and ordered verse byte.
      const source = yield* readSourceText();
      yield* Effect.acquireUseRelease(
        Effect.sync(() => new Database(legacy)),
        (db) =>
          Effect.sync(() => {
            db.exec(
              `CREATE TABLE hymns(id INTEGER PRIMARY KEY,name TEXT,category_id INTEGER,category TEXT,verses TEXT)`,
            );
            db.transaction(() => {
              const insert = db.query('INSERT INTO hymns VALUES(?,?,?,?,?)');
              for (const hymn of source.hymns)
                insert.run(
                  hymn.number,
                  hymn.title,
                  hymn.categoryId,
                  source.categories.find((c) => c.id === hymn.categoryId)?.name ?? '',
                  json(hymn.verses),
                );
            })();
          }),
        (db) => Effect.sync(() => db.close()),
      );
      const base = Context.get(yield* Layer.build(serviceLayer(legacy)), HymnalService);
      const head = Context.get(yield* Layer.build(serviceLayer(OUTPUT)), HymnalService);
      for (const [probe, query] of searchProbes.entries())
        for (const limit of [20, 920]) {
          const expected = (yield* base.searchHymns(query, limit)).map((h) => Number(h.id));
          const actual = (yield* head.searchHymns(query, limit)).map((h) => Number(h.id));
          expect(
            actual.length === expected.length && actual.every((id, i) => id === expected[i]),
            `search:probe=${probe}:limit=${limit}`,
          ).toBe(true);
        }
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
);
type SqlValue = number | string | null;
type Row = Partial<
  Record<
    | 'id'
    | 'title'
    | 'book'
    | 'number'
    | 'kind'
    | 'first_line'
    | 'tonic'
    | 'minor'
    | 'meter_numerator'
    | 'meter_denominator'
    | 'verses_text'
    | 'verses_midi'
    | 'verses_exact'
    | 'refrain_order'
    | 'ordinal'
    | 'verse_id'
    | 'tag'
    | 'level'
    | 'reasons'
    | 'fit'
    | 'text'
    | 'word'
    | 'notes'
    | 'beats'
    | 'at'
    | 'root'
    | 'quality'
    | 'bass'
    | 'per_beat'
    | 'intro'
    | 'end'
    | 'microseconds'
    | 'source_ordinal'
    | 'start'
    | 'until'
    | 'played'
    | 'even'
    | 'line_id'
    | 'key'
    | 'value'
    | 'n'
    | 'integrity_check'
    | 'user_version'
    | 'name'
    | 'transpose'
    | 'recording_set'
    | 'object_key'
    | 'availability'
    | 'credits_key'
    | 'sha256'
    | 'bytes'
    | 'duration'
    | 'measurements'
    | 'first'
    | 'last'
    | 'provenance'
    | 'status'
    | 'source'
    | 'pages'
    | 'base_digest'
    | 'witness_digest'
    | 'witness_hunks'
    | 'reader_count'
    | 'ocr_count'
    | 'base_commit'
    | 'witness_commit'
    | 'metre'
    | 'reader'
    | 'hymn_id'
    | 'rowid'
    | 'rid',
    SqlValue
  >
>;
const rows = (db: Database, sql: string, ...args: Array<number | string>) =>
  db.query<Row, Array<number | string>>(sql).all(...args);

/** Word groups are an independent oracle for the stored text projection. */
const textLines = (part: Part) => {
  if (part._tag === 'Plain') return part.lines;
  return part.lines.map((line) => {
    const words = new Map<number, string>();
    for (const syllable of line)
      words.set(syllable.word, `${words.get(syllable.word) ?? ''}${syllable.text}`);
    return [...words.values()].join(' ');
  });
};

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const equalJson = (actual: SqlValue | undefined, expected: Fit | readonly Reason[] | undefined) =>
  actual === (expected === undefined ? null : json(expected));
const fields = (
  actual: Readonly<Record<string, SqlValue | undefined>> | undefined,
  expected: Readonly<Record<string, SqlValue | undefined>>,
) => Object.entries(expected).every(([field, value]) => actual?.[field] === value);
type Check = (ok: boolean, table: string, field: string, index?: number) => void;

/** Return safe coordinates rather than raw actual/expected objects. Also used by mutation probes. */
const auditHymn = (db: Database, hymn: Hymn): readonly string[] => {
  const faults: string[] = [];
  const check = (ok: boolean, table: string, field: string, index = 0) => {
    if (!ok) faults.push(`${hymn.number}:${table}:${field}:${index}`);
  };
  auditHeader(db, hymn, check);
  const parts = [...hymn.stanzas, ...(hymn.refrain ? [hymn.refrain.part] : [])];
  const stored = rows(db, 'SELECT * FROM stanzas WHERE hymn_id=? ORDER BY ordinal', hymn.number);
  check(stored.length === parts.length, 'stanzas', 'count');
  for (const [p, part] of parts.entries()) {
    const row = stored[p];
    check(
      row?.ordinal === p && row.verse_id === (p < hymn.stanzas.length ? p : -1),
      'stanzas',
      'identity',
      p,
    );
    check(
      row?.tag === part._tag && row.level === (part._tag === 'Plain' ? 'text' : part.level),
      'stanzas',
      'tag-level',
      p,
    );
    check(
      equalJson(row?.reasons, part.why) && equalJson(row?.fit, part.fit),
      'stanzas',
      'fit-reasons',
      p,
    );
    auditPart(db, part, Number(row?.id), check);
  }
  auditTiming(db, hymn, check);
  return faults;
};

const auditHeader = (db: Database, hymn: Hymn, check: Check) => {
  const [header] = rows(db, 'SELECT * FROM hymns WHERE id=?', hymn.number);
  check(
    fields(header, { title: hymn.title, book: hymn.book, number: hymn.number, kind: 'hymn' }),
    'hymns',
    'identity',
  );
  check(header?.first_line === textLines(hymn.stanzas[0])[0], 'hymns', 'first_line');
  check(
    header?.tonic === hymn.key.tonic && header.minor === Number(hymn.key.minor),
    'hymns',
    'key',
  );
  check(
    header?.meter_numerator === hymn.meter.numerator &&
      header.meter_denominator === hymn.meter.denominator,
    'hymns',
    'meter',
  );
  check(
    header?.verses_text === hymn.verses.text &&
      header.verses_midi === hymn.verses.midi &&
      header.verses_exact === Number(hymn.verses.exact),
    'hymns',
    'verses',
  );
  check(header?.refrain_order === (hymn.refrain?.order ?? null), 'hymns', 'refrain_order');
};

const auditPart = (db: Database, part: Part, stanzaId: number, check: Check) => {
  const lines = rows(db, 'SELECT * FROM lines WHERE stanza_id=? ORDER BY ordinal', stanzaId);
  check(lines.length === part.lines.length, 'lines', 'count');
  for (const [l, text] of textLines(part).entries()) {
    const line = lines[l];
    check(line?.ordinal === l && line.text === text, 'lines', 'text', l);
    const syllables = rows(
      db,
      'SELECT * FROM syllables WHERE line_id=? ORDER BY ordinal',
      Number(line?.id),
    );
    const expected = part._tag === 'Sung' ? (part.lines[l] ?? []) : [];
    check(syllables.length === expected.length, 'syllables', 'count', l);
    for (const [s, syllable] of expected.entries()) {
      const actual = syllables[s];
      for (const field of ['text', 'word', 'notes', 'beats'] as const)
        check(actual?.[field] === syllable[field], 'syllables', field, s);
      check(actual?.ordinal === s, 'syllables', 'ordinal', s);
      auditChords(db, syllable, Number(actual?.id), check);
    }
  }
};

const auditChords = (db: Database, syllable: Syllable, id: number, check: Check) => {
  for (const level of ['full', 'guitar'] as const) {
    const chords = rows(
      db,
      'SELECT * FROM chords WHERE syllable_id=? AND level=? ORDER BY ordinal',
      id,
      level,
    );
    const placements = syllable[level] ?? [];
    check(chords.length === placements.length, 'chords', `${level}-count`);
    for (const [c, placed] of placements.entries()) {
      const chord = chords[c];
      check(chord?.ordinal === c && chord.level === level, 'chords', 'level-ordinal', c);
      check(chord?.at === placed.at, 'chords', 'at', c);
      check(
        chord?.root === placed.chord.root &&
          chord.quality === placed.chord.quality &&
          chord.bass === (placed.chord.bass ?? null),
        'chords',
        'degree',
        c,
      );
    }
  }
};

const auditTiming = (
  db: Database,
  hymn: Hymn,
  check: (ok: boolean, table: string, field: string, index?: number) => void,
) => {
  const timing = hymn.timing;
  const timelines = rows(db, 'SELECT * FROM timelines WHERE hymn_id=?', hymn.number);
  check(timelines.length === (timing ? 1 : 0), 'timelines', 'count');
  if (!timing) return;
  const timeline = timelines[0];
  check(
    timeline?.per_beat === timing.perBeat &&
      timeline.intro === timing.intro &&
      timeline.end === timing.end,
    'timelines',
    'bounds',
  );
  const tempos = rows(db, 'SELECT * FROM tempos WHERE hymn_id=? ORDER BY ordinal', hymn.number);
  check(tempos.length === timing.tempos.length, 'tempos', 'count');
  timing.tempos.forEach(([at, micros], i) =>
    check(
      tempos[i]?.ordinal === i && tempos[i]?.at === at && tempos[i]?.microseconds === micros,
      'tempos',
      'event',
      i,
    ),
  );
  const lines = rows(
    db,
    `SELECT lt.*, s.verse_id, l.ordinal AS source_ordinal FROM line_times lt
    JOIN lines l ON l.id=lt.line_id JOIN stanzas s ON s.id=l.stanza_id
    WHERE lt.hymn_id=? ORDER BY lt.ordinal`,
    hymn.number,
  );
  check(lines.length === timing.lines.length, 'line_times', 'count');
  const occurrences = sung(hymn);
  timing.lines.forEach((line, i) => {
    const actual = lines[i];
    const occurrence = occurrences[i];
    check(
      actual?.ordinal === i &&
        actual.verse_id ===
          (occurrence?.verse === 'refrain' ? -1 : Number(occurrence?.verse) - 1) &&
        actual.source_ordinal === occurrence?.line,
      'line_times',
      'occurrence',
      i,
    );
    check(
      actual?.start === line.start &&
        actual.until === line.until &&
        actual.played === Number(line.played) &&
        actual.even === Number(line.even),
      'line_times',
      'bounds-flags',
      i,
    );
    const syllables = rows(
      db,
      `SELECT st.*, s.line_id, s.ordinal AS source_ordinal FROM syllable_times st
      JOIN syllables s ON s.id=st.syllable_id WHERE st.line_time_id=? ORDER BY st.ordinal`,
      Number(actual?.id),
    );
    check(syllables.length === line.syllables.length, 'syllable_times', 'count', i);
    line.syllables.forEach((start, k) =>
      check(
        syllables[k]?.ordinal === k &&
          syllables[k]?.start === start &&
          syllables[k]?.line_id === actual?.line_id &&
          syllables[k]?.source_ordinal === k,
        'syllable_times',
        'start-anchor',
        k,
      ),
    );
  });
};

const assertNoFaults = (faults: readonly string[]) => {
  // Coordinates contain no corpus values, even when an assertion fails.
  expect(faults.length === 0, faults.slice(0, 8).join(',')).toBe(true);
};

const auditMetadata = (db: Database, sources: DatabaseSources) => {
  const check = (ok: boolean, label: string) => expect(ok, label).toBe(true);
  const metadata = rows(db, 'SELECT key,value FROM corpus_meta ORDER BY key');
  const expectedMeta = Object.entries(sources.meta).toSorted(([a], [b]) => a.localeCompare(b));
  check(
    metadata.length === expectedMeta.length &&
      metadata.every((r, i) => r.key === expectedMeta[i]?.[0] && r.value === expectedMeta[i]?.[1]),
    'corpus_meta:keys-values',
  );
  const parts = sources.hymns.flatMap((h) => [
    ...h.stanzas,
    ...(h.refrain ? [h.refrain.part] : []),
  ]);
  const syllables = parts.flatMap((p) => (p._tag === 'Sung' ? p.lines.flat() : []));
  const readings = sources.source.hymns.filter((h) => h.number > 695);
  const verses = readings.flatMap((h) => h.verses);
  const expected = {
    hymns: sources.hymns.length + readings.length,
    stanzas: parts.length + verses.length,
    lines:
      parts.reduce((n, p) => n + p.lines.length, 0) +
      verses.reduce((n, v) => n + v.text.split('\n').length, 0),
    syllables: syllables.length,
    chords: syllables.reduce((n, s) => n + (s.full?.length ?? 0) + (s.guitar?.length ?? 0), 0),
    topics:
      sources.topics.topics.length + sources.source.categories.filter((c) => c.id > 62).length,
    hymn_topics: sources.hymns.length + readings.length,
    hymn_keys: sources.hymns.length * 12,
    recordings: sources.hymns.length * 12,
    hymn_census: sources.census.hymns.length,
    hymn_metres: sources.metres.hymns.filter((h) => h.metre !== null).length,
    timelines: sources.hymns.filter((h) => h.timing).length,
    tempos: sources.hymns.reduce((n, h) => n + (h.timing?.tempos.length ?? 0), 0),
    line_times: sources.hymns.reduce((n, h) => n + (h.timing?.lines.length ?? 0), 0),
    syllable_times: sources.hymns.reduce(
      (n, h) => n + (h.timing?.lines.reduce((k, l) => k + l.syllables.length, 0) ?? 0),
      0,
    ),
    hymns_fts: sources.hymns.length + readings.length,
  };
  for (const [table, count] of Object.entries(expected))
    check(rows(db, `SELECT count(*) AS n FROM ${table}`)[0]?.n === count, `${table}:count`);
  check(rows(db, 'PRAGMA foreign_key_check').length === 0, 'foreign_key_check');
  check(rows(db, 'PRAGMA integrity_check')[0]?.integrity_check === 'ok', 'integrity_check');
  db.exec("INSERT INTO hymns_fts(hymns_fts) VALUES('integrity-check')");
  check(rows(db, 'PRAGMA user_version')[0]?.user_version === 2, 'user_version');
  check(
    !rows(db, 'PRAGMA table_info(hymns)').some((c) =>
      ['verses', 'favorite', 'views'].includes(String(c.name)),
    ),
    'hymns:no-state-or-blob',
  );
  check(
    rows(db, "SELECT name FROM sqlite_schema WHERE name='settings'").length === 0,
    'no-settings',
  );
  auditDescriptors(db, sources, check);
  auditEvidence(db, sources, check);
  auditFts(db, sources, check);
  auditConstraints(db);
};

/** Exercise the shipped constraints at the artifact seam, without exporting its DDL for tests. */
const auditConstraints = (db: Database) => {
  db.exec('PRAGMA foreign_keys=ON');
  expect(() => db.exec("INSERT INTO lines VALUES(-1,999999,0,'fixture')")).toThrow();
  expect(() =>
    db.exec("INSERT INTO stanzas VALUES(-1,1,999,0,'Plain','text','[]',NULL)"),
  ).toThrow();
  expect(() =>
    db.exec(`INSERT INTO chords
    SELECT syllable_id,level,ordinal,at+1,root,quality,bass FROM chords LIMIT 1`),
  ).toThrow();
  expect(() =>
    db.exec("INSERT INTO stanzas VALUES(-1,1,999,999,'Plain','syllable','[]',NULL)"),
  ).toThrow();
};

const auditDescriptors = (
  db: Database,
  sources: DatabaseSources,
  check: (ok: boolean, label: string) => void,
) => {
  for (const hymn of sources.hymns) {
    const keys = rows(
      db,
      'SELECT * FROM hymn_keys WHERE hymn_id=? ORDER BY transpose',
      hymn.number,
    );
    const recordings = rows(
      db,
      'SELECT * FROM recordings WHERE hymn_id=? ORDER BY transpose',
      hymn.number,
    );
    check(keys.length === 12 && recordings.length === 12, `${hymn.number}:descriptors:count`);
    for (let transpose = -5; transpose <= 6; transpose++) {
      const key = keys[transpose + 5];
      const target =
        transpose === 0
          ? hymn.key
          : keyOnPitch(pitchClass(hymn.key.tonic) + transpose, hymn.key.minor);
      check(
        key?.transpose === transpose &&
          key.tonic === target.tonic &&
          key.minor === Number(target.minor) &&
          pitchClass(String(key.tonic)) === (pitchClass(hymn.key.tonic) + transpose + 12) % 12,
        `${hymn.number}:hymn_keys:${transpose}`,
      );
      const r = recordings[transpose + 5];
      check(
        r?.transpose === transpose &&
          r.recording_set === keySet(transpose) &&
          r.object_key === recordingKey(hymn.number) &&
          r.availability === 'unknown' &&
          r.credits_key === 'recording_credits' &&
          r.sha256 === null &&
          r.bytes === null &&
          r.duration === null &&
          r.measurements === null,
        `${hymn.number}:recordings:${transpose}`,
      );
    }
  }
  for (const table of ['hymn_keys', 'recordings', 'timelines', 'hymn_census', 'hymn_metres'])
    check(
      rows(db, `SELECT count(*) AS n FROM ${table} WHERE hymn_id>695`)[0]?.n === 0,
      `${table}:no-readings`,
    );
  check(
    rows(
      db,
      `SELECT count(*) AS n FROM chords c JOIN syllables s ON s.id=c.syllable_id
    JOIN lines l ON l.id=s.line_id JOIN stanzas st ON st.id=l.stanza_id WHERE st.hymn_id>695`,
    )[0]?.n === 0,
    'chords:no-readings',
  );
};

const auditEvidence = (
  db: Database,
  sources: DatabaseSources,
  check: (ok: boolean, label: string) => void,
) => {
  for (const hymn of sources.hymns) {
    const [topic] = rows(
      db,
      'SELECT t.* FROM topics t JOIN hymn_topics ht ON ht.topic_id=t.id WHERE ht.hymn_id=?',
      hymn.number,
    );
    const expected = sources.topics.topics.find(
      (t) => t.first <= hymn.number && hymn.number <= t.last,
    );
    check(
      fields(topic, {
        id: expected?.id,
        name: expected?.name,
        kind: 'topic',
        first: expected?.first,
        last: expected?.last,
        provenance: 'sdah-1985/topics.json',
      }),
      `${hymn.number}:topics`,
    );
  }
  auditCensus(db, sources, check);
  for (const metre of sources.metres.hymns) {
    const actual = rows(db, 'SELECT * FROM hymn_metres WHERE hymn_id=?', metre.number);
    if (metre.metre === null) check(actual.length === 0, `${metre.number}:hymn_metres:absent`);
    else
      check(
        actual[0]?.metre === metre.metre &&
          actual[0]?.reader === metre.reader &&
          actual[0]?.provenance === json({ source: 'shapes.json', images: metre.images }),
        `${metre.number}:hymn_metres:evidence`,
      );
  }
  for (const category of sources.source.categories.filter((c) => c.id > 62)) {
    const actual = rows(db, 'SELECT * FROM topics WHERE id=?', category.id)[0];
    const members = sources.source.hymns.filter((h) => h.categoryId === category.id);
    check(
      actual?.name === category.name &&
        actual.kind === 'reading-section' &&
        actual.provenance === 'source-text.json' &&
        actual.first === members[0]?.number &&
        actual.last === members.at(-1)?.number,
      `${category.id}:reading-section`,
    );
    check(
      rows(
        db,
        'SELECT hymn_id FROM hymn_topics WHERE topic_id=? ORDER BY hymn_id',
        category.id,
      ).every((h, i) => h.hymn_id === members[i]?.number),
      `${category.id}:reading-membership`,
    );
  }
};

const auditCensus = (
  db: Database,
  sources: DatabaseSources,
  check: (ok: boolean, label: string) => void,
) => {
  for (const source of sources.census.hymns) {
    const [actual] = rows(db, 'SELECT * FROM hymn_census WHERE hymn_id=?', source.number);
    check(
      fields(actual, {
        status: source.row,
        source: source.source,
        pages: json(source.pages),
        base_digest: source.base,
        witness_digest: source.witness.digest,
        witness_hunks: source.witness.hunks,
        reader_count: source.readings.reader,
        ocr_count: source.readings.ocr,
        base_commit: sources.census.base.commit,
        witness_commit: sources.census.witness.commit,
      }),
      `${source.number}:hymn_census`,
    );
  }
};

const auditFts = (
  db: Database,
  sources: DatabaseSources,
  check: (ok: boolean, label: string) => void,
) => {
  const phrase = (text: string) => `"${text.replaceAll('"', '""')}"`;
  for (const hymn of sources.hymns) {
    for (const [field, text] of [
      ['title', hymn.title],
      ['first_line', textLines(hymn.stanzas[0])[0] ?? ''],
    ] as const)
      check(
        rows(
          db,
          'SELECT rowid FROM hymns_fts WHERE hymns_fts MATCH ?',
          `${field}:${phrase(text)}`,
        ).some((r) => r.rowid === hymn.number),
        `${hymn.number}:hymns_fts:${field}`,
      );
  }
};

const serviceLayer = (file: string) =>
  layerHymnalBun.pipe(
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({ env: { HOME: '/nonexistent/hymndb', HYMNAL_DB_PATH: file } }),
      ),
    ),
    Layer.provide(BunServices.layer),
  );
const auditService = Effect.fn('DatabaseTest.service')(function* (sources: DatabaseSources) {
  const service = yield* HymnalService;
  for (const source of sources.source.hymns) {
    const actual = yield* service.getHymn(HymnId.make(source.number));
    const hymn = sources.hymns[source.number - 1];
    const expected = hymn
      ? [
          ...(hymn.refrain ? [{ id: -1, text: textLines(hymn.refrain.part).join('\n') }] : []),
          ...hymn.stanzas.map((p, i) => ({ id: i, text: textLines(p).join('\n') })),
        ]
      : source.verses;
    const category = hymn
      ? sources.topics.topics.find((t) => t.first <= hymn.number && hymn.number <= t.last)
      : sources.source.categories.find((c) => c.id === source.categoryId);
    expect(
      actual.name === (hymn?.title ?? source.title) &&
        actual.category === category?.name &&
        actual.categoryId === category?.id,
      `${source.number}:service:header`,
    ).toBe(true);
    expect(json(actual.verses) === json(expected), `${source.number}:service:verses`).toBe(true);
  }
});

it.effect('rejects malformed parts and source references before replacing a valid artifact', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const input = `${dir}/inputs`;
    yield* fs.makeDirectory(input);
    yield* fs.copy(`${DATA}/sdah-1985`, `${input}/sdah-1985`);
    yield* fs.copy(`${DATA}/indexes`, `${input}/indexes`);
    for (const name of ['source-text.json', 'shapes.json', 'census.json'])
      yield* fs.copyFile(`${DATA}/${name}`, `${input}/${name}`);
    const sources = yield* readDatabaseSources();
    const output = `${dir}/artifact.db`;
    yield* fs.copyFile(OUTPUT, output);
    const before = yield* fs.readFile(output);
    const first = sources.hymns[0];
    const malformed = { ...first, stanzas: [{ _tag: 'Invalid', lines: ['fixture'] }] };
    yield* fs.writeFileString(`${input}/sdah-1985/001.json`, json(malformed));
    const compile = readDatabaseSources(input).pipe(
      Effect.flatMap((s) => buildDatabase(output, s)),
    );
    expect(Result.isFailure(yield* Effect.result(compile))).toBe(true);
    const afterPart = yield* fs.readFile(output);
    expect(before.length === afterPart.length && before.every((b, i) => b === afterPart[i])).toBe(
      true,
    );
    yield* fs.copyFile(`${DATA}/sdah-1985/001.json`, `${input}/sdah-1985/001.json`);
    const invalid = {
      ...sources.source,
      hymns: sources.source.hymns.map((h) => (h.number === 696 ? { ...h, categoryId: 999 } : h)),
    };
    yield* fs.writeFileString(`${input}/source-text.json`, json(invalid));
    expect(Result.isFailure(yield* Effect.result(compile))).toBe(true);
    const afterReference = yield* fs.readFile(output);
    expect(
      before.length === afterReference.length && before.every((b, i) => b === afterReference[i]),
    ).toBe(true);
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
);

const readAll = (file: string, sources: DatabaseSources) =>
  auditService(sources).pipe(Effect.provide(serviceLayer(file)));

describe('generated corpus', () => {
  it.effect(
    'preserves every structured field, reading, descriptor and independent source index',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const sources = yield* readDatabaseSources();
        const file = `${dir}/a.db`;
        yield* buildDatabase(file, sources);
        const db = yield* open(file);
        for (const hymn of sources.hymns) assertNoFaults(auditHymn(db, hymn));
        auditMetadata(db, sources);
        yield* readAll(file, sources);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'detects chord loss, anchor and level changes, refrain order loss, missing repeats and moved tempos',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const sources = yield* readDatabaseSources();
        yield* buildDatabase(`${dir}/mutants.db`, sources);
        const db = yield* open(`${dir}/mutants.db`);
        const hymn = sources.hymns.find(
          (h) => h.refrain && h.timing && h.stanzas.some((p) => p._tag === 'Sung'),
        );
        expect(hymn !== undefined).toBe(true);
        if (!hymn) return;
        const chord = rows(
          db,
          `SELECT c.rowid AS rid FROM chords c JOIN syllables s ON s.id=c.syllable_id
        JOIN lines l ON l.id=s.line_id JOIN stanzas st ON st.id=l.stanza_id WHERE st.hymn_id=? LIMIT 1`,
          hymn.number,
        )[0];
        const mutations = [
          `DELETE FROM chords WHERE rowid=${Number(chord?.rid)}`,
          `UPDATE chords SET at=at+0.25 WHERE rowid=${Number(chord?.rid)}`,
          `UPDATE chords SET level='guitar',ordinal=999 WHERE rowid=${Number(chord?.rid)}`,
          `UPDATE hymns SET refrain_order='after-last' WHERE id=${hymn.number}`,
          `DELETE FROM syllable_times WHERE line_time_id=(SELECT id FROM line_times WHERE hymn_id=${hymn.number} ORDER BY ordinal DESC LIMIT 1)`,
          `DELETE FROM line_times WHERE hymn_id=${hymn.number} AND ordinal=(SELECT max(ordinal) FROM line_times WHERE hymn_id=${hymn.number})`,
          `UPDATE tempos SET at=at+1 WHERE hymn_id=${hymn.number} AND ordinal=0`,
        ];
        for (const [i, sql] of mutations.entries()) {
          db.exec('SAVEPOINT mutation');
          // Delete dependents before the occurrence mutant, preserving actual FK enforcement.
          if (i === 5)
            db.exec(
              `DELETE FROM syllable_times WHERE line_time_id=(SELECT id FROM line_times WHERE hymn_id=${hymn.number} ORDER BY ordinal DESC LIMIT 1)`,
            );
          db.exec(sql);
          expect(auditHymn(db, hymn).length > 0, `mutant:${i}`).toBe(true);
          db.exec('ROLLBACK TO mutation; RELEASE mutation');
        }
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'rebuilds identical bytes over empty and existing files and preserves output on invalid input',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const committed = yield* fs.readFile(OUTPUT);
        const encodedVersion = new DataView(
          committed.buffer,
          committed.byteOffset,
          committed.byteLength,
        ).getUint32(96);
        const expectedVersion = `${Math.floor(encodedVersion / 1_000_000)}.${Math.floor(encodedVersion / 1_000) % 1_000}.${encodedVersion % 1_000}`;
        const runtimeVersion = yield* Effect.acquireUseRelease(
          Effect.sync(() => new Database(':memory:')),
          (db) =>
            Effect.sync(
              () =>
                db.query<{ version: string }, []>('SELECT sqlite_version() AS version').get()
                  ?.version,
            ),
          (db) => Effect.sync(() => db.close()),
        );
        expect(runtimeVersion, `sqlite_version mismatch: artifact=${expectedVersion}`).toBe(
          expectedVersion,
        );
        const sources = yield* readDatabaseSources();
        const a = `${dir}/a.db`,
          b = `${dir}/b.db`;
        // This assignment also checks that the build does not require a caller's Scope.
        const build: Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path> =
          buildDatabase(a, sources);
        yield* build;
        yield* buildDatabase(b, sources);
        expect((yield* fs.readDirectory(dir)).toSorted(), 'build:scoped-temporary-cleanup').toEqual(
          ['a.db', 'b.db'],
        );
        const bytes = yield* fs.readFile(a);
        const same = (other: Uint8Array) => Buffer.from(bytes).equals(other);
        expect(same(yield* fs.readFile(b))).toBe(true);
        expect(same(committed), 'committed-artifact-current').toBe(true);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const db = yield* open(a);
            db.exec("INSERT INTO corpus_meta VALUES('stale','probe')");
          }),
        );
        yield* buildDatabase(a, sources);
        expect(same(yield* fs.readFile(a)), 'stale-rows-removed').toBe(true);
        const invalid = { ...sources, hymns: sources.hymns.slice(1) };
        const result = yield* Effect.result(buildDatabase(a, invalid));
        expect(Result.isFailure(result)).toBe(true);
        expect(same(yield* fs.readFile(a)), 'invalid-input-atomic').toBe(true);
        const reading = sources.source.hymns.find((h) => h.number === 696);
        expect(reading !== undefined).toBe(true);
        if (!reading) return;
        const duplicateReading = {
          ...sources,
          source: { ...sources.source, hymns: [...sources.source.hymns, reading] },
        };
        const failedWrite = yield* Effect.result(buildDatabase(a, duplicateReading));
        expect(
          Result.isFailure(failedWrite) &&
            failedWrite.failure._tag === 'CorpusDatabaseError' &&
            failedWrite.failure.operation === 'populate' &&
            failedWrite.failure.cause?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' &&
            failedWrite.failure.cause.errno === 1555,
          'build:sqlite-cause',
        ).toBe(true);
        expect(same(yield* fs.readFile(a)), 'failed-write-atomic').toBe(true);
        expect((yield* fs.readDirectory(dir)).toSorted(), 'failed-write:temporary-cleanup').toEqual(
          ['a.db', 'b.db'],
        );
        const duplicate = {
          ...sources,
          hymns: [sources.hymns[0], ...sources.hymns].filter((h): h is Hymn => h !== undefined),
        };
        expect(Result.isFailure(yield* Effect.result(buildDatabase(a, duplicate)))).toBe(true);
        const index = {
          ...sources,
          index: { ...sources.index, hymns: sources.index.hymns.slice(1) },
        };
        expect(Result.isFailure(yield* Effect.result(buildDatabase(a, index)))).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
