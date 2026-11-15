/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNewPromise, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, node/no-process-env -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads the frames its layout replies name and prints what it found; its shots folder is named by SHOTS. */

/**
 * The chords' live checks a `.test.contract` cannot hold (spec B2, B5 and
 * the largest text): an authored test reads text, state and the tree,
 * never where a node is drawn. On the host named
 * (`bun tools/drive-chords.ts web|ios`), with chords turned on in Settings
 * and hymn 2 open:
 *
 * - at the default text size, three named chords each stand over their own
 *   syllable: the chord's left edge within a point of its syllable's, and
 *   its bottom at or above the syllable's top;
 * - at the largest text size (`prefer root-font-size`, 53 px, iOS's AX5
 *   body), every chord of the first stanza stands over its own syllable in
 *   the same way, and each line breaks where the line rule says
 *   (`breaksOf` over the pairs' measured widths, the line's width and the
 *   measured gap between words), at the line's width give or take half a
 *   point, since a host rounds each frame to its pixel grid and a row that
 *   fills the line to within that may break either way: no pair split, no
 *   chord on the wrong row;
 * - a capo set, a relaunch on the kept store shows chords still on and the
 *   capo kept.
 *
 * Screens at the largest size are kept in SHOTS. Exits 1 on any failed check.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { readChords } from '@manna/hymnal-app/vite/chords';

import { breaksOf, type Place } from '../src/chords/rows.ts';
import { sourcesAt } from '../src/sources.ts';
import { checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/chords');
const shot = (name: string) => `screenshot ${join(shots, `${name}-${host}.png`)}`;
/**
 * The agent's server is the recordings' fixture on this checkout's own
 * port (`--backend`, and the build's recordings origin with it), as the
 * player's drive has it, so another checkout's tests on 4797 never refuse
 * a run.
 */
const backend = `http://127.0.0.1:${checkoutPort()}`;
const env = { ...process.env, HYMNAL_RECORDINGS: backend };
const processes = {
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    });
    return {
      pid: child.pid,
      ended: Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]).then(([stdout, stderr, code]) => ({ code, stdout, stderr })),
    };
  },
  signal: (pid: number, signal: 'SIGTERM') => {
    if (pid < -1) process.kill(pid, signal);
  },
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};
const drive = makeDrive({ name: 'drive-chords', host, appDir: app, processes });
const store = `chords-${host}-${Date.now().toString(36)}`;

const LARGEST = 53;
const HYMN = '2';
const NAMED = ['1-1-1', '1-1-6', '1-1-7'];

/** Hymn 2's first stanza as the source answers it with chords on: each line's words' pairs, by their ids' `k-i-j`. */
const stanza = (() => {
  const page = sourcesAt('https://hymns.cvr.im', [], readChords()).chordsPage([HYMN, true, []]);
  const lines = page.parts[0]?.lines ?? [];
  return lines.map((line) =>
    line.words.map((word) =>
      word.boxes.map((box, b) => ({ id: `1-${line.at}-${word.at + b}`, chord: box.chord !== '' })),
    ),
  );
})();

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A layout reply's frame in the viewport, or none. */
const frameOf = (reply: unknown): Frame | undefined =>
  (reply as { node?: { space?: { viewport?: Frame } } } | undefined)?.node?.space?.viewport;

const chordsOn = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap chords-toggle',
  'clock settle',
  'clock data',
  'tap settings-done',
  'clock settle',
  'tap hymn-list drag 0 -600',
  'clock settle',
  `tap hymn-${HYMN}`,
  'clock settle',
  'clock data',
];

/** The ops that measure `ids` (chord and syllable, or a pair, or a line), and how to read their replies back. */
const measure = (ids: ReadonlyArray<string>) => ids.map((id) => `layout ${id}`);

const pairs = stanza.flat(2);
const chorded = pairs.filter((pair) => pair.chord).map((pair) => pair.id);
const lineIds = stanza.map((_, i) => `line-1-${i + 1}`);

const defaultOps = measure(NAMED.flatMap((id) => [`chord-${id}`, `syllable-${id}`]));
const largeOps = [
  `prefer root-font-size ${LARGEST}`,
  'clock settle',
  ...measure(lineIds),
  ...measure(pairs.map((pair) => `pair-${pair.id}`)),
  ...measure(chorded.flatMap((id) => [`chord-${id}`, `syllable-${id}`])),
  shot('largest'),
  'tap hymn-words drag 0 -400',
  'clock settle',
  shot('largest-scrolled'),
];
const keepOps = ['tap capo-up', 'clock data', 'clock settle', 'state chordsMoves'];

/**
 * Whether the web store named holds `text` on disk. A browser Exact ends at
 * its deadline before it writes its store loses what the run kept
 * (`exact/scripts/agent-web.mjs` `close`), which this tells apart from the
 * app not keeping it, as the player's drive does. True on iOS, whose store
 * is the simulator's.
 */
