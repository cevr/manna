/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noAs, effect/noTernary, effect/noUnsafeDictionaryType, eslint/no-await-in-loop, node/no-process-env, import/no-unassigned-import -- a host script that imports the tests' chapters preload for the corpus it measures, drives the built app through `bun run exact agent`, one process group per run and one launch at a time, reads its untyped JSON replies by the fields it checks, and prints what it found. */

/**
 * The reading settings' live checks a `.test.contract` cannot make (spec,
 * the drive table), on the chapter screen opened at Psalm 119
 * (`/read/at/19/119/1`), its verses drawn in `TypeColumn` under the
 * header's Aa button (`bun tools/drive-type.ts web|ios`, plain launches):
 *
 * - each font draws: each sets its own family on the text, each draws the
 *   chapter (verse 100's number or the whole chapter's height) other than
 *   the default, and each bundled family draws its own file: verse 100's
 *   number is as wide as its file's tabular figures and as tall as its
 *   ascent and descent at the size drawn, and unlike the system face its
 *   chain falls back to;
 * - the web's font files: what a default launch fetches (Exact's web host
 *   preloads every declared face, so this is a note, not a check);
 * - kept: a relaunch on the kept storage reads and draws the font, the size
 *   and the three spacings chosen;
 * - the worst case: Psalm 119 at 38 pt, Airy, Wider, Narrow, OpenDyslexic,
 *   then again at the largest system text size: all 176 verses built, none
 *   wider than its column, the last reached by scrolling in parts;
 * - the live preview: with the sheet at medium, a size step changes the
 *   text's size while the sheet stays up with its scroll kept; the time
 *   from a tap to settled, measured as the agent's replies arrive, under
 *   200 ms at the median;
 * - Reduce Motion: the sheet's own nodes carry no translate, scale or
 *   animation;
 * - on iOS, the app's size and its fonts' share of it, and the data
 *   module's load at three launches.
 *
 * Shots, light and dark, go to `TYPE_SHOTS` (the unit's folder) or
 * `.exact/shots/`. Exits 1 on any failed check.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import './setup';
import { TYPE_FONTS } from '../src/type/choices';
import {
  DRAWN_VERSE,
  drawnApart,
  drawsFile,
  fallbackOf,
  runOf,
  type DrawnRun,
} from '../src/type/drawn';
import { fontMeasures, readFontFile, readFontFolders } from './fonts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const web = host === 'web';
const drive = makeDrive({ name: 'drive-type', host, appDir: app });
const store = `type-${host}-${Date.now().toString(36)}`;
const size = web ? ['--size', '390x844'] : [];
const shots = process.env.TYPE_SHOTS ?? join(app, '.exact', 'shots');
mkdirSync(shots, { recursive: true });
const shot = (name: string) => `screenshot ${join(shots, `type-${host}-${name}.png`)}`;

/** Psalm 119's longest verse, by number: checked by its frame, its words never read out. The text's module reads the corpus `./setup` hands it, so it is imported after. */
const { textVerses } = await import('../src/text/text');
const lengths = textVerses(19, 119).map((verse) => verse.length);
const longest = lengths.indexOf(Math.max(...lengths)) + 1;

const FONTS = TYPE_FONTS.map((font) => font.key);
const WORST = [
  'type-font-opendyslexic',
  'type-line-airy',
  'type-letter-wider',
  'type-width-narrow',
];
/** The chapter scrolled in parts by the wheel, 20,000 px each (a drag is held to eight viewports a stroke), enough of them to pass Psalm 119's end at the largest text. */
const DRAGS = Array.from({ length: 100 }, () => 'tap chapter-scroll wheel 0 20000');
/** Psalm 119 on the chapter screen, where every launch opens. */
const PSALM = ['--url', '/read/at/19/119/1'];

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface Laid {
  readonly viewport?: { readonly w?: number; readonly h?: number };
  readonly node?: {
    readonly space?: { readonly viewport?: Frame };
    readonly scroll?: ReadonlyArray<{
      readonly id: number;
      readonly sx: number;
      readonly sy: number;
    }>;
    readonly visible?: { readonly inViewport?: boolean };
    readonly style?: Record<string, { readonly value?: string; readonly computed?: string }>;
    readonly browser?: Record<string, string>;
  };
}

