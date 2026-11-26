/* oxlint-disable effect/noNodeBuiltinImport, effect/noTernary, effect/noNullish -- a Bun test's reader of the current app's own TypeScript files, by path under Bun. */

/**
 * The cues the current hymnal tells, read from its own source (`apps/hymnal`'s
 * `src/` and `app/`, tests aside), each by the name the port tells it by:
 *
 * - a plain cue (`plain('x')`, `plain((on && 'a') || 'b')`, `{ _tag: 'x' }`) by its name;
 * - a count-in beat (`{ _tag: 'beat', accent }`) as `beat` and `beat-accent`;
 * - a list topic's pin (`{ _tag: 'section' }`) as `section`;
 * - each `DialView`'s detent as `detent-<dial>`, and, while the dial
 *   (`player/dial.ts`, `DialView.tsx`) tells `{ _tag: 'wall' }`, each one
 *   that does not wrap as `wall-<dial>`: a find
 *   drum's dial (`dial={drum}`) is each of `player/drums.ts`'s drums, with
 *   the drum's own `wrap`.
 *
 * So a cue the current app adds, or a dial it gives a wall, is a site the
 * port has to tell before `sites.test.ts` holds.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** One's file, by its path from `apps/hymnal`, and its text. */
export interface OneFile {
  readonly path: string;
  readonly text: string;
}

const ONE = new URL('../../../hymnal/', import.meta.url).pathname;

/** Every TypeScript file under `dir`, its tests and test helpers aside. */
const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(join(ONE, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(ONE, path)).isDirectory()) return name === 'test' ? [] : walk(path);
    return /\.tsx?$/u.test(name) && !/\.test\.|\.testing\./u.test(name) ? [path] : [];
  });

/** The current app's own source: `src/` and `app/`, tests aside. */
export const oneFiles = (): ReadonlyArray<OneFile> =>
  [...walk('src'), ...walk('app')].map((path) => ({
    path,
    text: readFileSync(join(ONE, path), 'utf8'),
  }));

/** The opening tag of each `<DialView …>` in `text`, to its `>` outside every `{…}` prop. */
const dialViews = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(/<DialView\b/gu)].map((found) => {
    const from = found.index ?? 0;
    let depth = 0;
    for (let at = from; at < text.length; at++) {
      const c = text[at];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && text[at - 1] !== '=') return text.slice(from, at + 1);
    }
    return text.slice(from);
  });

/** The find drums `player/drums.ts` declares: each name and whether it wraps. */
const drumsOf = (files: ReadonlyArray<OneFile>): ReadonlyArray<{ name: string; wrap: boolean }> =>
  files
    .filter((file) => file.path.endsWith('/player/drums.ts'))
    .flatMap((file) => [...file.text.matchAll(/name: '(\w+)', count: [^,]+, wrap: (true|false)/gu)])
    .map((found) => ({ name: found[1] ?? '', wrap: found[2] === 'true' }));

/** Each dial a `DialView` draws and whether it wraps. */
const dialsOf = (files: ReadonlyArray<OneFile>): ReadonlyArray<{ name: string; wrap: boolean }> =>
  files
    .flatMap((file) => dialViews(file.text))
    .flatMap((view) => {
      const named = /\bdial="(\w+)"/u.exec(view)?.[1];
      if (named !== undefined)
        return [{ name: named, wrap: !/\bwrap=\{false\}/u.test(view) && /\bwrap\b/u.test(view) }];
      return /\bdial=\{drum\}/u.test(view) ? drumsOf(files) : [];
    });

/** The argument of the call whose `(` ends at `from`, to its balanced `)`. */
const argumentAt = (text: string, from: number): string => {
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const c = text[at];
    if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) return text.slice(from, at);
      depth--;
    }
  }
  return text.slice(from);
};

/** The dial's model and view, whose `wall` is a dial's: told per dial that stops. */
const DIAL_FILES = /\/player\/(?:dial\.ts|DialView\.tsx)$/u;

/** The plain cues a file's `plain(…)` calls can name. */
const plainCalls = (file: OneFile, plains: ReadonlySet<string>): ReadonlyArray<string> =>
  [...file.text.matchAll(/(?<![\w.])plain\(/gu)]
    .flatMap((call) => [
      ...argumentAt(file.text, (call.index ?? 0) + call[0].length).matchAll(/'([a-z-]+)'/gu),
    ])
    .map((name) => name[1] ?? '')
    .filter((name) => plains.has(name));

/** The cues a file's `{ _tag: 'x' }` literals tell: a plain cue (a dial's wall aside), a topic's pin, a count-in beat either way. */
const taggedCues = (file: OneFile, plains: ReadonlySet<string>): ReadonlyArray<string> =>
  [...file.text.matchAll(/_tag: '([a-z-]+)'/gu)].flatMap((tag) => {
    const name = tag[1] ?? '';
    if (name === 'beat') return ['beat', 'beat-accent'];
    if (name === 'section') return [name];
    const dialWall = DIAL_FILES.test(file.path) && name === 'wall';
    return plains.has(name) && !dialWall ? [name] : [];
  });

/** Every cue the current app's source tells, by the port's name for it, sorted. */
export const oneCues = (
  files: ReadonlyArray<OneFile>,
  plainCues: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const plains = new Set(plainCues);
  const dialWalls = files.some(
    (file) => DIAL_FILES.test(file.path) && /_tag: 'wall'/u.test(file.text),
  );
  const dials = dialsOf(files).flatMap((dial) =>
    dialWalls && !dial.wrap
      ? [`detent-${dial.name}`, `wall-${dial.name}`]
      : [`detent-${dial.name}`],
  );
  return [
    ...new Set([
      ...files.flatMap((file) => [...plainCalls(file, plains), ...taggedCues(file, plains)]),
      ...dials,
    ]),
  ].toSorted();
};
