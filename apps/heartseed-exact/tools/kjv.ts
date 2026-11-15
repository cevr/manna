/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noRuntimeTypeof -- Exact's app folder cannot import Bun or Node: a host script that writes the shipped corpus before Exact reads it, and hands the Bun tests the same corpus behind a proxy whose trap tells a chapter's index from any other key. */

/**
 * The whole KJV the port ships, as the current Heartseed carries it: the
 * canon's 1,189 chapters in order, each its verses' shown text joined by a
 * newline, derived by the current app's own deriver
 * (`@manna/heartseed/vite/kjv`). `tools/prepare.ts` writes it to
 * `src/text/kjv.gen.json` (ignored, never committed), which `tsconfig.json`
 * maps `virtual:heartseed-kjv` to, so the current app's `src/kjv.ts` reads
 * it unchanged inside Exact's data module. `tools/setup.ts` hands the Bun
 * tests the same chapters through `countedCorpus`, which records each
 * chapter read by its index, so a test can see that a read splits only the
 * chapter it asks for.
 */

import { join } from 'node:path';

import { writeGenerated } from '@manna/exact-kit/prepare';
import { readChapters } from '@manna/heartseed/vite/kjv';

/** The shipped corpus's path. */
export const KJV_FILE = join(import.meta.dir, '..', 'src', 'text', 'kjv.gen.json');

/** The corpus, derived once per process. */
let derived: ReadonlyArray<string> = [];

/** The corpus as the current app's deriver gives it. */
export const corpus = (): ReadonlyArray<string> => {
  if (derived.length === 0) derived = readChapters();
  return derived;
};

/** Writes the shipped corpus when its text changed; whether it wrote. */
export const writeKjv = (): boolean => writeGenerated(KJV_FILE, JSON.stringify(corpus()));

/** The indexes of the chapters read through `countedCorpus`, in the order read. */
export const chaptersRead: Array<number> = [];

/** The corpus behind a proxy that records in `chaptersRead` each chapter read by its index. */
export const countedCorpus = (): ReadonlyArray<string> =>
  new Proxy([...corpus()], {
    get: (target, key, receiver) => {
      if (typeof key === 'string' && /^\d+$/u.test(key)) chaptersRead.push(Number(key));
      return Reflect.get(target, key, receiver);
    },
  });
