/**
 * `bun run handbook -- --db <copy>`: writes `data/handbook.json`, Haskell's
 * *Bible Handbook* (1919) as lists of KJV ranges under his own headings,
 * from a copy of the EGW paragraph database (opened read-only, never the
 * owner's file in place) and the committed contents snapshot
 * (`data/handbook-contents.json`), the practical sections of
 * `LEFT_OUT_SECTIONS` left out. It prints one line of totals.
 * `--refresh-contents` fetches the public contents page once and rewrites
 * the snapshot first; nothing else reaches the network.
 */
import { Database } from 'bun:sqlite';

import { getBibleBookByName } from '@manna/core/bible';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient, HttpClient } from 'effect/http';

import { readVerses } from '../vite/passage';
import { LEFT_OUT_SECTIONS } from './handbook/lists';
import {
  CONTENTS_URL,
  type Chapters,
  contentsOf,
  contentsText,
  generate,
  handbookText,
  readContents,
  totalsLine,
} from './handbook/source';

/** The KJV's books by name and its chapters' sizes, from the corpus the app bundles. */
const kjvChapters = (): Chapters => {
  const sizes = new Map<string, number>();
  for (const verse of readVerses()) {
    const key = `${verse.book}.${verse.chapter}`;
    sizes.set(key, Math.max(sizes.get(key) ?? 0, verse.verse));
  }
  return {
    bookOf: (name) => Option.map(getBibleBookByName(name), (book) => Number(book.number)),
    count: (book, chapter) => sizes.get(`${book}.${chapter}`) ?? 0,
  };
};

/** Fetches the contents page and rewrites the snapshot at `at`. */
const refreshContents = Effect.fn('Handbook.refreshContents')(function* (at: string) {
  const fs = yield* FileSystem.FileSystem;
  const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
  const html = yield* client.get(CONTENTS_URL).pipe(Effect.flatMap((response) => response.text));
  const entries = contentsOf(html);
  yield* fs.writeFileString(at, contentsText(entries));
  yield* Console.log(`handbook contents entries=${entries.length}`);
});

const run = Effect.fn('Handbook.run')(function* (db: string, refresh: boolean) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '..');
  const contentsAt = path.join(root, 'data/handbook-contents.json');
  if (refresh) yield* refreshContents(contentsAt);
  const entries = yield* readContents(yield* fs.readFileString(contentsAt));
  const lists = yield* Effect.acquireUseRelease(
    Effect.sync(() => new Database(db, { readonly: true })),
    (opened) => generate(opened, entries, LEFT_OUT_SECTIONS, kjvChapters()),
    (opened) => Effect.sync(() => opened.close()),
  );
  yield* fs.writeFileString(path.join(root, 'data/handbook.json'), handbookText(lists));
  yield* Console.log(totalsLine(lists));
});

const command = Command.make(
  'handbook',
  {
    db: Flag.String('db').pipe(
      Flag.withDescription('a copy of the EGW paragraph database, opened read-only'),
    ),
    refreshContents: Flag.Boolean('refresh-contents').pipe(
      Flag.withDefault(false),
      Flag.withDescription('fetch the contents page and rewrite data/handbook-contents.json first'),
    ),
  },
  (flags) => run(flags.db, flags.refreshContents),
);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer)),
    (program) => BunRuntime.runMain(program),
  );
}
