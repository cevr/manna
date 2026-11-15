/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- Exact's app folder cannot import Bun or Node: a host script that writes the shipped chapters module before Exact or a test reads it. */

/**
 * The canon's chapters as the garden needs them: each chapter's verse count
 * and no verse's text. The current Heartseed's lists and passages read the
 * KJV through `virtual:heartseed-kjv`, one string per chapter of its verses
 * joined by a newline, and the garden asks only how many verses a chapter
 * has (`inChapter`, `placeOf`). So each chapter here is that many empty
 * verses, counted from the current Heartseed's own read of `@manna/core`'s
 * KJV (`readVerses`). `tools/prepare.ts` writes it to
 * `src/garden/chapters.gen.json` (ignored) for Exact's bundle, which
 * `tsconfig.json` maps the virtual module to; `tools/setup.ts` hands the
 * same chapters to the Bun tests.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readVerses } from '@manna/heartseed/passage';

/** The chapters module's path. */
export const CHAPTERS_FILE = join(import.meta.dir, '..', 'src', 'garden', 'chapters.gen.json');

/** Every chapter of the canon in order, each its verses as empty strings joined by a newline. */
export const readChapters = (): ReadonlyArray<string> => {
  const counts = new Map<string, number>();
  for (const row of readVerses()) {
    const key = `${row.book}:${row.chapter}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].map((verses) => '\n'.repeat(verses - 1));
};

/** Writes the chapters module. */
export const writeChapters = () => {
  writeFileSync(CHAPTERS_FILE, JSON.stringify(readChapters()));
};
