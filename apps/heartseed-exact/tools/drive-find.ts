/* oxlint-disable effect/noNodeBuiltinImport, effect/noUnknownParameters, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noAs, effect/noTernary, node/no-process-env -- a host script that drives the built app through `bun run exact agent`, reads its JSON replies as the shapes the app answers, and prints what it found. */

/**
 * Find's live checks and its speed budget (spec: Live, and The speed
 * budget), on the host named (`bun tools/drive-find.ts web|ios`). Find's
 * field is drawn on Your verses under a driver's launch alone, so every
 * launch sets `HEARTSEED_GARDEN_DRIVE` (and `find.test.contract` holds a
 * plain launch to drawing none). The app bundles no word index (q126):
 * the drive writes the pack from `bible.db` (`tools/find.ts`), checks it
 * is the pack of the app's own text, and serves it on the loopback port
 * `app.ts` grants, which `HEARTSEED_FIND_PACK` names to the launch:
 *
 * - "fear not" finds the verses `findRead` finds here, in the source, the
 *   first row named by its reference, and its press hands its place; a
 *   reference ("john 3:16") answers its place first; a word the Bible
 *   lacks says the line; Clear leaves no rows;
 * - on the simulator's wall clock (`--live`), the fixed queries
 *   (`src/find/fixed.ts`) typed a character at a time, each keystroke's
 *   answer timed by the app itself (`findTimes`: `performanceNow()` from
 *   the keystroke to the answer's commit): the first after launch, the
 *   median and the worst against their bars, one `PASS`/`FAIL` line each.
 *   The web's drive has no wall clock, so `web` times the source in Bun
 *   instead, for comparison;
 * - the data module's load as Exact prints it (`the module's top level
 *   took N ms`), against `FIND_BEFORE`, the same number from a launch
 *   without the index, when given;
 * - a last launch the server refuses the pack, as a phone that has not
 *   downloaded it: a reference still answers, and words say
 *   `DOWNLOADING_LINE`.
 *
 * Screenshots go to `.exact/shots/find-<host>-*`. Exits 1 on any failed
 * check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { FIXED } from '../src/find/fixed';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
/** The loopback port `app.ts` grants a driver's launch for the pack. */
const PORT = 4797;
const origin = `http://127.0.0.1:${PORT}`;
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const self = Bun.spawn(
    ['bun', '--preload', join(import.meta.dir, 'setup.ts'), import.meta.path, host],
    {
      stdout: 'inherit',
      stderr: 'inherit',
      env: {
        ...process.env,
        HEARTSEED_GARDEN_DRIVE: '1',
        SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE: '1',
        HEARTSEED_FIND_PACK: origin,
        SIMCTL_CHILD_HEARTSEED_FIND_PACK: origin,
      },
    },
  );
  process.exit(await self.exited);
}

const { corpusOfDb, findPack, FIND_OUT, writeFind } = await import('./find');
writeFind(FIND_OUT, corpusOfDb());
const served = await Bun.file(FIND_OUT).text();
const CORS = { 'access-control-allow-origin': '*' };
/** Whether the server hands the pack; the last launch is refused it, as a phone that has not downloaded it yet. */
let serving = true;
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  fetch: (request) =>
    serving && new URL(request.url).pathname === '/find.json'
      ? new Response(served, { headers: { ...CORS, 'content-type': 'application/json' } })
      : new Response('not found', { status: 404, headers: CORS }),
});
const drive = makeDrive({ name: 'drive-find', host, appDir: app });
const store = `find-${host}-${Date.now().toString(36)}`;
const shot = (name: string) => `screenshot .exact/shots/find-${host}-${name}.png`;

/** The bars, in ms (spec: The speed budget). */
const FIRST_BAR = 150;
const MEDIAN_BAR = 16;
const WORST_BAR = 50;
const LOAD_BAR = 15;

interface Shown {
  readonly query?: string;
  readonly places?: ReadonlyArray<{ readonly label: string }>;
  readonly hits?: ReadonlyArray<{ readonly reference: string }>;
  readonly more?: number;
  readonly line?: string;
}