/** A run's ops, each read back by the index `step` answers. */
const script = () => {
  const ops: string[] = [];
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  return { ops, step };
};

const laid = (replies: readonly unknown[], at: number) => replies[at] as Laid | undefined;
const frameOf = (replies: readonly unknown[], at: number) =>
  laid(replies, at)?.node?.space?.viewport;
const fontSizeOf = (replies: readonly unknown[], at: number) => {
  const node = laid(replies, at)?.node;
  return Number.parseFloat(
    node?.browser?.['font_size'] ??
      node?.style?.['font_size']?.computed ??
      node?.style?.['font_size']?.value ??
      '',
  );
};
/** How far the scroll nearest a laid-out node is scrolled: a scroll's own layout lists its ancestors', so the sheet's is read from a control inside it; iOS lists the sheet's presentation first, with no id. */
const innerScrollOf = (replies: readonly unknown[], at: number) =>
  (laid(replies, at)?.node?.scroll ?? []).findLast((entry) => Number.isInteger(entry.id))?.sy ?? -1;

/** How many of a tree's nodes are the chapter's verses, by their test ids alone. */
const versesIn = (replies: readonly unknown[], at: number) =>
  (
    (
      replies[at] as
        | { readonly nodes?: ReadonlyArray<{ readonly props?: { readonly testId?: string } }> }
        | undefined
    )?.nodes ?? []
  ).filter((node) => /^verse-\d+$/u.test(node.props?.testId ?? '')).length;

/** The worst case's checks over one pass: every verse built, none wider than its column, the last reached. */
const worstChecks = (name: string, replies: readonly unknown[], at: Record<string, number>) => {
  const column = frameOf(replies, at['column'] ?? -1);
  const verses = ['first', 'longest', 'last'].map((key) => frameOf(replies, at[key] ?? -1));
  const built = versesIn(replies, at['tree'] ?? -1);
  drive.check(
    `${name}: all 176 verses are built, and no more`,
    verses.every((frame) => frame !== undefined) && built === 176,
    { built, verses },
  );
  const inside = (frame: Frame | undefined) =>
    column !== undefined &&
    frame !== undefined &&
    frame.x >= column.x - 0.5 &&
    frame.x + frame.w <= column.x + column.w + 0.5;
  drive.check(
    `${name}: no verse is wider than its column (the first, the longest, ${longest}, the last)`,
    verses.every(inside),
    { column, verses },
  );
  drive.check(
    `${name}: the last verse is reached by scrolling in parts`,
    laid(replies, at['reached'] ?? -1)?.node?.visible?.inViewport === true,
    [
      laid(replies, at['reached'] ?? -1)?.node?.visible,
      laid(replies, at['reached'] ?? -1)?.node?.scroll,
    ],
  );
};

const a = script();
a.step('prefer prefers-color-scheme light', 'clock data', 'clock settle');
const probes: Record<string, number> = {};
/** Each font's verse 100's number: an inline run of three tabular figures, as wide as its face's advances. */
const numbers: Record<string, number> = {};
/** Each font's whole chapter: iOS lays a line out in thirds of a point, so one short line can measure the same in two faces, and 176 verses wrapped in them cannot. */
const columns: Record<string, number> = {};
a.step('tap chapter-aa', 'clock data', 'clock settle');
a.step(shot('sheet-light'));
for (const font of [...FONTS.slice(1), FONTS[0] ?? 'newyork']) {
  a.step(`tap type-font-${font}`, 'clock data', 'clock settle');
  probes[font] = a.step('layout verse-1');
  numbers[font] = a.step(`layout verse-number-${DRAWN_VERSE}`);
  columns[font] = a.step('layout type-column');
}
a.step(shot('fonts-light'));
/**
 * The medium sheet scrolled to its top, then by a little, so the size buttons stay in view (the agent brings a tap's target into view first, which would scroll the sheet itself).
 * The web's touch takes about 8 px of slop before it scrolls; iOS's drag scrolls by its whole length.
 */
