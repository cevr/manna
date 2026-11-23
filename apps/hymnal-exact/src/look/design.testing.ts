/* oxlint-disable effect/noNodeBuiltinImport, effect/noTernary, effect/noNullish -- the brand and contrast tests' readers of the app's own files, by path under Bun. */

/**
 * What the brand and contrast tests read from the app's own files: the
 * brand's tokens (`app.forma`'s `theme` block), and each text the
 * Contract files draw with the colour it is drawn in and the ground under
 * it, by the names they write.
 */

import { readFileSync, readdirSync } from 'node:fs';

const app = new URL('../../', import.meta.url);

/** An app file's text, by its path under the app's folder. */
export const appFile = (path: string) => readFileSync(new URL(path, app), 'utf8');

/** A file of the current hymnal (One), by its path under that app's folder. */
export const oneFile = (path: string) => readFileSync(new URL(`../hymnal/${path}`, app), 'utf8');

/** Every Contract file the view reads: `app.contract` and each `features/*.contract`. */
export const contractFiles = (): ReadonlyArray<string> => [
  'app.contract',
  ...readdirSync(new URL('features/', app))
    .filter((name) => name.endsWith('.contract'))
    .map((name) => `features/${name}`),
];

/** Every authored test file of the app (`*.test.contract`), by its path under the app's folder. */
export const testFiles = (): ReadonlyArray<string> =>
  readdirSync(app).filter((name) => name.endsWith('.test.contract'));

/** A colour token: its light and dark values as written. */
export interface Pair {
  readonly light: string;
  readonly dark: string;
}

/**
 * The brand: each colour token's pair, each token that names another (a
 * role set to a brand colour), each motion token (`duration.…`,
 * `easing.…`) and each measure token (`type.…`, `space.…`, …,
 * `src/look/tokens.ts`) with its value as written.
 */
export interface Brand {
  readonly colours: ReadonlyMap<string, Pair>;
  readonly names: ReadonlyMap<string, string>;
  readonly motion: ReadonlyMap<string, string>;
  readonly measures: ReadonlyMap<string, string>;
  readonly others: ReadonlyArray<string>;
}

/** A motion token's line: its name and its value as written. */
const MOTION = /^\s+((?:duration|easing)\.\S+)\s*=\s*(.+?)\s*$/u;

/** A measure token's line (`src/look/tokens.ts`): its name and its value as written, a kind after the name (`: length`) left off. */
const MEASURE =
  /^\s+((?:type|space|radius|size|line|opacity|nudge)\.[\w.-]+)(?::\s*[\w-]+)?\s*=\s*(.+?)\s*$/u;

/** The lines of the `theme` block, its comments and blanks left out. */
const themeLines = (text: string): ReadonlyArray<string> => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'theme');
  const shown = lines
    .slice(start + 1)
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'));
  const end = shown.findIndex((line) => !line.startsWith('  '));
  return end < 0 ? shown : shown.slice(0, end);
};

/** Each line `read` matches, as its name and value, into `into`. */
const readInto = (lines: ReadonlyArray<string>, read: RegExp, into: Map<string, string>) => {
  for (const line of lines) {
    const found = read.exec(line);
    if (found) into.set(found[1] ?? '', found[2] ?? '');
  }
};

/** `app.forma`'s `theme` block, read token by token. */
export const brandOf = (text: string): Brand => {
  const colours = new Map<string, Pair>();
  const names = new Map<string, string>();
  const motion = new Map<string, string>();
  const measures = new Map<string, string>();
  const others: Array<string> = [];
  const lines = themeLines(text);
  readInto(lines, MOTION, motion);
  readInto(lines, MEASURE, measures);
  for (const line of lines.filter((each) => !MOTION.test(each) && !MEASURE.test(each))) {
    const token = /^\s+(\S+)\s*=\s*(.+?)\s*$/u.exec(line);
    const pair = /^light-dark\((#[0-9a-f]+),\s*(#[0-9a-f]+)\)$/iu.exec(token?.[2] ?? '');
    if (token && pair) colours.set(token[1] ?? '', { light: pair[1] ?? '', dark: pair[2] ?? '' });
    else if (token && /^[\w-]+$/u.test(token[2] ?? '')) names.set(token[1] ?? '', token[2] ?? '');
    else others.push(line.trim());
  }
  return { colours, names, motion, measures, others };
};

/** A text a Contract file draws: where, the colour it is drawn in and the ground under it, as named there. */
export interface Drawn {
  readonly at: string;
  readonly ink: string;
  readonly ground: string;
}

/** The value of `name="…"` on a line, if it says one. */
const attribute = (line: string, name: string) =>
  new RegExp(`(?:^|\\s)${name}="([^"]+)"`, 'u').exec(line)?.[1];

/** A node's own colour and ground, by what it says or what its kind draws. */
const ownOf = (line: string) => {
  const style = attribute(line, 'buttonStyle');
  const filled = style === 'bordered-prominent' || style === 'filled';
  const grouped = /^\s*list\b/u.test(line) && attribute(line, 'listStyle') === 'inset-grouped';
  const button = /^\s*(button|link)\b/u.test(line);
  return {
    ink:
      attribute(line, 'color') ?? (filled ? 'AccentColorText' : button ? 'AccentColor' : undefined),
    ground:
      attribute(line, 'background-color') ??
      (filled ? 'AccentColor' : grouped ? '-exact-secondary-grouped-background' : undefined),
  };
};

/**
 * Each `text` of a Contract file's views with the colour and ground it is
 * drawn on: its own, else the nearest enclosing node's that says one, else
 * the page's text (`CanvasText`) on the page's ground (`Canvas`). A
 * button's or a link's words are its tint (`AccentColor`); a filled
 * button's are `AccentColorText` on the tint; an inset-grouped list's
 * rows stand on `-exact-secondary-grouped-background`.
 */
export const drawnIn = (file: string, text: string): ReadonlyArray<Drawn> => {
  const drawn: Array<Drawn> = [];
  const open: Array<{ indent: number; ink?: string; ground?: string }> = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '' || line.trim().startsWith('//')) return;
    const indent = line.length - line.trimStart().length;
    while ((open.at(-1)?.indent ?? -1) >= indent) open.pop();
    const own = ownOf(line);
    open.push({ indent, ...own });
    if (!/^\s*text\s/u.test(line)) return;
    const ink = open.findLast((node) => node.ink !== undefined)?.ink ?? 'CanvasText';
    const ground = open.findLast((node) => node.ground !== undefined)?.ground ?? 'Canvas';
    drawn.push({ at: `${file}:${index + 1}`, ink, ground });
  });
  return drawn;
};
