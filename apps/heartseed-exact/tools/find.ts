/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAs, effect/noTernary, effect/noTryCatch -- Exact's app folder cannot import effect (docs/exact.md); a host script: it reads a copy of the repository's Bible database and writes the word index pack, which the app downloads and never bundles; the database's rows are typed as its schema has them, and the scratch copy is removed whatever happens. */

/**
 * The word index find reads (`src/find/pack.ts` says what it holds), as a
 * pack file the app downloads (q126) and never bundles. It is made from
 * the KJV rows of `packages/core/data/bible.db`, the database the `manna`
 * CLI reads, so every tool shares one source: `bun tools/find.ts [out]`
 * copies the database (and its WAL) to a scratch folder, reads the copy
 * read-only, and writes the pack to `out` (`FIND_OUT` by default) only when
 * its text changes. The database's words are the app's own in every verse
 * (only marks differ), so a hit found in the pack is cut from the text the
 * chapter shows. The tests make the same pack from the app's corpus
 * (`findPack`), which a fresh checkout has and the database is not.
 */

import { Database } from 'bun:sqlite';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { writeGenerated } from '@manna/exact-kit/prepare';

import {
  BIG_CLASS,
  bitmapOf,
  FIND_FORMAT,
  frontCoded,
  STOP_SHARE,
  TABLED_SHARE,
  varint,
  type FindLetter,
  type FindPack,
} from '../src/find/pack';
import { wordsOf } from '../src/find/words';
import { corpus } from './kjv';

/** The repository's Bible database, the `manna` CLI's. */
export const BIBLE_DB = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'packages',
  'core',
  'data',
  'bible.db',
);

/** Where the pack is written by default: ignored, never committed; the driver's launch is served it. */
export const FIND_OUT = join(import.meta.dir, '..', '.exact', 'find', 'find.json');

/** The KJV of the database at `db`, as `corpus` gives the app's: each chapter's verses' text by line, in canon order; read from a read-only copy. */
export const corpusOfDb = (db: string = BIBLE_DB): Array<string> => {
  const folder = mkdtempSync(join(tmpdir(), 'heartseed-find-db-'));
  try {
    const copy = join(folder, 'bible.db');
    copyFileSync(db, copy);
    if (existsSync(`${db}-wal`)) copyFileSync(`${db}-wal`, `${copy}-wal`);
    const read = new Database(copy, { readonly: true });
    const rows = read
      .query(
        "select book, chapter, text from verses where version_code = 'KJV' order by book, chapter, verse",
      )
      .all() as Array<{ book: number; chapter: number; text: string }>;
    read.close();
    const chapters: Array<Array<string>> = [];
    let key = '';
    for (const row of rows) {
      const next = `${row.book}.${row.chapter}`;
      if (next !== key) chapters.push([]);
      key = next;
      chapters.at(-1)?.push(row.text);
    }
    return chapters.map((verses) => verses.join('\n'));
  } finally {
    rmSync(folder, { recursive: true });
  }
};

/** What the corpus holds, word by word: each verse's words and each word's tokens and verses. */
interface Counted {
  readonly verses: ReadonlyArray<ReadonlyArray<string>>;
  readonly chapters: ReadonlyArray<number>;
  readonly tokens: ReadonlyMap<string, Array<number>>;
  readonly versesOf: ReadonlyMap<string, Array<number>>;
}

const counted = (chapters: ReadonlyArray<string>): Counted => {
  const verses: Array<ReadonlyArray<string>> = [];
  const counts: Array<number> = [];
  const tokens = new Map<string, Array<number>>();
  const versesOf = new Map<string, Array<number>>();
  let token = 0;
  for (const chapter of chapters) {
    const texts = chapter.split('\n');
    counts.push(texts.length);
    for (const text of texts) {
      const verse = verses.length;
      const words = wordsOf(text);
      verses.push(words);
      for (const word of words) {
        const places = tokens.get(word) ?? [];
        if (places.length === 0) tokens.set(word, places);
        places.push(token);
        token += 1;
        const holding = versesOf.get(word) ?? [];
        if (holding.length === 0) versesOf.set(word, holding);
        if (holding.at(-1) !== verse) holding.push(verse);
      }
    }
  }
  return { verses, chapters: counts, tokens, versesOf };
};

