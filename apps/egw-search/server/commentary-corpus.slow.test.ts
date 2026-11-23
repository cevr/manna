/** The commentary pack built over the real corpus, `egw-paragraphs.db` under
 *  `BIBLE_CORPUS_DIR` or `~/.bible`, opened read-only.
 *
 *  The corpus is not committed, so on a machine without it these checks skip,
 *  and the first test says so: a skip is never a silent pass. */

import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Config, Console, Effect, FileSystem, Layer, Option, Schema as S, Stream } from 'effect';

import { parseBibleQuery } from '@manna/core/bible';
import type { Schemas } from '@manna/core/egw';
import { EGWParagraphDatabase, SqlAtomic } from '@manna/core/egw-db';

import { CommentaryPackSchema } from './api.js';
import { buildPack } from './commentary-api.js';
import { COMMENTARY_BOOKS } from './commentary.js';

// oxlint-disable-next-line effect/noAsyncFunction -- it.skipIf needs the corpus's presence at module-evaluation time
const corpus = await Effect.runPromise(
  Effect.gen(function* () {
    const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
    const root = yield* Config.String('BIBLE_CORPUS_DIR').pipe(
      Config.withDefault(`${home}/.bible`),
    );
    const file = `${root}/egw-paragraphs.db`;
    const present = yield* (yield* FileSystem.FileSystem).exists(file);
    return Option.filter(Option.some(file), () => present);
  }).pipe(Effect.provide(BunServices.layer)),
);

type Node = Schemas.Paragraph['nodes'][number];
type Pack = typeof CommentaryPackSchema.Type;

const titles = (nodes: readonly Node[]): string[] =>
  nodes.flatMap((node) => {
    if (node._tag === 'ScriptureRef') return [node.title, ...titles(node.children)];
    if ('children' in node) return titles(node.children);
    return [];
  });

const read = (file: string) =>
  Effect.gen(function* () {
    const db = yield* EGWParagraphDatabase;
    const pack = yield* S.decodeEffect(S.fromJsonString(CommentaryPackSchema))(
      (yield* buildPack).body,
    );
    const paragraphs: Schemas.Paragraph[] = [];
    for (const code of COMMENTARY_BOOKS)
      for (const book of yield* db.getBooksByCode(code))
        paragraphs.push(...(yield* Stream.runCollect(db.getParagraphsByBook(book.book_id))));
    return { pack, paragraphs };
  }).pipe(
    Effect.provide(
      EGWParagraphDatabase.layerExisting.pipe(
        Layer.provide(SqlAtomic.layerTransaction),
        Layer.provideMerge(SqliteClient.layer({ filename: file, readonly: true })),
        Layer.orDie,
      ),
    ),
  );

const withCorpus = <A>(
  check: (read: { readonly pack: Pack; readonly paragraphs: readonly Schemas.Paragraph[] }) => A,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      for (const file of Option.toArray(corpus)) check(yield* read(file));
    }),
  );

const notesIn = (
  pack: Pack,
  book: number,
  chapter: number,
): readonly (readonly [number, string])[] =>
  (pack.verses[`${String(book)}.${String(chapter)}`] ?? []).flatMap(([verse, indexes]) =>
    indexes.map((index) => [verse, pack.notes[index]?.[0] ?? ''] as const),
  );

const notesOn = (pack: Pack, book: number, chapter: number, verse: number): readonly string[] =>
  notesIn(pack, book, chapter)
    .filter(([at]) => at === verse)
    .map(([, reference]) => reference);

const isSectionTitle = (paragraph: Schemas.Paragraph): boolean =>
  /^h\d$/.test(paragraph.element_type ?? '');

/** Each citation title of `paragraph` naming a verse whose chapter does not
 *  hold the paragraph's note. */
const unlinked = (pack: Pack, paragraph: Schemas.Paragraph): readonly string[] =>
  Option.toArray(paragraph.refcode_short).flatMap((reference) =>
    titles(paragraph.nodes)
      .filter((title) => {
        const parsed = parseBibleQuery(title);
        if (parsed._tag !== 'single') return false;
        return !notesIn(pack, parsed.ref.book, parsed.ref.chapter).some(
          ([, note]) => note === reference,
        );
      })
      .map((title) => `${reference} ${title}`),
  );

describe('the commentary pack over the local corpus', () => {
  it('reports whether the corpus was there, so a skip is never silent', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (Option.isNone(corpus))
          yield* Console.warn(
            '[commentary] corpus checks SKIPPED: no egw-paragraphs.db under BIBLE_CORPUS_DIR or ~/.bible',
          );
        expect(Option.isSome(corpus) || Option.isNone(corpus)).toBe(true);
      }),
    ));

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the EGW corpus, which is not committed; it skips, and says so above, on a machine without it
  it.skipIf(Option.isNone(corpus))('John 1:14 and John 1:1 each have at least ten notes', () =>
    withCorpus(({ pack }) => {
      expect(notesOn(pack, 43, 1, 14).length).toBeGreaterThanOrEqual(10);
      expect(notesOn(pack, 43, 1, 1).length).toBeGreaterThanOrEqual(10);
    }),
  );

  // oxlint-disable-next-line film/tests-keep-their-strength -- needs the EGW corpus, which is not committed; it skips, and says so above, on a machine without it
  it.skipIf(Option.isNone(corpus))(
    "every paragraph is a note in each chapter its citations' titles name",
    () =>
      withCorpus(({ pack, paragraphs }) => {
        const missing = paragraphs
          .filter((paragraph) => !isSectionTitle(paragraph))
          .flatMap((paragraph) => unlinked(pack, paragraph));
        expect(missing).toEqual([]);
      }),
  );
});
