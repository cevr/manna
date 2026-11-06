/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noRuntimeTypeof -- a child process the corpus test runs: it stands the corpus module in behind a counting proxy, whose trap tells an index from any other key, and only then awaits the app's reader, so the import is the thing measured. */

/**
 * The laziness probe (hskjv K3): run as `bun src/test/kjv-lazy-rig.ts`, it
 * serves `virtual:heartseed-kjv` as the bundler's derivation behind a proxy
 * that records each chapter read by index, imports `src/kjv.ts`, then
 * asks for the chapters named on its command line (`book:chapter` each).
 * It prints one line, `LAZY <json>`: the indexes read at import, and for
 * each chapter asked, its verse count and the indexes that read touched.
 * It prints counts and indexes only, never a verse.
 */

import { plugin } from 'bun';

import { readChapters } from '../../vite/kjv';

const reads = new Set<number>();
const corpus = new Proxy([...readChapters()], {
  get: (target, key, receiver) => {
    if (typeof key === 'string' && /^\d+$/u.test(key)) reads.add(Number(key));
    return Reflect.get(target, key, receiver);
  },
});
Object.assign(globalThis, { heartseedLazyCorpus: corpus });

plugin({
  name: 'heartseed-lazy-corpus',
  setup: (build) => {
    build.module('virtual:heartseed-kjv', () => ({
      contents: 'export default globalThis.heartseedLazyCorpus;',
      loader: 'js',
    }));
  },
});

const sorted = () => [...reads].toSorted((a, b) => a - b);

const kjv = await import('../kjv');
const atImport = sorted();
const asked = process.argv.slice(2).map((each) => {
  const [book, chapter] = each.split(':').map(Number);
  reads.clear();
  const verses = kjv.versesOf(Number(book), Number(chapter)).length;
  return { asked: each, verses, read: sorted() };
});
console.log(`LAZY ${JSON.stringify({ atImport, asked })}`);
