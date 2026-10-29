/**
 * The back-matter indexes (`indexes.ts`) as `index_*` tables of the corpus
 * database: `writeIndexTables` stores the 11 decoded files and the rulings,
 * `readIndexTables` rebuilds them, and `diffIndexTables` names each one that
 * comes back different, so a build that loses or adds an entry fails.
 *
 * Every row holds numbers, flags, names, printed headings, legends and
 * Scripture coordinates; `ordinal` is the printed order, from 0. A topic,
 * person, tune and metre is keyed by its ordinal. No table refers to
 * `hymns`: the readings 696-920 have no hymn row.
 */
import type { Database } from 'bun:sqlite';
import { Schema } from 'effect';

import { IndexFile, IndexName, type Indexes, type Passage, Rulings } from './indexes.js';

export const INDEX_TABLES = `
CREATE TABLE index_files (name TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT) STRICT;
CREATE TABLE index_pages (
  name TEXT NOT NULL REFERENCES index_files(name), ordinal INTEGER NOT NULL,
  page INTEGER NOT NULL, entries INTEGER NOT NULL, PRIMARY KEY (name, ordinal)) STRICT;
CREATE TABLE index_topics (topic INTEGER PRIMARY KEY, name TEXT NOT NULL, parent TEXT) STRICT;
CREATE TABLE index_topic_see (
  topic INTEGER NOT NULL REFERENCES index_topics(topic), ordinal INTEGER NOT NULL,
  see TEXT NOT NULL, PRIMARY KEY (topic, ordinal)) STRICT;
CREATE TABLE index_topic_refs (
  topic INTEGER NOT NULL REFERENCES index_topics(topic),
  kind TEXT NOT NULL CHECK (kind IN ('hymn', 'reading')), ordinal INTEGER NOT NULL,
  number INTEGER NOT NULL, page INTEGER NOT NULL, PRIMARY KEY (topic, kind, ordinal)) STRICT;
CREATE TABLE index_passages (
  source TEXT NOT NULL CHECK (source IN ('worship-aids', 'scriptural', 'scriptural-by-hymn')),
  ordinal INTEGER NOT NULL, number INTEGER NOT NULL, stanza TEXT, page INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('chapter', 'span')), book INTEGER NOT NULL,
  chapter INTEGER NOT NULL, verse INTEGER, to_chapter INTEGER, to_verse INTEGER,
  PRIMARY KEY (source, ordinal),
  CHECK ((kind = 'chapter') = (verse IS NULL AND to_chapter IS NULL AND to_verse IS NULL)),
  CHECK (kind = 'chapter' OR (verse IS NOT NULL AND to_chapter IS NOT NULL AND to_verse IS NOT NULL))
) STRICT;
CREATE TABLE index_passage_verses (
  source TEXT NOT NULL, ordinal INTEGER NOT NULL, piece INTEGER NOT NULL,
  from_verse INTEGER NOT NULL, to_verse INTEGER NOT NULL, PRIMARY KEY (source, ordinal, piece),
  FOREIGN KEY (source, ordinal) REFERENCES index_passages(source, ordinal)) STRICT;
CREATE TABLE index_passage_see (
  ordinal INTEGER PRIMARY KEY, hymn INTEGER NOT NULL, see INTEGER NOT NULL,
  page INTEGER NOT NULL) STRICT;
CREATE TABLE index_groups (
  source TEXT NOT NULL CHECK (source IN ('sentences', 'canons')), grp INTEGER NOT NULL,
  name TEXT NOT NULL, PRIMARY KEY (source, grp)) STRICT;
CREATE TABLE index_group_hymns (
  source TEXT NOT NULL, grp INTEGER NOT NULL, ordinal INTEGER NOT NULL, number INTEGER NOT NULL,
  page INTEGER NOT NULL, stanzas TEXT, PRIMARY KEY (source, grp, ordinal),
  FOREIGN KEY (source, grp) REFERENCES index_groups(source, grp),
  CHECK ((source = 'canons') = (stanzas IS NULL))) STRICT;
CREATE TABLE index_young (
  ordinal INTEGER PRIMARY KEY, number INTEGER NOT NULL,
  starred INTEGER NOT NULL CHECK (starred IN (0, 1)), page INTEGER NOT NULL) STRICT;
CREATE TABLE index_people (
  role TEXT NOT NULL CHECK (role IN ('author', 'composer')), person INTEGER NOT NULL,
  name TEXT NOT NULL, source INTEGER NOT NULL CHECK (source IN (0, 1)), see TEXT,
  PRIMARY KEY (role, person)) STRICT;
CREATE TABLE index_person_hymns (
  role TEXT NOT NULL, person INTEGER NOT NULL, ordinal INTEGER NOT NULL, number INTEGER NOT NULL,
  page INTEGER NOT NULL, PRIMARY KEY (role, person, ordinal),
  FOREIGN KEY (role, person) REFERENCES index_people(role, person)) STRICT;
CREATE TABLE index_tunes (
  tune INTEGER PRIMARY KEY, name TEXT NOT NULL,
  alias INTEGER NOT NULL CHECK (alias IN (0, 1))) STRICT;
CREATE TABLE index_tune_hymns (
  tune INTEGER NOT NULL REFERENCES index_tunes(tune), ordinal INTEGER NOT NULL,
  number INTEGER NOT NULL, page INTEGER NOT NULL, PRIMARY KEY (tune, ordinal)) STRICT;
CREATE TABLE index_metres (metre INTEGER PRIMARY KEY, name TEXT NOT NULL, gloss TEXT) STRICT;
CREATE TABLE index_metre_tunes (
  metre INTEGER NOT NULL REFERENCES index_metres(metre), ordinal INTEGER NOT NULL,
  name TEXT NOT NULL, PRIMARY KEY (metre, ordinal)) STRICT;
CREATE TABLE index_metre_tune_hymns (
  metre INTEGER NOT NULL, tune INTEGER NOT NULL, ordinal INTEGER NOT NULL,
  number INTEGER NOT NULL, page INTEGER NOT NULL, PRIMARY KEY (metre, tune, ordinal),
  FOREIGN KEY (metre, tune) REFERENCES index_metre_tunes(metre, ordinal)) STRICT;
CREATE TABLE index_rulings (
  ordinal INTEGER PRIMARY KEY, index_name TEXT NOT NULL, page INTEGER NOT NULL,
  at TEXT NOT NULL, check_name TEXT NOT NULL, value TEXT NOT NULL, judge TEXT NOT NULL,
  why TEXT NOT NULL) STRICT;
`;

