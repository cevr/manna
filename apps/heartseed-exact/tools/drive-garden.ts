/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noUnknownParameters, node/no-process-env, import/no-unassigned-import -- a host script that imports the tests' chapters preload for the oracle it runs, and that drives the built app through `bun run exact agent`, one process group per drive, reads its JSON replies and prints what it found. */

/**
 * The garden's live checks (spec B4 and the drive of B), on the host named
 * (`bun tools/drive-garden.ts web|ios`). The test controls of Your verses
 * exist only in a driver's launch, which a `.test.contract` cannot make, so
 * every run here sets `HEARTSEED_GARDEN_DRIVE` (the web's build reads it,
 * the simulator's launch through `SIMCTL_CHILD_`). A Good recall's stage and
 * due are the current Heartseed's for the same instant (the A2 oracle, run
 * here); `clock +86400000` makes it due; a recall after a peek is kept as
 * Hard and one after Show all moves the verse a stage back; a relaunch with
 * the storage kept reads the same; twenty single verses are held and a
 * twenty-first refused. Screenshots go to `.exact/shots/garden-<host>-*`.
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import './setup';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const DRIVE_MS = 20 * 60 * 1000;
const DAY = 86_400_000;

/** Chrome keeps a named store per port, so every web launch here, the relaunch too, takes one of the app's spare ports. */
const port = host === 'web' ? ['--port', '8774'] : [];

const run = async (flags: readonly string[], ops: readonly string[]) => {
  const child = Bun.spawn(
    ['bun', 'run', 'exact', 'agent', host, '--json', ...port, ...flags, ...ops],
    {
      cwd: app,
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
      env: {
        ...process.env,
        HEARTSEED_GARDEN_DRIVE: '1',
        SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE: '1',
      },
    },
  );
  const timer = setTimeout(() => process.kill(-child.pid, 'SIGTERM'), DRIVE_MS);
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  const replies = out
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('{') ||
        line.startsWith('[') ||
        line === 'null' ||
        line.startsWith('"') ||
        /^[-\d]|^true$|^false$/u.test(line),
    )
    .map((line) => JSON.parse(line));
  if (code !== 0 || replies.length < ops.length)
    throw new Error(
      `agent ${host} exited ${code} with ${replies.length} of ${ops.length} replies\n${err.slice(-2000)}`,
    );
  return replies.slice(-ops.length);
};

/** Runs `ops` and answers each `state` op's reply by its op. */
const drive = async (flags: readonly string[], ops: readonly string[]) => {
  const replies = await run(flags, ops);
  return (op: string, nth = 0) => {
    let seen = -1;
    const index = ops.findIndex((each) => each === op && ++seen === nth);
    return replies[index];
  };
};