/** The reply to the `n`th (from 0) `op` of `ops`. */
const replyOf =
  (ops: ReadonlyArray<string>, replies: ReadonlyArray<unknown>) =>
  (op: string, n = 0) =>
    replies[ops.map((each, at) => (each === op ? at : -1)).filter((at) => at >= 0)[n] ?? -1];

/** Whether a whole `tree` reply holds a node of `testId`. */
const holds = (reply: unknown, testId: string) =>
  JSON.stringify(reply ?? null).includes(`"testId":"${testId}"`);

/** The data module's load, from a `logs` reply; NaN when Exact printed none (it prints it above 50 ms). */
const loadOf = (reply: unknown) => {
  const took = /top level took (\d+) ms/u.exec(JSON.stringify(reply ?? ''));
  return took === null ? Number.NaN : Number(took[1]);
};

const { findWith } = await import('../src/find/find');
const { findIndexOf } = await import('../src/find/index');
const source = findWith(findIndexOf(JSON.parse(served)));
drive.check(
  "the pack built from bible.db is the pack of the app's own text, word for word",
  served === JSON.stringify(findPack()),
  { bytes: served.length },
);
const fearHere = source('fear not', 50);
const first = fearHere.hits[0];
const firstRow =
  first === undefined ? 'find-hit-none' : `find-hit-${first.book}-${first.chapter}-${first.verse}`;
const typedFear = (text: string) => `type find-field ${JSON.stringify(text)}`;

const live = [
  'clock data',
  'clock settle',
  'logs',
  typedFear('fear not'),
  'clock data',
  'clock settle',
  'state findShown',
  'tree',
  shot('fear-not'),
  `tap ${firstRow}`,
  'clock settle',
  'state findOpened',
  typedFear('john 3:16'),
  'clock data',
  'clock settle',
  'state findShown',
  'tree',
  shot('place'),
  'tap find-place',
  'clock settle',
  'state findOpened',
  typedFear('xylophone'),
  'clock data',
  'clock settle',
  'state findShown',
  'tree',
  'tap find-clear',
  'clock data',
  'clock settle',
  'state findQuery',
  'tree',
];
const said = replyOf(
  live,
  await drive.run(['--storage', store, '--reset-storage', '--url', '/verses'], live),
);
const load = loadOf(said('logs'));

const fear = said('state findShown', 0) as Shown | undefined;
drive.check(
  '"fear not" finds what the source finds, the first row named by its reference',
  first !== undefined &&
    JSON.stringify(fear?.hits?.map((hit) => hit.reference)) ===
      JSON.stringify(fearHere.hits.map((hit) => hit.reference)) &&
    fear?.more === fearHere.more &&
    holds(said('tree', 0), firstRow),
  { app: fear?.hits?.slice(0, 3), more: fear?.more, source: fearHere.hits.slice(0, 3) },
);
drive.check(
  "a row's press hands its book, chapter and verse",
  first !== undefined &&
    said('state findOpened', 0) === `${first.book} ${first.chapter} ${first.verse}`,
  said('state findOpened', 0),
);
const place = said('state findShown', 1) as Shown | undefined;
drive.check(
  'a reference answers its place first',
  place?.places?.[0]?.label === 'John 3:16' && holds(said('tree', 1), 'find-place'),
  place?.places,
);
drive.check(
  'the place row hands its place',
  said('state findOpened', 1) === '43 3 16',
  said('state findOpened', 1),
);
const none = said('state findShown', 2) as Shown | undefined;
drive.check(
  'a word the Bible lacks says the line, and no row',
  none?.line === 'No verse has those words.' &&
    holds(said('tree', 2), 'find-line') &&
    !holds(said('tree', 2), 'find-place'),
  none,
);
drive.check(
  'Clear leaves no rows',
  said('state findQuery') === '' && !holds(said('tree', 3), 'find-results'),
  said('state findQuery'),
);