a.step(
  'tap type-scroll drag 0 300',
  'clock settle',
  `tap type-scroll drag 0 ${web ? -26 : -12}`,
  'clock settle',
);
const scrollBefore = a.step('layout type-larger');
const sizeBefore = a.step('layout verse-1');
a.step('tap type-larger', 'clock data', 'clock settle');
const sizeAfter = a.step('layout verse-1');
const scrollAfter = a.step('layout type-larger');
const sheetUp = a.step('layout type-sheet');
a.step(...WORST.flatMap((id) => [`tap ${id}`, 'clock data']));
a.step(
  ...Array.from({ length: 9 }, () => ['tap type-larger', 'clock data']).flat(),
  'clock settle',
);
const worstState = a.step('state typeShown');
a.step(shot('worst-sheet-light'));
a.step('prefer prefers-color-scheme dark', 'clock settle', shot('worst-sheet-dark'));
a.step('prefer prefers-color-scheme light', 'tap type-done', 'clock settle');
const worst = {
  column: a.step('layout type-column'),
  first: a.step('layout verse-1'),
  longest: a.step(`layout verse-${longest}`),
  last: a.step('layout verse-176'),
  tree: a.step('tree'),
};
a.step(shot('worst-light'));
a.step(...DRAGS, 'clock settle');
const reached = a.step('layout verse-176');
a.step(shot('worst-end-light'));
a.step('prefer prefers-reduced-motion reduce', 'clock settle');
a.step('tap chapter-aa', 'clock +16');
const stillSheet = a.step('layout type-sheet');
const stillColumn = a.step('layout type-scroll');
a.step('clock settle', 'tap type-done', 'clock settle');
a.step('prefer root-font-size 53', 'clock data', 'clock settle');
const largest = {
  column: a.step('layout type-column'),
  first: a.step('layout verse-1'),
  longest: a.step(`layout verse-${longest}`),
  last: a.step('layout verse-176'),
  tree: a.step('tree'),
};
a.step(...DRAGS, 'clock settle');
const reachedLargest = a.step('layout verse-176');
a.step('prefer prefers-color-scheme dark', 'clock settle', shot('largest-end-dark'));
const first = await drive.run([...size, '--storage', store, '--reset-storage', ...PSALM], a.ops);

const families = Object.fromEntries(
  FONTS.map((font) => {
    const node = laid(first, probes[font] ?? -1)?.node;
    return [font, node?.browser?.['font_family'] ?? node?.style?.['font_family']?.value ?? ''];
  }),
);
drive.check(
  'each of the eleven fonts sets a family of its own on the text',
  new Set(Object.values(families)).size === FONTS.length && Object.values(families).every(Boolean),
  families,
);
const heights = Object.fromEntries(
  FONTS.map((font) => [font, frameOf(first, columns[font] ?? -1)?.h ?? Number.NaN]),
);
/** Each font's verse 100's number as laid out: its frame and the size it was drawn at. */
const runs = Object.fromEntries(
  FONTS.map((font): [string, DrawnRun] => {
    const frame = frameOf(first, numbers[font] ?? -1);
    return [
      font,
      {
        w: frame?.w ?? Number.NaN,
        h: frame?.h ?? Number.NaN,
        size: fontSizeOf(first, numbers[font] ?? -1),
      },
    ];
  }),
);
const drawn = (font: string) =>
  [runs[font]?.w, runs[font]?.h, runs[font]?.size, heights[font]].every(Number.isFinite);