/** The 11 files and the rulings, as `compile-db.ts` reads them from `data/indexes/`. */
export interface IndexSources {
  readonly indexes: Indexes;
  readonly rulings: Rulings;
}

/** Every index, each optional: an index with no `index_files` row is absent. */
export const IndexesSchema = Schema.Struct({
  topical: Schema.optionalKey(IndexFile.topical),
  'worship-aids': Schema.optionalKey(IndexFile['worship-aids']),
  scriptural: Schema.optionalKey(IndexFile.scriptural),
  'scriptural-by-hymn': Schema.optionalKey(IndexFile['scriptural-by-hymn']),
  sentences: Schema.optionalKey(IndexFile.sentences),
  canons: Schema.optionalKey(IndexFile.canons),
  young: Schema.optionalKey(IndexFile.young),
  authors: Schema.optionalKey(IndexFile.authors),
  composers: Schema.optionalKey(IndexFile.composers),
  tunes: Schema.optionalKey(IndexFile.tunes),
  metrical: Schema.optionalKey(IndexFile.metrical),
});

type Binding = number | string | null;
type PassageSource = 'worship-aids' | 'scriptural' | 'scriptural-by-hymn';
type Ref = { readonly number: number; readonly page: number };

const insert = (db: Database, table: string, columns: string) => {
  const query = db.query(
    `INSERT INTO ${table} (${columns}) VALUES (${columns
      .split(',')
      .map(() => '?')
      .join(',')})`,
  );
  return (...values: Binding[]) => query.run(...values);
};

const flag = (value: boolean | undefined) => (value === true ? 1 : 0);