const keystrokes = FIXED.flatMap((query) =>
  Array.from({ length: query.length }, (_, at) => query.slice(0, at + 1)),
);
/** The answers' times on the simulator's wall clock (`--live`), each keystroke given `KEY_WAIT` ms to answer; on the web, which has no wall-clock drive, the source's own in Bun, for comparison. */
const KEY_WAIT = 150;
const timedOnSimulator = async () => {
  const timed = [
    'perf frames live 2000',
    ...keystrokes.flatMap((query) => [typedFear(query), `perf frames live ${KEY_WAIT}`]),
    'perf frames live 1000',
    'state findTimes',
    'state findTimedQueries',
  ];
  const timedSaid = replyOf(
    timed,
    await drive.run(
      ['--live', '--storage', `${store}-timed`, '--reset-storage', '--url', '/verses'],
      timed,
    ),
  );
  return {
    times: (timedSaid('state findTimes') as ReadonlyArray<number> | undefined) ?? [],
    queries: (timedSaid('state findTimedQueries') as ReadonlyArray<string> | undefined) ?? [],
  };
};
const timedInBun = () => {
  const cold = findWith(findIndexOf(findPack()));
  return {
    times: keystrokes.map((query) => {
      const start = performance.now();
      cold(query, 50);
      return performance.now() - start;
    }),
    queries: keystrokes,
  };
};
const { times, queries } = host === 'ios' ? await timedOnSimulator() : timedInBun();
const slowest = times
  .map((time, at) => [time, queries[at] ?? ''] as const)
  .sort((a, b) => b[0] - a[0])
  .slice(0, 10);
console.log(
  `slowest ${host}: ${slowest.map(([time, query]) => `${JSON.stringify(query)} ${time.toFixed(1)}`).join(', ')}`,
);
const unanswered = keystrokes.filter((query) => !queries.includes(query));
if (host !== 'ios')
  console.log(
    'times web: the web drive has no wall clock (`--live` is Apple only): the source in Bun, keystroke by keystroke',
  );
const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
const worst = sorted.at(-1) ?? Number.NaN;
const firstTime = times[0] ?? Number.NaN;
const worstAt = queries[times.indexOf(worst)] ?? '';
console.log(
  `times ${host}: ${times.length} answers of ${keystrokes.length} keystrokes; first ${firstTime.toFixed(1)} ms, median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms (${JSON.stringify(worstAt)}); ${Number.isNaN(load) ? 'the data module loaded in under 50 ms (Exact prints no time below it)' : `the data module loaded in ${load} ms`}`,
);
drive.check(
  `every keystroke answered (${times.length} of ${keystrokes.length})`,
  unanswered.length === 0,
  unanswered,
);
drive.check(
  `the first query after launch, under ${FIRST_BAR} ms`,
  firstTime < FIRST_BAR,
  firstTime,
);
drive.check(`a keystroke's answer, median under ${MEDIAN_BAR} ms`, median < MEDIAN_BAR, median);
drive.check(`a keystroke's answer, worst under ${WORST_BAR} ms`, worst < WORST_BAR, {
  worst,
  query: worstAt,
});
const before = Number(process.env.FIND_BEFORE ?? Number.NaN);
if (!Number.isNaN(before))
  drive.check(
    `the data module's load, at most ${LOAD_BAR} ms more than ${before} ms without the index`,
    load - before <= LOAD_BAR,
    load,
  );

serving = false;
const unpacked = [
  'clock data',
  'clock settle',
  typedFear('john 3:16'),
  'clock data',
  'clock settle',
  'state findShown',
  typedFear('fear not'),
  'clock data',
  'clock settle',
  'state findShown',
  'tree',
  shot('downloading'),
];
const unpackedSaid = replyOf(
  unpacked,
  await drive.run(
    ['--storage', `${store}-unpacked`, '--reset-storage', '--url', '/verses'],
    unpacked,
  ),
);
const { DOWNLOADING_LINE } = await import('../src/find/find');
const johnUnpacked = unpackedSaid('state findShown', 0) as Shown | undefined;
const fearUnpacked = unpackedSaid('state findShown', 1) as Shown | undefined;
drive.check(
  'with no pack, a reference still answers its place, and words say word search is downloading',
  johnUnpacked?.places?.[0]?.label === 'John 3:16' &&
    johnUnpacked.line === DOWNLOADING_LINE &&
    fearUnpacked?.hits?.length === 0 &&
    fearUnpacked.line === DOWNLOADING_LINE &&
    holds(unpackedSaid('tree'), 'find-line'),
  { john: johnUnpacked, fear: fearUnpacked },
);

await server.stop(true);
process.exit(drive.finish());
