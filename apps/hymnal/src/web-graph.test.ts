/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The web loads no phone-only module. The web resolves a module name to its
 * `.web` file, else its plain one, never to a `.native`, `.ios` or `.android`
 * file; a module that names such a file outright (`~/reader/HymnList.native`)
 * puts it in the web's graph all the same, and with it the phone-only
 * packages it loads (`@legendapp/list/reanimated` brings React Native's own
 * Flow source), which the web's server cannot run: every route then renders
 * its error page, and the client mounts no list and no reader.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = `${import.meta.dir}/..`;

/** A local module a source loads at run time: an import, export or `import()` of `./`, `../` or `~/`, not a type-only one. */
const LOCAL_LOAD =
  /(?:\bimport\s+(?!type\s)(?:[^'";]*?\bfrom\s*)?|\bexport\s+(?!type\s)[^'";]*?\bfrom\s*|\bimport\s*\(\s*)['"]((?:\.\.?|~)\/[^'"]+)['"]/g;

/** The local module names `source` loads at run time. */
const localLoads = (source: string) =>
  [...source.matchAll(LOCAL_LOAD)].map((match) => match[1] ?? '');

/** Where the web's bundler looks for a module name, in its order. */
const WEB_EXTENSIONS = ['.web.tsx', '.web.ts', '.tsx', '.ts', '.js'];

/** The file the web resolves `name`, loaded from the file `from`, to; none for a module outside the app's sources. */
const resolveWeb = (name: string, from: string) => {
  const base = new URL(name.replace(/^~\//, '/src/'), `file:///${from}`).pathname.slice(1);
  const tries = [
    base,
    ...WEB_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...WEB_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return Option.fromNullishOr(
    tries.find((file) => /\.[cm]?[jt]sx?$/.test(file) && existsSync(`${ROOT}/${file}`)),
  );
};

/** A phone-only file: the web never resolves to it. */
const PHONE_ONLY = /\.(?:native|ios|android)\.[jt]sx?$/;

/** Each phone-only file the web reaches from `entries`, with the chain of files that loads it. */
const phoneOnlyReached = (entries: ReadonlyArray<string>) => {
  const seen = new Map<string, string>(entries.map((entry) => [entry, entry]));
  const queue = [...entries];
  const reached: Array<string> = [];
  for (let at = 0; at < queue.length; at += 1) {
    const file = queue[at] ?? '';
    const chain = seen.get(file) ?? file;
    if (PHONE_ONLY.test(file)) {
      reached.push(chain);
      continue;
    }
    for (const name of localLoads(readFileSync(`${ROOT}/${file}`, 'utf8'))) {
      for (const next of Option.toArray(resolveWeb(name, file))) {
        if (seen.has(next)) continue;
        seen.set(next, `${chain} → ${next}`);
        queue.push(next);
      }
    }
  }
  return { reached, seen: seen.size };
};

/** The web's routes and layouts: every file under `app` but the generated route types. */
const ROUTES = [...new Bun.Glob('app/**/*.tsx').scanSync(ROOT)].filter(
  (file) => !PHONE_ONLY.test(file),
);

describe('the web’s module graph', () => {
  it('reaches no .native, .ios or .android file from any route', () => {
    expect(ROUTES.length).toBeGreaterThan(5);
    const { reached, seen } = phoneOnlyReached(ROUTES);
    expect(seen).toBeGreaterThan(100);
    expect(reached).toEqual([]);
  });

  it('follows imports, re-exports and import(), and skips type-only ones', () => {
    const source = [
      "import { HymnList } from '~/reader/HymnList.native';",
      "import type { Opening } from '~/home/opening';",
      "export type { Shelf } from './lists';",
      "import './side';",
      "export { color } from '../color';",
      "const later = await import('./later');",
      "import { type Row, rowsOf } from './rows';",
    ].join('\n');
    expect(localLoads(source)).toEqual([
      '~/reader/HymnList.native',
      './side',
      '../color',
      './later',
      './rows',
    ]);
  });

  it('resolves a plain name to the web’s file and a named platform file to itself', () => {
    expect(resolveWeb('~/reader/HymnList', 'src/home/Search.tsx')).toEqual(
      Option.some('src/reader/HymnList.tsx'),
    );
    expect(resolveWeb('../reader/HymnList.native', 'src/home/Search.tsx')).toEqual(
      Option.some('src/reader/HymnList.native.tsx'),
    );
    expect(resolveWeb('./nowhere', 'src/home/Search.tsx')).toEqual(Option.none());
    expect(phoneOnlyReached(['src/reader/HymnList.native.tsx']).reached).toEqual([
      'src/reader/HymnList.native.tsx',
    ]);
  });
});