let failed = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${host} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`);
};

const shot = (name: string) => `screenshot .exact/shots/garden-${host}-${name}.png`;
const store = `garden-${host}-${Date.now().toString(36)}`;
const RANK = ['seed', 'blade', 'ear', 'full corn'];

interface Verse {
  readonly reference: string;
  readonly stage: string;
  readonly recalls: number;
  readonly lastGrade: number;
  readonly due: number;
  readonly dueNow: boolean;
}

const grown = [
  'clock data',
  'clock settle',
  'state gardenTime',
  'tap plant-three',
  'clock data',
  shot('planted'),
  'tap good-John-3-16',
  'clock data',
  'state gardenRecalled',
  shot('good'),
  `clock +${DAY}`,
  'clock data',
  'state garden',
  'tap peeked-John-3-17',
  'clock data',
  'state gardenRecalled',
  ...[1, 2, 3, 4, 5].flatMap(() => [
    'tap good-John-3-18',
    'clock data',
    'state gardenRecalled',
    `clock +${4 * DAY}`,
    'clock data',
  ]),
  'tap shown-John-3-18',
  'clock data',
  'state gardenRecalled',
  shot('shown'),
  'state garden',
];
const first = await drive(['--storage', store, '--reset-storage', '--url', '/verses'], grown);

const time: { epochAtZero: number; utcOffset: number } = first('state gardenTime');
const good: { answer: string; verse: Verse } = first('state gardenRecalled', 0);
const { makeOracle } = await import('../src/test/garden-model');
const { verseIn } = await import('../src/garden/view');
const oracle = await makeOracle();
const at = time.epochAtZero;
await oracle.run({ _tag: 'plant', range: { book: 43, chapter: 3, first: 16, last: 18 } }, at);
await oracle.run(
  {
    _tag: 'recall',
    reference: 'John 3:16',
    recall: {
      startedAt: at,
      offset: time.utcOffset,
      grade: 3,
      suggested: 3,
      words: 10,
      missed: 0,
      peeked: 0,
      extra: 0,
    },
    help: { peeked: [], shownAt: null, cap: 4 },
  },
  at,
);
const expected = verseIn((await oracle.held(at)).garden, 'John 3:16', {
  now: at,
  offset: time.utcOffset,
});
check(
  'B4 a Good recall grows the plant and sets its day as the current app does',
  good.answer === 'Kept' &&
    good.verse.stage === expected.stage &&
    good.verse.due === expected.due &&
    good.verse.lastGrade === 3,
  { got: good.verse, expected },
);

const day: { lists: { verses: Verse[] }[] } = first('state garden');
const later = day.lists[0]?.verses.find((verse) => verse.reference === 'John 3:16');
check('B4 clock +86400000 makes it due', later?.dueNow === true, later);

const peeked: { verse: Verse } = first('state gardenRecalled', 1);
check('a recall after a peek is kept as Hard', peeked.verse.lastGrade === 2, peeked.verse);

const before: { verse: Verse } = first('state gardenRecalled', 6);
const shown: { verse: Verse } = first('state gardenRecalled', 7);
const landing = RANK[Math.max(0, RANK.indexOf(before.verse.stage) - 1)];
check(
  'a recall after Show all leaves the verse a stage back',
  before.verse.stage !== 'seed' && shown.verse.stage === landing,
  { before: before.verse, shown: shown.verse },
);

const keptRead: { lists: { verses: Verse[] }[] } = first('state garden', 1);
const kept = keptRead.lists.flatMap((list) =>
  list.verses.map(({ reference, stage, recalls, due }) => ({ reference, stage, recalls, due })),
);
const relaunched = await drive(
  ['--storage', store, '--keep-storage', '--url', '/verses'],
  ['clock data', 'clock settle', 'state garden', shot('relaunched')],
);
const againRead: { lists: { verses: Verse[] }[] } = relaunched('state garden');
const again = againRead.lists.flatMap((list) =>
  list.verses.map(({ reference, stage, recalls, due }) => ({ reference, stage, recalls, due })),
);
check(
  'a relaunch with the storage kept reads the same verses, stages and days',
  JSON.stringify(again) === JSON.stringify(kept),
  { kept, again },
);

const sown = await drive(
  ['--storage', `${store}-singles`, '--reset-storage', '--url', '/verses'],
  [
    'clock data',
    'clock settle',
    ...Array.from({ length: 20 }, () => ['tap plant-one', 'clock data']).flat(),
    'state garden.singles',
    'tap plant-one',
    'clock data',
    'state gardenPlanted',
    'state garden.limitLine',
    shot('singles-full'),
  ],
);
const singles: Verse[] = sown('state garden.singles');
check('twenty single verses are held', singles.length === 20, singles.length);
const refused: { answer: string } = sown('state gardenPlanted');
check('a twenty-first is refused', refused.answer === 'Full', refused);
check(
  'the single verses’ limit line shows',
  sown('state garden.limitLine') ===
    '20 single verses, the most for now. Remove one to add another.',
  sown('state garden.limitLine'),
);

console.log(
  failed === 0 ? `drive-garden ${host}: all passed` : `drive-garden ${host}: ${failed} failed`,
);
process.exit(failed === 0 ? 0 : 1);