/** A sorted list of whole numbers as varints: the first whole, each next as its gap less one. */
const gapsOf = (values: ReadonlyArray<number>) =>
  values.map((value, at) => varint(at === 0 ? value : value - (values[at - 1] ?? 0) - 1)).join('');

/** The pack of `chapters`, the canon's chapters in order, each its verses' text by line. */
export const findPackOf = (
  chapters: ReadonlyArray<string>,
  tabledShare: number = TABLED_SHARE,
  bigClass: number = BIG_CLASS,
): FindPack => {
  const corpusCounts = counted(chapters);
  const size = corpusCounts.verses.length;
  const vocabulary = [...corpusCounts.tokens.keys()].sort();
  const inShare = (share: number) => (word: string) =>
    (corpusCounts.versesOf.get(word)?.length ?? 0) * share > size;
  const stops = vocabulary.filter(inShare(STOP_SHARE));
  const tabled = vocabulary.filter(inShare(tabledShare));
  const stopIds = new Map(tabled.map((word, id) => [word, id]));
  const table = corpusCounts.verses
    .map((words) => {
      const entries: Array<string> = [];
      let before = -1;
      words.forEach((word, at) => {
        const id = stopIds.get(word);
        if (id === undefined) return;
        entries.push(varint((at - before - 1) * tabled.length + id));
        before = at;
      });
      return varint(words.length) + varint(entries.length) + entries.join('');
    })
    .join('');
  const marks = tabled.map((word) => bitmapOf(corpusCounts.versesOf.get(word) ?? [], size));

  const sums = new Map<string, number>();
  for (const word of vocabulary) {
    if (stopIds.has(word)) continue;
    const count = corpusCounts.tokens.get(word)?.length ?? 0;
    for (let length = 1; length <= word.length; length += 1) {
      const prefix = word.slice(0, length);
      sums.set(prefix, (sums.get(prefix) ?? 0) + count);
    }
  }
  const classes: Record<string, string> = {};
  for (const prefix of [...sums.keys()].sort()) {
    if ((sums.get(prefix) ?? 0) <= bigClass) continue;
    const members = vocabulary
      .filter((word) => word.startsWith(prefix))
      .flatMap((word) => corpusCounts.versesOf.get(word) ?? []);
    classes[prefix] = bitmapOf(members, size);
  }

  const letters: Record<string, FindLetter> = {};
  for (const letter of [...new Set(vocabulary.map((word) => word.charAt(0)))]) {
    const words = vocabulary.filter((word) => word.charAt(0) === letter);
    const lists = words.map((word) =>
      stopIds.has(word) ? '' : gapsOf(corpusCounts.tokens.get(word) ?? []),
    );
    letters[letter] = {
      words: frontCoded(words),
      lens: lists.map((list) => varint(list.length)).join(''),
      lists: lists.join(''),
    };
  }

  return {
    format: FIND_FORMAT,
    verses: size,
    chapters: corpusCounts.chapters.map(varint).join(''),
    table,
    stops,
    tabled,
    marks,
    classes,
    letters,
  };
};

/** The pack of the corpus the app ships, made once per process. */
let made: FindPack | undefined;

/** The word index of the app's own KJV: the tests', which every checkout can make. */
export const findPack = (): FindPack => {
  made ??= findPackOf(corpus());
  return made;
};

/** Writes the word index of `chapters` to `file` when its text changed; whether it wrote. */
export const writeFind = (file: string, chapters: ReadonlyArray<string>): boolean => {
  mkdirSync(dirname(file), { recursive: true });
  return writeGenerated(file, JSON.stringify(findPackOf(chapters)));
};

if (import.meta.main) {
  const out = process.argv[2] ?? FIND_OUT;
  const wrote = writeFind(out, corpusOfDb());
  console.log(`find: ${wrote ? 'wrote' : 'kept'} ${out} from ${BIBLE_DB}`);
}
