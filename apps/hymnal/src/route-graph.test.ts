/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * What each platform loads from the app's routes, read from the sources as
 * that platform's bundler resolves them.
 *
 * The web loads no phone-only module. The web resolves a module name to its
 * `.web` file, else its plain one, never to a `.native`, `.ios` or `.android`
 * file; a module that names such a file outright (`~/reader/HymnList.native`)
 * puts it in the web's graph all the same, and with it the phone-only
 * packages it loads (`@legendapp/list/reanimated` brings React Native's own
 * Flow source), which the web's server cannot run: every route then renders
 * its error page, and the client mounts no list and no reader.
 *
 * On a phone every gesture detector draws inside a gesture root. A pushed
 * screen is a native view of its own, outside the root of the screen under
 * it, so a module a route reaches that draws a `GestureDetector` must lie
 * under a module that draws a `GestureHandlerRootView`; else the gesture
 * handler throws as the screen draws in a development build, and the screen
 * never mounts.
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

/** Where each platform's bundler looks for a module name, in its order. */
const EXTENSIONS = {
  web: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.js'],
  ios: ['.ios.tsx', '.ios.ts', '.native.tsx', '.native.ts', '.tsx', '.ts', '.js'],
} as const;
type Platform = keyof typeof EXTENSIONS;

/** The file `platform` resolves `name`, loaded from the file `from`, to; none for a module outside the app's sources. */
const resolveOn = (platform: Platform, name: string, from: string) => {
  const base = new URL(name.replace(/^~\//, '/src/'), `file:///${from}`).pathname.slice(1);
  const tries = [
    base,
    ...EXTENSIONS[platform].map((ext) => `${base}${ext}`),
    ...EXTENSIONS[platform].map((ext) => `${base}/index${ext}`),
  ];
  return Option.fromNullishOr(
    tries.find((file) => /\.[cm]?[jt]sx?$/.test(file) && existsSync(`${ROOT}/${file}`)),
  );
};

/**
 * Each file `platform` reaches from `entries` that `flagged` marks, with the
 * chain of files that loads it. The walk goes no further than a flagged file,
 * nor past a file `stops` marks.
 */
const reach = (
  platform: Platform,
  entries: ReadonlyArray<string>,
  flagged: (file: string, source: string) => boolean,
  stops: (source: string) => boolean = () => false,
) => {
  const seen = new Map<string, string>(entries.map((entry) => [entry, entry]));
  const queue = [...entries];
  const reached: Array<string> = [];
  for (let at = 0; at < queue.length; at += 1) {
    const file = queue[at] ?? '';
    const chain = seen.get(file) ?? file;
    const source = readFileSync(`${ROOT}/${file}`, 'utf8');
    if (flagged(file, source)) {
      reached.push(chain);
      continue;
    }
    if (stops(source)) continue;
    for (const name of localLoads(source)) {
      for (const next of Option.toArray(resolveOn(platform, name, file))) {
        if (seen.has(next)) continue;
        seen.set(next, `${chain} → ${next}`);
        queue.push(next);
      }
    }
  }
  return { reached, seen: seen.size };
};

/** A phone-only file: the web never resolves to it. */
const PHONE_ONLY = /\.(?:native|ios|android)\.[jt]sx?$/;
const phoneOnly = (file: string) => PHONE_ONLY.test(file);

/** A module that draws a gesture root: what it draws inside it is rooted. */
const drawsRoot = (source: string) => /<GestureHandlerRootView\b/.test(source);

/** A module that draws a gesture detector and no gesture root of its own. */
const unrootedDetector = (_file: string, source: string) =>
  /<GestureDetector\b/.test(source) && !drawsRoot(source);

/** The app's routes and layouts: every file under `app`. */
const ROUTES = [...new Bun.Glob('app/**/*.tsx').scanSync(ROOT)].filter((file) => !phoneOnly(file));

describe('the web’s module graph', () => {
  it('reaches no .native, .ios or .android file from any route', () => {
    expect(ROUTES.length).toBeGreaterThan(5);
    const { reached, seen } = reach('web', ROUTES, phoneOnly);
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
    expect(resolveOn('web', '~/reader/HymnList', 'src/home/Search.tsx')).toEqual(
      Option.some('src/reader/HymnList.tsx'),
    );
    expect(resolveOn('web', '../reader/HymnList.native', 'src/home/Search.tsx')).toEqual(
      Option.some('src/reader/HymnList.native.tsx'),
    );
    expect(resolveOn('web', './nowhere', 'src/home/Search.tsx')).toEqual(Option.none());
    expect(reach('web', ['src/reader/HymnList.native.tsx'], phoneOnly).reached).toEqual([
      'src/reader/HymnList.native.tsx',
    ]);
  });
});

describe('the phone’s gesture detectors', () => {
  it('each lies under a gesture root, from every route', () => {
    const { reached, seen } = reach('ios', ROUTES, unrootedDetector, drawsRoot);
    expect(seen).toBeGreaterThan(100);
    expect(reached).toEqual([]);
  });

  it('resolves a phone’s file before the plain one', () => {
    expect(resolveOn('ios', '~/reader/HymnScreen', 'app/(hymnal)/hymns/[number].tsx')).toEqual(
      Option.some('src/reader/HymnScreen.native.tsx'),
    );
    expect(resolveOn('ios', '~/player/Scrubber', 'src/player/PlayerBar.tsx')).toEqual(
      Option.some('src/player/Scrubber.ios.tsx'),
    );
  });

  it('finds a detector drawn outside any root, and none past a root', () => {
    expect(unrootedDetector('', '<GestureDetector gesture={pan}><View /></GestureDetector>')).toBe(
      true,
    );
    expect(
      unrootedDetector(
        '',
        '<GestureHandlerRootView><GestureDetector gesture={pan} /></GestureHandlerRootView>',
      ),
    ).toBe(false);
    expect(drawsRoot('<GestureHandlerRootView style={styles.screen}>')).toBe(true);
  });
});