const runAt = (font: string): DrawnRun => runs[font] ?? { w: Number.NaN, h: Number.NaN, size: 0 };
drive.check(
  `each of the ten other fonts draws the chapter other than the default does (verse ${DRAWN_VERSE}’s number or the whole chapter’s height)`,
  FONTS.slice(1).every(
    (font) =>
      drawn(font) &&
      (drawnApart(runAt(font), runAt(FONTS[0] ?? '')) ||
        Math.abs((heights[font] ?? 0) - (heights[FONTS[0] ?? ''] ?? 0)) > 0.5),
  ),
  { runs, heights },
);
const files = new Map(
  readFontFolders().map((folder) => {
    const regular = folder.files.find((name) => name.includes('Regular')) ?? '';
    return [folder.key, fontMeasures(readFontFile(`${folder.key}/${regular}`))] as const;
  }),
);
const fromFile = TYPE_FONTS.filter((font) => font.bundled !== '').map((font) => {
  const file = files.get(font.key);
  const run = runAt(font.key);
  const fallback = fallbackOf(font);
  return {
    font: font.key,
    ok:
      file !== undefined &&
      drawn(font.key) &&
      drawsFile(file, `${DRAWN_VERSE}`, run) &&
      drawnApart(run, runAt(fallback)),
    drawn: run,
    file: file === undefined ? undefined : runOf(file, `${DRAWN_VERSE}`, run.size),
    fallback: { [fallback]: runAt(fallback) },
  };
});
drive.check(
  `each of the seven bundled fonts draws its own file: verse ${DRAWN_VERSE}’s number as wide as its tabular figures and as tall as its ascent and descent, unlike the system face its chain falls back to`,
  fromFile.every((each) => each.ok),
  fromFile.filter((each) => !each.ok),
);
console.log(
  `RUN ${host} verse ${DRAWN_VERSE}'s number at 18 pt (w/h) and Psalm 119's height: ${FONTS.map((font) => `${font} ${runs[font]?.w}/${runs[font]?.h} ${heights[font]}`).join(', ')} (SF Rounded keeps SF's advances, so the two are told apart by family)`,
);
drive.check(
  'live preview: a size step changes the text’s size with the sheet at medium',
  fontSizeOf(first, sizeAfter) > fontSizeOf(first, sizeBefore),
  [fontSizeOf(first, sizeBefore), fontSizeOf(first, sizeAfter)],
);
drive.check(
  'live preview: the sheet stays up and keeps its scroll',
  frameOf(first, sheetUp) !== undefined &&
    innerScrollOf(first, scrollBefore) > 0 &&
    innerScrollOf(first, scrollAfter) === innerScrollOf(first, scrollBefore),
  [innerScrollOf(first, scrollBefore), innerScrollOf(first, scrollAfter)],
);
const chosen = first[worstState] as Record<string, unknown> | undefined;
drive.check(
  'the worst case is chosen: OpenDyslexic, 38 pt, Airy, Wider, Narrow',
  chosen?.['font'] === 'opendyslexic' &&
    chosen['size'] === 38 &&
    chosen['line'] === 'airy' &&
    chosen['letter'] === 'wider' &&
    chosen['width'] === 'narrow',
  chosen,
);
worstChecks('38 pt', first, { ...worst, reached });
worstChecks('the largest text', first, { ...largest, reached: reachedLargest });
/** The style rows that would move the sheet: a translate, a scale, a transform or a running animation. */
const moving = (at: number) =>
  Object.entries(laid(first, at)?.node?.style ?? {})
    .filter(
      ([name, row]) =>
        /^(translate|scale|transform|animation)/u.test(name) &&
        !['none', '', undefined].includes(row.computed ?? row.value),
    )
    .map(([name, row]) => `${name}=${row.computed ?? row.value}`);
drive.check(
  'Reduce Motion: the sheet moves by no translate, scale or animation of its own',
  frameOf(first, stillSheet) !== undefined &&
    [...moving(stillSheet), ...moving(stillColumn)].length === 0,
  [...moving(stillSheet), ...moving(stillColumn)],
);

const b = script();
b.step('clock data', 'clock settle');
const keptState = b.step('state typeShown');
const keptProbe = b.step('layout verse-1');
b.step(shot('kept-light'));
const again = await drive.run([...size, '--storage', store, '--keep-storage', ...PSALM], b.ops);
const kept = again[keptState] as Record<string, unknown> | undefined;
drive.check(
  'kept: a relaunch reads the font, the size and the three spacings chosen',
  kept?.['font'] === 'opendyslexic' &&
    kept['size'] === 38 &&
    kept['line'] === 'airy' &&
    kept['letter'] === 'wider' &&
    kept['width'] === 'narrow',
  kept,
);
drive.check(
  'kept: a relaunch draws them (the first line as wide and as large as before it)',
  Math.abs(fontSizeOf(again, keptProbe) - fontSizeOf(first, worst.first)) < 0.5,
  [fontSizeOf(again, keptProbe), fontSizeOf(first, worst.first)],
);

