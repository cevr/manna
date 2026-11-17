/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAs, effect/noTryCatch -- Exact's app folder cannot import effect (docs/exact.md): a host script that reads bible.db read only (closed whatever its queries do) or, for the tests, the assets bible.db is built from, reads SQLite's untyped rows by the columns it asked for, and writes the study packs, with the build rule itself the pure src/study/build.ts. */

/**
 * Builds the reader's study packs (q126): the cross-references, the
 * Strong's tags lined up with the app's own KJV, the lexicon with how
 * the KJV renders each number, and find's word index. They are built from `bible.db`
 * (`packages/core/data/bible.db`, built from the assets in
 * `packages/core/assets` and kept on the owner's Mac alone), the one
 * database every tool reads, never from a separate copy; egw.cvr.im serves
 * them (`apps/egw-search`, `bun run study:publish`) and the phone downloads
 * them once. `assetSource` reads the same rows from the assets, so the
 * tests hold the packs to them without the database.
 *
 * `bun tools/study.ts [--db <bible.db>] [--out <dir>]` writes
 * `xrefs.json`, `tags.json` and `lexicon.json`, and find's word index
 * `words.json` (`tools/find.ts`'s index of the same database), into
 * `<dir>` and prints
 * their versions and how the tags lined up.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TaggedWord } from '../src/study/align';
import {
  buildStudy,
  type LexiconEntry,
  type StudyBuilt,
  type StudySource,
} from '../src/study/build';
import { canonChapters } from '../src/study/canon';
import { studyBodyOf, studyPackOf, type StudyPack } from '../src/study/pack';
import { wordsBodyOf, wordsPackOf } from '../src/study/words-pack';
import type { XrefPlace } from '../src/study/xrefs';
import { corpusOfDb, findPackOf } from './find';
import { corpus } from './kjv';

const ROOT = join(import.meta.dir, '..', '..', '..');

/** `bible.db` where the core package builds it. */
export const BIBLE_DB = join(ROOT, 'packages', 'core', 'data', 'bible.db');

/** The assets `bible.db` is built from. */
export const ASSETS = join(ROOT, 'packages', 'core', 'assets');

/** The study packs' names, as egw.cvr.im serves them under `/api/study/<name>`. */
export const STUDY_NAMES = ['xrefs', 'tags', 'lexicon'] as const;

/** A Strong's number without its letter. */
const bare = (number: string) => Number(number.slice(1));

const placeOf = (
  book: number,
  chapter: number,
  verse: number,
  end: number | null | undefined,
): XrefPlace => ({
  book,
  chapter,
  verse,
  last: end ?? verse,
});

const grouped = <A>(rows: Iterable<readonly [string, A]>) => {
  const map = new Map<string, Array<A>>();
  for (const [key, row] of rows) {
    const list = map.get(key) ?? [];
    map.set(key, list);
    list.push(row);
  }
  return map;
};

/** The packs' rows from `bible.db` at `path`, opened read only. */
export const dbSource = (path: string = BIBLE_DB): StudySource => {
  const db = new Database(path, { readonly: true });
  try {
    const refs = db
      .query(
        "SELECT book, chapter, verse, ref_book, ref_chapter, ref_verse, ref_verse_end FROM cross_refs WHERE source = 'openbible' ORDER BY rowid",
      )
      .all() as Array<Record<string, number | null>>;
    const words = db
      .query(
        'SELECT book, chapter, verse, word_text, strongs_numbers, italic FROM verse_words ORDER BY book, chapter, verse, word_index',
      )
      .all() as Array<Record<string, string | number | null>>;
    const entries = db
      .query(
        'SELECT number, lemma, transliteration, pronunciation, definition FROM strongs ORDER BY number',
      )
      .all() as Array<Record<string, string | null>>;
    const xrefs = grouped(
      refs.map(
        (row) =>
          [
            `${row['book']}.${row['chapter']}.${row['verse']}`,
            placeOf(
              Number(row['ref_book']),
              Number(row['ref_chapter']),
              Number(row['ref_verse']),
              row['ref_verse_end'],
            ),
          ] as const,
      ),
    );
    const tagged = grouped(
      words.map(
        (row) =>
          [
            `${row['book']}.${row['chapter']}.${row['verse']}`,
            {
              text: String(row['word_text']),
              numbers:
                row['strongs_numbers'] === null
                  ? []
                  : (JSON.parse(String(row['strongs_numbers'])) as Array<string>).map(bare),
              added: row['italic'] === 1,
            } satisfies TaggedWord,
          ] as const,
      ),
    );
    return {
      canon: canonChapters(),
      chapters: corpus(),
      xrefs: (key) => xrefs.get(key) ?? [],
      words: (key) => tagged.get(key),
      lexicon: entries.map((row) => ({
        number: String(row['number']),
        lemma: row['lemma'] ?? '',
        xlit: row['transliteration'] ?? '',
        pron: row['pronunciation'] ?? '',
        def: row['definition'] ?? '',
      })),
    };
  } finally {
    db.close();
  }
};