const writeHeader = (db: Database, index: Indexes[IndexName] & object) => {
  insert(db, 'index_files', 'name,title,note')(index.index, index.title, index.note ?? null);
  const page = insert(db, 'index_pages', 'name,ordinal,page,entries');
  index.pages.forEach((p, i) => page(index.index, i, p.page, p.entries));
};

const writePassages = (
  db: Database,
  source: PassageSource,
  entries: readonly {
    readonly passage: Passage;
    readonly number: number;
    readonly stanza?: string;
    readonly page: number;
  }[],
) => {
  const row = insert(
    db,
    'index_passages',
    'source,ordinal,number,stanza,page,kind,book,chapter,verse,to_chapter,to_verse',
  );
  const piece = insert(db, 'index_passage_verses', 'source,ordinal,piece,from_verse,to_verse');
  entries.forEach((entry, i) => {
    const { passage } = entry;
    const at = [source, i, entry.number, entry.stanza ?? null, entry.page] as const;
    if (passage._tag === 'Span') {
      row(
        ...at,
        'span',
        passage.book,
        passage.from.chapter,
        passage.from.verse,
        passage.to.chapter,
        passage.to.verse,
      );
      return;
    }
    row(...at, 'chapter', passage.book, passage.chapter, null, null, null);
    passage.verses.forEach((v, j) => piece(source, i, j, v.from, v.to));
  });
};

const writeRefs = (
  write: (ordinal: number, number: number, page: number) => unknown,
  refs: readonly Ref[],
) => refs.forEach((ref, i) => write(i, ref.number, ref.page));

const writeTopical = (db: Database, topical: NonNullable<Indexes['topical']>) => {
  const topic = insert(db, 'index_topics', 'topic,name,parent');
  const see = insert(db, 'index_topic_see', 'topic,ordinal,see');
  const ref = insert(db, 'index_topic_refs', 'topic,kind,ordinal,number,page');
  topical.topics.forEach((t, i) => {
    topic(i, t.name, t.parent ?? null);
    t.see.forEach((s, j) => see(i, j, s));
    writeRefs((j, n, p) => ref(i, 'hymn', j, n, p), t.hymns);
    writeRefs((j, n, p) => ref(i, 'reading', j, n, p), t.readings);
  });
};

const writeGroups = (
  db: Database,
  source: 'sentences' | 'canons',
  groups: readonly {
    readonly name: string;
    readonly hymns: readonly (Ref & { readonly stanzas?: readonly string[] })[];
  }[],
) => {
  const group = insert(db, 'index_groups', 'source,grp,name');
  const hymn = insert(db, 'index_group_hymns', 'source,grp,ordinal,number,page,stanzas');
  groups.forEach((g, i) => {
    group(source, i, g.name);
    g.hymns.forEach((h, j) => hymn(source, i, j, h.number, h.page, h.stanzas?.join('') ?? null));
  });
};

const writePeople = (
  db: Database,
  role: 'author' | 'composer',
  people: NonNullable<Indexes['authors']>['people'],
) => {
  const person = insert(db, 'index_people', 'role,person,name,source,see');
  const hymn = insert(db, 'index_person_hymns', 'role,person,ordinal,number,page');
  people.forEach((p, i) => {
    person(role, i, p.name, flag(p.source), p.see ?? null);
    writeRefs((j, n, pg) => hymn(role, i, j, n, pg), p.hymns);
  });
};

const writeTunes = (db: Database, tunes: NonNullable<Indexes['tunes']>) => {
  const tune = insert(db, 'index_tunes', 'tune,name,alias');
  const hymn = insert(db, 'index_tune_hymns', 'tune,ordinal,number,page');
  tunes.tunes.forEach((t, i) => {
    tune(i, t.name, flag(t.alias));
    writeRefs((j, n, p) => hymn(i, j, n, p), t.hymns);
  });
};

const writeMetrical = (db: Database, metrical: NonNullable<Indexes['metrical']>) => {
  const metre = insert(db, 'index_metres', 'metre,name,gloss');
  const tune = insert(db, 'index_metre_tunes', 'metre,ordinal,name');
  const hymn = insert(db, 'index_metre_tune_hymns', 'metre,tune,ordinal,number,page');
  metrical.metres.forEach((m, i) => {
    metre(i, m.metre, m.gloss ?? null);
    m.tunes.forEach((t, j) => {
      tune(i, j, t.name);
      writeRefs((k, n, p) => hymn(i, j, k, n, p), t.hymns);
    });
  });
};