/** Each reply's arrival, in ms from the run's start, as the agent prints them. */
const timedRun = async (flags: readonly string[], ops: readonly string[]) => {
  const child = Bun.spawn(['bun', 'run', 'exact', 'agent', host, '--json', ...flags, ...ops], {
    cwd: app,
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  const overrun = setTimeout(() => {
    if (child.pid > 1) process.kill(-child.pid, 'SIGTERM');
  }, 600_000);
  const arrivals: number[] = [];
  const start = performance.now();
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of child.stdout) {
    pending += decoder.decode(chunk);
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) if (line.startsWith('{')) arrivals.push(performance.now() - start);
  }
  await child.exited;
  clearTimeout(overrun);
  return arrivals;
};

const STEPS = 7;
const timedOps = [
  'clock data',
  'tap chapter-aa',
  'clock settle',
  ...Array.from({ length: STEPS }, () => ['tap type-larger', 'clock settle']).flat(),
  ...Array.from({ length: STEPS }, () => ['clock settle', 'clock settle']).flat(),
];
const arrivals = await timedRun(
  [...size, '--storage', `${store}-timed`, '--reset-storage', ...PSALM],
  timedOps,
);
const median = (values: readonly number[]) =>
  [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] ?? Number.NaN;
const spans = (from: number) =>
  Array.from({ length: STEPS }, (_, index) => {
    const at = from + 2 * index;
    return (arrivals[at + 1] ?? Number.NaN) - (arrivals[at - 1] ?? Number.NaN);
  });
const stepped = median(spans(3));
const idle = median(spans(3 + 2 * STEPS));
console.log(
  `TIME ${host} a size step, tap to settled: median ${stepped.toFixed(0)} ms; two idle replies ${idle.toFixed(0)} ms; Psalm 119's 176 verses redrawn`,
);
drive.check(
  'live preview: a size step settles in under 200 ms at the median (beyond two idle replies)',
  stepped - idle < 200,
  { stepped, idle },
);

if (web) {
  const index = join(app, 'target', 'web-dist', 'index.html');
  const preloads = existsSync(index)
    ? [
        ...readFileSync(index, 'utf8').matchAll(
          /<link rel="preload" href="(assets\/fonts\/[^"]+)" as="font"/gu,
        ),
      ].map((m) => m[1] ?? '')
    : [];
  const bytes = preloads.reduce((sum, path) => sum + statSync(join(app, path)).size, 0);
  console.log(
    `NOTE web a default launch fetches ${preloads.length} of the 14 font files (${bytes} bytes): Exact's web host preloads every declared face (host/web-js/src/faces.rs, font-display: optional), so no face waits for its first use`,
  );
} else {
  const products = join(app, 'target');
  const apps = existsSync(products)
    ? readdirSync(products, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
        .map((entry) => join(entry.parentPath, entry.name))
    : [];
  const sizeOf = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sum + sizeOf(path);
      return sum + statSync(path).size;
    }, 0);
  for (const bundle of apps) {
    const fonts = readdirSync(bundle, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:ttf|otf)$/u.test(entry.name))
      .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
    console.log(
      `COST ios ${bundle.slice(products.length + 1)}: ${sizeOf(bundle)} bytes, of which ${fonts} in font files`,
    );
  }
  for (const run of [1, 2, 3]) {
    const logs = await drive.run(
      ['--storage', `${store}-cost`, '--keep-storage'],
      ['clock data', 'logs'],
    );
    const text = JSON.stringify(logs[1] ?? '');
    const load = /top level took (\d+) ms/u.exec(text)?.[1] ?? 'unread';
    console.log(`COST ios launch ${run}: the data module's top level took ${load} ms`);
  }
}

process.exit(drive.finish());