const onDisk = async (name: string, text: string) => {
  if (host !== 'web') return true;
  const cache =
    process.platform === 'darwin'
      ? join(homedir(), 'Library/Caches')
      : (process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'));
  const needle = Buffer.from(text);
  const glob = new Bun.Glob(`*/agent-web-*/${name}/Default/Local Storage/leveldb/*`);
  for await (const path of glob.scan({ cwd: join(cache, 'exact'), absolute: true }))
    if (Buffer.from(await Bun.file(path).arrayBuffer()).includes(needle)) return true;
  return false;
};

const firstOps = [...chordsOn, ...defaultOps, ...largeOps, ...keepOps];
const firstRun = () =>
  drive.run(['--backend', backend, '--storage', store, '--reset-storage'], firstOps);
let first = await firstRun();
if (
  JSON.stringify(first.at(-1)) === JSON.stringify([`${HYMN}:0:1`]) &&
  !(await onDisk(store, `${HYMN}:0:1`))
) {
  console.log(
    `again ${host}: the browser quit before it wrote its store (Exact ended it at its deadline); the first run once more`,
  );
  first = await firstRun();
}
const frame = (id: string, ops: ReadonlyArray<string>, offset: number) =>
  frameOf(first[offset + ops.indexOf(`layout ${id}`)]);

/** Whether `chord` stands over `syllable`: the same left edge within a point, and its bottom at or above the syllable's top. */
const over = (chord: Frame | undefined, syllable: Frame | undefined) =>
  chord !== undefined &&
  syllable !== undefined &&
  Math.abs(chord.x - syllable.x) <= 1 &&
  chord.y + chord.h <= syllable.y + 0.5;

const defaultAt = chordsOn.length;
for (const id of NAMED) {
  const chord = frame(`chord-${id}`, defaultOps, defaultAt);
  const syllable = frame(`syllable-${id}`, defaultOps, defaultAt);
  drive.check(`default size: chord-${id} stands over its syllable`, over(chord, syllable), {
    chord,
    syllable,
  });
}

const largeAt = defaultAt + defaultOps.length;
const misplaced = chorded.flatMap((id) => {
  const chord = frame(`chord-${id}`, largeOps, largeAt);
  const syllable = frame(`syllable-${id}`, largeOps, largeAt);
  return over(chord, syllable) ? [] : [{ id, chord, syllable }];
});
drive.check(
  `largest size: each of the first stanza's ${chorded.length} chords stands over its own syllable`,
  chorded.length > 0 && misplaced.length === 0,
  misplaced,
);

/** The rows a line's pairs were drawn on, as places (word, pair in word), grouped by their top edge. */
const drawnRows = (line: ReadonlyArray<ReadonlyArray<{ id: string }>>) => {
  const placed = line.flatMap((word, w) =>
    word.map((pair, b) => ({
      place: [w, b] as Place,
      frame: frame(`pair-${pair.id}`, largeOps, largeAt),
    })),
  );
  const rows: Array<Array<Place>> = [];
  let top = Number.NaN;
  for (const { place, frame: drawn } of placed) {
    if (drawn === undefined) return undefined;
    if (rows.length === 0 || drawn.y > top + 1) {
      rows.push([]);
      top = drawn.y;
    }
    rows.at(-1)?.push(place);
  }
  return rows;
};

/** The gap the host drew between two words on one row, or the column gap's 0.35 em at the largest size. */
const gapOf = (line: ReadonlyArray<ReadonlyArray<{ id: string }>>) => {
  for (let w = 1; w < line.length; w++) {
    const last = line[w - 1]?.at(-1);
    const next = line[w]?.[0];
    const a = last && frame(`pair-${last.id}`, largeOps, largeAt);
    const b = next && frame(`pair-${next.id}`, largeOps, largeAt);
    if (a && b && Math.abs(a.y - b.y) <= 1) return b.x - (a.x + a.w);
  }
  return LARGEST * 0.35;
};

stanza.forEach((line, i) => {
  const box = frame(`line-1-${i + 1}`, largeOps, largeAt);
  const drawn = drawnRows(line);
  const widths = line.map((word) =>
    word.map((pair) => frame(`pair-${pair.id}`, largeOps, largeAt)?.w ?? 0),
  );
  const gap = gapOf(line);
  const ruledAt = (slack: number) =>
    box === undefined ? undefined : JSON.stringify(breaksOf(widths, box.w + slack, gap));
  const ruled = [ruledAt(-0.5), ruledAt(0.5)];
  drive.check(
    `largest size: line 1-${i + 1} breaks where the line rule says, within half a point of its width (${drawn?.length ?? 0} rows)`,
    drawn !== undefined && ruled.includes(JSON.stringify(drawn)),
    { drawn, ruled, width: box?.w, gap, widths },
  );
});

const kept = first.at(-1);
drive.check('a capo set is kept', JSON.stringify(kept) === JSON.stringify([`${HYMN}:0:1`]), kept);

const again = await drive.run(
  ['--backend', backend, '--storage', store, '--keep-storage'],
  [
    'clock data',
    'state chordsOn',
    'state chordsMoves',
    'tap hymn-list drag 0 -600',
    'clock settle',
    `tap hymn-${HYMN}`,
    'clock settle',
    'clock data',
    'state chordsShown.capo',
    'layout chord-1-1-1',
    shot('relaunched'),
  ],
);
drive.check('relaunch: chords still on', again[1] === true, again[1]);
drive.check(
  'relaunch: the capo kept, the hymn drawn under its chords',
  again[8] === 1 && frameOf(again[9]) !== undefined,
  { capo: again[8], chord: frameOf(again[9]) },
);

process.exit(drive.finish());