const writeRulings = (db: Database, rulings: Rulings) => {
  const row = insert(db, 'index_rulings', 'ordinal,index_name,page,at,check_name,value,judge,why');
  rulings.rulings.forEach((r, i) =>
    row(i, r.index, r.page, r.at, r.check, r.value, r.judge, r.why),
  );
};

/** Create the `index_*` tables and store every index; the caller holds the transaction. */
export const writeIndexTables = (db: Database, { indexes, rulings }: IndexSources) => {
  db.exec(INDEX_TABLES);
  for (const index of Object.values(indexes)) writeHeader(db, index);
  const aids = indexes['worship-aids'];
  if (aids)
    writePassages(
      db,
      'worship-aids',
      aids.entries.map((e) => ({ ...e, number: e.reading })),
    );
  const scriptural = indexes.scriptural;
  if (scriptural)
    writePassages(
      db,
      'scriptural',
      scriptural.entries.map((e) => ({ ...e, number: e.hymn })),
    );
  const byHymn = indexes['scriptural-by-hymn'];
  if (byHymn) {
    writePassages(
      db,
      'scriptural-by-hymn',
      byHymn.entries.map((e) => ({ ...e, number: e.hymn })),
    );
    const see = insert(db, 'index_passage_see', 'ordinal,hymn,see,page');
    byHymn.see?.forEach((s, i) => see(i, s.hymn, s.see, s.page));
  }
  if (indexes.topical) writeTopical(db, indexes.topical);
  if (indexes.sentences) writeGroups(db, 'sentences', indexes.sentences.groups);
  if (indexes.canons) writeGroups(db, 'canons', indexes.canons.groups);
  const young = insert(db, 'index_young', 'ordinal,number,starred,page');
  indexes.young?.hymns.forEach((h, i) => young(i, h.number, flag(h.starred), h.page));
  if (indexes.authors) writePeople(db, 'author', indexes.authors.people);
  if (indexes.composers) writePeople(db, 'composer', indexes.composers.people);
  if (indexes.tunes) writeTunes(db, indexes.tunes);
  if (indexes.metrical) writeMetrical(db, indexes.metrical);
  writeRulings(db, rulings);
};