/** A cross-reference as `cross-refs.json` writes it. */
interface AssetRef {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly verseEnd?: number;
}

/** A tagged verse as `kjv-strongs.json` writes it. */
interface AssetVerse {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly words: ReadonlyArray<{
    readonly text: string;
    readonly strongs?: ReadonlyArray<string>;
    readonly italic?: boolean;
  }>;
}

/** A lexicon entry as `strongs.json` writes it. */
interface AssetEntry {
  readonly lemma: string;
  readonly xlit?: string;
  readonly pron?: string;
  readonly def: string;
}

const readAsset = (name: string): unknown =>
  JSON.parse(readFileSync(join(ASSETS, name), 'utf8')) as unknown;

/** The asset's cross-references by verse, in its order. */
export const assetXrefs = (): Map<string, ReadonlyArray<XrefPlace>> =>
  new Map(
    Object.entries(
      readAsset('cross-refs.json') as Record<string, { refs: ReadonlyArray<AssetRef> }>,
    ).map(([key, value]) => [
      key,
      value.refs.map((ref) => placeOf(ref.book, ref.chapter, ref.verse, ref.verseEnd)),
    ]),
  );

/** The asset's tagged words by verse. */
export const assetWords = (): Map<string, ReadonlyArray<TaggedWord>> =>
  new Map(
    (readAsset('kjv-strongs.json') as ReadonlyArray<AssetVerse>).map((verse) => [
      `${verse.book}.${verse.chapter}.${verse.verse}`,
      verse.words.map((word) => ({
        text: word.text,
        numbers: (word.strongs ?? []).map(bare),
        added: word.italic === true,
      })),
    ]),
  );

/** The asset's lexicon entries. */
export const assetLexicon = (): ReadonlyArray<LexiconEntry> =>
  Object.entries(readAsset('strongs.json') as Record<string, AssetEntry>).map(
    ([number, entry]) => ({
      number,
      lemma: entry.lemma,
      xlit: entry.xlit ?? '',
      pron: entry.pron ?? '',
      def: entry.def,
    }),
  );

/** The packs' rows from the assets `bible.db` is built from. */
export const assetSource = (): StudySource => {
  const xrefs = assetXrefs();
  const words = assetWords();
  return {
    canon: canonChapters(),
    chapters: corpus(),
    xrefs: (key) => xrefs.get(key) ?? [],
    words: (key) => words.get(key),
    lexicon: assetLexicon(),
  };
};

/** The three packs of `built`, by name. */
export const studyPacks = (built: StudyBuilt): Record<(typeof STUDY_NAMES)[number], StudyPack> => ({
  xrefs: studyPackOf(built.xrefs),
  tags: studyPackOf(built.tags),
  lexicon: studyPackOf(built.lexicon),
});

/** Each pack's version and body: the three of `built`, and find's word index of `chapters`. */
export const studyBodies = (built: StudyBuilt, chapters: ReadonlyArray<string>) => {
  const packs = studyPacks(built);
  const words = wordsPackOf(findPackOf(chapters));
  return [
    ...STUDY_NAMES.map((name) => ({
      name,
      version: packs[name].version,
      body: studyBodyOf(packs[name]),
    })),
    { name: 'words', version: words.version, body: wordsBodyOf(words) },
  ];
};

/** Writes the packs of `built` and the word index of `chapters` into `dir` as `<name>.json`; answers each one's version and bytes. */
export const writeStudy = (dir: string, built: StudyBuilt, chapters: ReadonlyArray<string>) => {
  mkdirSync(dir, { recursive: true });
  return studyBodies(built, chapters).map(({ name, version, body }) => {
    writeFileSync(join(dir, `${name}.json`), body);
    return { name, version, bytes: Buffer.byteLength(body) };
  });
};

/** The value after `flag` in `args`, or `fallback`. */
const flagOf = (args: ReadonlyArray<string>, flag: string, fallback: string) => {
  const at = args.indexOf(flag);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const db = flagOf(args, '--db', BIBLE_DB);
  const out = flagOf(args, '--out', join(import.meta.dir, '..', '.exact', 'study'));
  const built = buildStudy(dbSource(db));
  for (const pack of writeStudy(out, built, corpusOfDb(db)))
    process.stdout.write(`study ${pack.name} ${pack.version} ${pack.bytes} bytes\n`);
  const { equal, aligned, bare: left, numbered, kept } = built.counts;
  process.stdout.write(
    `study tags equal ${equal} aligned ${aligned} bare ${left} kept ${kept}/${numbered} numbered words\n`,
  );
}