/** Rows grouped by a key, each group in the query's order. */
const groupBy = <R, K>(rows: readonly R[], key: (row: R) => K) => {
  const groups = new Map<K, R[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return (k: K): readonly R[] => groups.get(k) ?? [];
};

const all = <R>(db: Database, sql: string, ...params: Binding[]) =>
  db.query<R, Binding[]>(sql).all(...params);

/** `{ [key]: value }`, or nothing where the column is NULL: an absent optional key. */
const present = <V>(key: string, value: V | null) =>
  value === null ? [] : [[key, value] as const];
const optional = <V>(key: string, value: V | null): object =>
  Object.fromEntries(present(key, value));

type PassageRow = {
  readonly ordinal: number;
  readonly number: number;
  readonly stanza: string | null;
  readonly page: number;
  readonly kind: 'chapter' | 'span';
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
  readonly to_chapter: number | null;
  readonly to_verse: number | null;
};

const readPassages = (db: Database, source: PassageSource) => {
  const verses = groupBy(
    all<{ ordinal: number; from: number; to: number }>(
      db,
      'SELECT ordinal, from_verse AS "from", to_verse AS "to" FROM index_passage_verses WHERE source = ? ORDER BY ordinal, piece',
      source,
    ),
    (v) => v.ordinal,
  );
  return all<PassageRow>(
    db,
    'SELECT * FROM index_passages WHERE source = ? ORDER BY ordinal',
    source,
  ).map((row) => ({
    number: row.number,
    page: row.page,
    ...optional('stanza', row.stanza),
    passage:
      row.kind === 'chapter'
        ? {
            book: row.book,
            chapter: row.chapter,
            verses: verses(row.ordinal).map((v) => ({ from: v.from, to: v.to })),
          }
        : {
            book: row.book,
            from: { chapter: row.chapter, verse: row.verse },
            to: { chapter: row.to_chapter, verse: row.to_verse },
          },
  }));
};

const refs = (rows: readonly Ref[]) => rows.map((r) => ({ number: r.number, page: r.page }));

const readTopics = (db: Database) => {
  const see = groupBy(
    all<{ topic: number; see: string }>(
      db,
      'SELECT topic, see FROM index_topic_see ORDER BY topic, ordinal',
    ),
    (s) => s.topic,
  );
  const ref = groupBy(
    all<Ref & { topic: number; kind: string }>(
      db,
      'SELECT topic, kind, number, page FROM index_topic_refs ORDER BY topic, kind, ordinal',
    ),
    (r) => `${r.topic}:${r.kind}`,
  );
  return all<{ topic: number; name: string; parent: string | null }>(
    db,
    'SELECT * FROM index_topics ORDER BY topic',
  ).map((t) => ({
    name: t.name,
    ...optional('parent', t.parent),
    see: see(t.topic).map((s) => s.see),
    hymns: refs(ref(`${t.topic}:hymn`)),
    readings: refs(ref(`${t.topic}:reading`)),
  }));
};

const readGroups = (db: Database, source: 'sentences' | 'canons') => {
  const hymns = groupBy(
    all<Ref & { grp: number; stanzas: string | null }>(
      db,
      'SELECT grp, number, page, stanzas FROM index_group_hymns WHERE source = ? ORDER BY grp, ordinal',
      source,
    ),
    (h) => h.grp,
  );
  return all<{ grp: number; name: string }>(
    db,
    'SELECT grp, name FROM index_groups WHERE source = ? ORDER BY grp',
    source,
  ).map((g) => ({
    name: g.name,
    hymns: hymns(g.grp).map((h) => ({
      number: h.number,
      page: h.page,
      ...optional('stanzas', h.stanzas === null ? null : [...h.stanzas]),
    })),
  }));
};

const readPeople = (db: Database, role: 'author' | 'composer') => {
  const hymns = groupBy(
    all<Ref & { person: number }>(
      db,
      'SELECT person, number, page FROM index_person_hymns WHERE role = ? ORDER BY person, ordinal',
      role,
    ),
    (h) => h.person,
  );
  return all<{ person: number; name: string; source: number; see: string | null }>(
    db,
    'SELECT person, name, source, see FROM index_people WHERE role = ? ORDER BY person',
    role,
  ).map((p) => ({
    name: p.name,
    ...optional('source', p.source === 1 ? true : null),
    ...optional('see', p.see),
    hymns: refs(hymns(p.person)),
  }));
};

const readTunes = (db: Database) => {
  const hymns = groupBy(
    all<Ref & { tune: number }>(
      db,
      'SELECT tune, number, page FROM index_tune_hymns ORDER BY tune, ordinal',
    ),
    (h) => h.tune,
  );
  return all<{ tune: number; name: string; alias: number }>(
    db,
    'SELECT * FROM index_tunes ORDER BY tune',
  ).map((t) => ({
    name: t.name,
    ...optional('alias', t.alias === 1 ? true : null),
    hymns: refs(hymns(t.tune)),
  }));
};

const readMetres = (db: Database) => {
  const hymns = groupBy(
    all<Ref & { metre: number; tune: number }>(
      db,
      'SELECT metre, tune, number, page FROM index_metre_tune_hymns ORDER BY metre, tune, ordinal',
    ),
    (h) => `${h.metre}:${h.tune}`,
  );
  const tunes = groupBy(
    all<{ metre: number; ordinal: number; name: string }>(
      db,
      'SELECT * FROM index_metre_tunes ORDER BY metre, ordinal',
    ),
    (t) => t.metre,
  );
  return all<{ metre: number; name: string; gloss: string | null }>(
    db,
    'SELECT * FROM index_metres ORDER BY metre',
  ).map((m) => ({
    metre: m.name,
    ...optional('gloss', m.gloss),
    tunes: tunes(m.metre).map((t) => ({
      name: t.name,
      hymns: refs(hymns(`${m.metre}:${t.ordinal}`)),
    })),
  }));
};

/** Each index's entries, in its stored (encoded) form, read from its tables. */
const BODIES = {
  topical: (db) => ({ topics: readTopics(db) }),
  'worship-aids': (db) => ({
    entries: readPassages(db, 'worship-aids').map(({ number, ...e }) => ({
      ...e,
      reading: number,
    })),
  }),
  scriptural: (db) => ({
    entries: readPassages(db, 'scriptural').map(({ number, ...e }) => ({ ...e, hymn: number })),
  }),
  'scriptural-by-hymn': (db) => {
    const see = all<{ hymn: number; see: number; page: number }>(
      db,
      'SELECT hymn, see, page FROM index_passage_see ORDER BY ordinal',
    );
    return {
      entries: readPassages(db, 'scriptural-by-hymn').map(({ number, ...e }) => ({
        ...e,
        hymn: number,
      })),
      ...optional('see', see.length === 0 ? null : see),
    };
  },
  sentences: (db) => ({ groups: readGroups(db, 'sentences') }),
  canons: (db) => ({ groups: readGroups(db, 'canons') }),
  young: (db) => ({
    hymns: all<{ number: number; starred: number; page: number }>(
      db,
      'SELECT number, starred, page FROM index_young ORDER BY ordinal',
    ).map((h) => ({ number: h.number, starred: h.starred === 1, page: h.page })),
  }),
  authors: (db) => ({ people: readPeople(db, 'author') }),
  composers: (db) => ({ people: readPeople(db, 'composer') }),
  tunes: (db) => ({ tunes: readTunes(db) }),
  metrical: (db) => ({ metres: readMetres(db) }),
} satisfies { readonly [K in IndexName]: (db: Database) => object };

const isIndexName = Schema.is(IndexName);

/**
 * Rebuild the decoded files and the rulings from the `index_*` tables. The
 * rows are decoded by the files' own schemas, so a row no file could hold
 * fails here.
 */
export const readIndexTables = (db: Database): IndexSources => {
  const pages = groupBy(
    all<{ name: string; page: number; entries: number }>(
      db,
      'SELECT name, page, entries FROM index_pages ORDER BY name, ordinal',
    ),
    (p) => p.name,
  );
  const files = all<{ name: string; title: string; note: string | null }>(
    db,
    'SELECT name, title, note FROM index_files ORDER BY name',
  );
  const encoded = files.flatMap(({ name, title, note }) =>
    isIndexName(name)
      ? [
          [
            name,
            {
              version: 1,
              book: 'sdah-1985',
              index: name,
              title,
              ...optional('note', note),
              pages: pages(name).map((p) => ({ page: p.page, entries: p.entries })),
              ...BODIES[name](db),
            },
          ] as const,
        ]
      : [],
  );
  const rulings = all<{
    index_name: string;
    page: number;
    at: string;
    check_name: string;
    value: string;
    judge: string;
    why: string;
  }>(db, 'SELECT * FROM index_rulings ORDER BY ordinal').map((r) => ({
    index: r.index_name,
    page: r.page,
    at: r.at,
    check: r.check_name,
    value: r.value,
    judge: r.judge,
    why: r.why,
  }));
  return {
    indexes: Schema.decodeSync(IndexesSchema)(Object.fromEntries(encoded)),
    rulings: Schema.decodeUnknownSync(Rulings)({ version: 1, book: 'sdah-1985', rulings }),
  };
};

const encodeIndexes = Schema.encodeSync(IndexesSchema);
const encodeRulings = Schema.encodeSync(Schema.fromJsonString(Rulings));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * The name of each index (and `rulings`) whose stored form differs between
 * the two, compared as each schema encodes it: every entry, field and order.
 */
export const diffIndexTables = (expected: IndexSources, actual: IndexSources): string[] => {
  const want = encodeIndexes(expected.indexes);
  const got = encodeIndexes(actual.indexes);
  const names = IndexName.literals.filter(
    (name) => encodeJson(want[name] ?? null) !== encodeJson(got[name] ?? null),
  );
  return encodeRulings(expected.rulings) === encodeRulings(actual.rulings)
    ? names
    : [...names, 'rulings'];
};
