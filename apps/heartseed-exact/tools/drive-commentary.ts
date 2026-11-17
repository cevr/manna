/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noTryCatch, effect/noAs, effect/noNewPromise, effect/noUnknownParameters, effect/noUnsafeDictionaryType, node/no-process-env, eslint/no-await-in-loop -- a host script: it starts the commentary's fixture in a process group of its own (a signal to a group already gone is no failure), drives the built app through `bun run exact agent` (`makeDrive`), steers the fixture with JSON between runs, reads the agent's untyped JSON replies by the shapes it asked for, and prints what it found. */

/**
 * The commentary's live checks (the spec's live table), on the host named
 * (`bun tools/drive-commentary.ts web|ios`), against `tools/commentary-fixture.ts`
 * on this checkout's own port; the app's launch names it in
 * `HEARTSEED_PACKS_BASE` (the web's build reads it, the simulator's
 * launch through `SIMCTL_CHILD_`), which also draws the probe on Your
 * verses (`packs-fetch` is the Read tab's first showing). Checks: a
 * first fetch shows the quiet line while the fixture holds its answer, then
 * lands, says so for 3 seconds and goes quiet; a relaunch with the fixture
 * stopped reads the kept pack; a relaunch 8 days on asks once with
 * `If-None-Match` and keeps the pack on a `304`; a new version replaces it;
 * refused, `500`, cut short and a changed character each fail on a fresh
 * store with nothing kept and Try again shown, and the next try lands; a
 * bad update leaves the old counts; a plain launch takes egw.cvr.im and has
 * no probe. `live` as the second argument (iOS, once `hs-bc-api` is
 * deployed) downloads the real pack on a plain launch and prints its
 * version, count and time, no text. Exits 1 on any failed check.
 */

import { join } from 'node:path';
import { makeDrive } from '@manna/exact-kit/drive';

import { gettingLine, landedLine } from '../src/packs/shown';
import { checkoutPort, fixturePacks } from './commentary-fixture';

const FIXTURE_PACKS = await fixturePacks();
/** Loaded after the preload `fixturePacks` loads, as the packs' modules read the text. */
const { COMMENTARY } = await import('../src/commentary/sources');
const { STUDY_PACKS } = await import('../src/study/sources');

const host = process.argv[2] ?? 'web';
const live = process.argv[3] === 'live';
const app = join(import.meta.dir, '..');
const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 16, 12);
const epochAt = (days: number) => new Date(START + days * DAY).toISOString().replace('.000Z', 'Z');
const EVERY_PACK = [COMMENTARY, ...STUDY_PACKS];
const GETTING = gettingLine(EVERY_PACK);
const LANDED = landedLine(EVERY_PACK);

/** A free port from this checkout's own, so two checkouts' drives never meet. */
const freePort = async () => {
  for (let port = checkoutPort(); port < checkoutPort() + 20; port++) {
    const held = await fetch(`http://127.0.0.1:${port}/`)
      .then(() => true)
      .catch(() => false);
    if (!held) return port;
  }
  throw new Error('no free fixture port');
};

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;

type Child = ReturnType<typeof Bun.spawn>;
let server: Child | undefined;

/** Stops the fixture this drive started, by its own process group. */
const stopFixture = async () => {
  const child = server;
  server = undefined;
  if (child === undefined) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  await child.exited;
};
process.on('exit', () => {
  if (server !== undefined)
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
});

/** The fixture, in a process group of its own, once it answers. */
const startFixture = async () => {
  await stopFixture();
  server = Bun.spawn(['bun', join(import.meta.dir, 'commentary-fixture.ts')], {
    cwd: app,
    env: { ...process.env, PORT: `${port}` },
    stdout: 'ignore',
    stderr: 'inherit',
    detached: true,
  });
  for (let tries = 0; tries < 50; tries++) {
    const up = await fetch(`${origin}/fixture/heard`)
      .then((answer) => answer.ok)
      .catch(() => false);
    if (up) return;
    await Bun.sleep(100);
  }
  throw new Error(`the fixture did not answer at ${origin}`);
};

const steer = (mode: Record<string, unknown>) =>
  fetch(`${origin}/fixture`, { method: 'POST', body: JSON.stringify(mode) });

const heard = async (): Promise<Array<{ tag: string }>> =>
  (await fetch(`${origin}/fixture/heard`)).json() as Promise<Array<{ tag: string }>>;

/** A launch names the fixture, or (plain) nothing. */
const nameFixture = (on: boolean) => {
  for (const name of ['HEARTSEED_PACKS_BASE', 'SIMCTL_CHILD_HEARTSEED_PACKS_BASE'])
    if (on) process.env[name] = origin;
    else delete process.env[name];
};

/** The kit's machine, but each run started with this drive's environment as it is then (the fixture named or not). */
const processes = {
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env: { ...process.env },
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
    try {
      process.kill(pid, signal);
    } catch {}
  },
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};

const drive = makeDrive({ name: 'drive-commentary', host, appDir: app, processes });
const webPort = host === 'web' ? ['--port', '8773'] : [];
const stamp = Date.now().toString(36);
const storeOf = (name: string) => `commentary-${host}-${name}-${stamp}`;

interface Shown {
  phase: string;
  version: string;
  line: string;
  foot: string;
  retry: boolean;
}

interface Counts {
  have: boolean;
  verses: Array<{ verse: number; notes: number }>;
}

/** The commentary's line in `packsKept` (`src/packs/step.ts`, `keptWith`). */
const keptLine = (text: unknown) => {
  const line = String(text ?? '')
    .split('\n')
    .find((each) => each.startsWith('commentary '));
  const [, version = '', checkedAt = '0'] = (line ?? '').split(' ');
  return { version, checkedAt: Number(checkedAt) };
};

/** The drive's own reads, each the agent's ops it takes: `shown` is the one status's line and Try again over the commentary's own state; `kept …` the commentary's line of `packsKept`. */
interface DriveRead {
  readonly ops: ReadonlyArray<string>;
  readonly read: (replies: Array<unknown>) => unknown;
}

const READS = {
  shown: {
    ops: ['state packsShown', 'state commentaryShown'],
    read: ([packs, shown]) => {
      const status = packs as { foot?: string; retry?: boolean } | undefined;
      return shown === undefined || shown === null || status === undefined
        ? undefined
        : { ...(shown as object), foot: status.foot, retry: status.retry };
    },
  },
  'kept version': { ops: ['state packsKept'], read: ([text]) => keptLine(text).version },
  'kept checkedAt': { ops: ['state packsKept'], read: ([text]) => keptLine(text).checkedAt },
} satisfies Record<string, DriveRead>;

/** The drive's own read named `op`, or none for an op the agent takes as it is. */
const readNamed = (op: string): DriveRead | undefined =>
  op in READS ? READS[op as keyof typeof READS] : undefined;

/** Runs `ops` on `store` (fresh, or kept from its last run) at day `day`; each op's reply by the op and its nth use. */
const go = async (store: string, kept: boolean, day: number, logical: ReadonlyArray<string>) => {
  const spans: Array<{ readonly at: number; readonly count: number }> = [];
  const ops: Array<string> = [];
  for (const op of logical) {
    const real = readNamed(op)?.ops ?? [op];
    spans.push({ at: ops.length, count: real.length });
    ops.push(...real);
  }
  const flags = [
    '--storage',
    store,
    kept ? '--keep-storage' : '--reset-storage',
    '--url',
    '/verses',
    '--epoch',
    epochAt(day),
    ...webPort,
  ];
  const replies = await drive.run(flags, ops);
  return (op: string, nth = 0): unknown => {
    let seen = -1;
    const span = spans[logical.findIndex((each) => each === op && ++seen === nth)];
    if (span === undefined) return undefined;
    const answered = replies.slice(span.at, span.at + span.count);
    const reader = readNamed(op);
    return reader === undefined ? answered[0] : reader.read(answered);
  };
};

const has = (tree: unknown, id: string) => JSON.stringify(tree ?? '').includes(`"${id}"`);
const shot = (name: string) => `screenshot .exact/shots/commentary-${host}-${name}.png`;
const countsOf = (counts: Counts | undefined) =>
  JSON.stringify(counts?.verses.map(({ verse, notes }) => [verse, notes]) ?? null);
const expectedCounts = (pack: 'first' | 'second') =>
  JSON.stringify(
    (FIXTURE_PACKS[pack].verses['43.1'] ?? []).map(([verse, indexes]) => [verse, indexes.length]),
  );

const first = FIXTURE_PACKS.first;
const second = FIXTURE_PACKS.second;

const fetchOps = ['tap packs-fetch', 'clock data', 'clock settle'];
const readOps = ['shown', 'kept version', 'state commentaryProbeCounts', 'tree'];

/** First fetch: the line while the fixture holds its answer, the landing, the landed line's 3 seconds, one request. */
const firstFetch = async (store: string) => {
  await steer({ pack: 'first', reply: 'well', times: 0, holdMs: 2500 });
  const landing = await go(store, false, 0, [
    'clock data',
    'clock settle',
    'tap packs-fetch',
    'shown',
    'tree',
    shot('getting'),
    'clock data',
    'clock settle',
    'shown',
    'kept version',
    'tree',
    shot('landed'),
    'clock +3100',
    'clock settle',
    'shown',
    'tree',
    'state commentaryProbeCounts',
  ]);
  const getting = landing('shown') as Shown | undefined;
  const landed = landing('shown', 1) as Shown | undefined;
  const quiet = landing('shown', 2) as Shown | undefined;
  drive.check(
    'first fetch: the quiet line shows while the fixture holds its answer',
    getting?.phase === 'fetching' && getting.foot === GETTING && has(landing('tree'), 'packs-line'),
    getting,
  );
  drive.check(
    'first fetch: the pack lands, ready, and the landed line shows',
    landed?.phase === 'ready' &&
      landed.version === first.version &&
      landed.foot === LANDED &&
      landing('kept version') === first.version &&
      has(landing('tree', 1), 'packs-line'),
    { landed, kept: landing('kept version') },
  );
  drive.check(
    "first fetch: the landed line goes after 3 seconds, and the counts are the pack's",
    quiet?.foot === '' &&
      !has(landing('tree', 2), 'packs-line') &&
      countsOf(landing('state commentaryProbeCounts') as Counts) === expectedCounts('first'),
    { quiet, counts: landing('state commentaryProbeCounts') },
  );
  drive.check(
    'first fetch: one request, naming no version',
    JSON.stringify(await heard()) === '[{"tag":""}]',
    await heard(),
  );
};

/** Kept, 304, a bad update and a new version, over the first fetch's store. */
const kept = async (store: string) => {
  await steer({ holdMs: 0 });
  await stopFixture();
  const offline = await go(store, true, 1, ['clock data', 'clock settle', ...fetchOps, ...readOps]);
  const keptShown = offline('shown') as Shown | undefined;
  drive.check(
    "kept: a relaunch with the fixture stopped is ready, and a chapter's counts read",
    keptShown?.phase === 'ready' &&
      keptShown.version === first.version &&
      countsOf(offline('state commentaryProbeCounts') as Counts) === expectedCounts('first'),
    { keptShown, counts: offline('state commentaryProbeCounts') },
  );

  await startFixture();
  const later = await go(store, true, 8, [
    'clock data',
    'clock settle',
    ...fetchOps,
    ...readOps,
    'kept checkedAt',
  ]);
  const week = later('shown') as Shown | undefined;
  const asked = await heard();
  drive.check(
    '304: a relaunch 8 days on asks once, with If-None-Match, and the pack is unchanged',
    asked.length === 1 &&
      asked[0]?.tag === `"${first.version}"` &&
      week?.version === first.version &&
      Number(later('kept checkedAt')) >= START + 8 * DAY &&
      Number(later('kept checkedAt')) < START + 9 * DAY &&
      countsOf(later('state commentaryProbeCounts') as Counts) === expectedCounts('first'),
    { asked, week, checked: later('kept checkedAt') },
  );
};

/** A bad update, then a new version, over the kept store. */
const updates = async (store: string) => {
  await steer({ pack: 'second', reply: 'cut', times: 0 });
  const bad = await go(store, true, 16, ['clock data', 'clock settle', ...fetchOps, ...readOps]);
  const badShown = bad('shown') as Shown | undefined;
  drive.check(
    'a bad update: a cut-short answer keeps the old pack, says nothing, and the old counts read',
    (await heard()).length === 2 &&
      badShown?.phase === 'ready' &&
      badShown.version === first.version &&
      badShown.foot === '' &&
      !has(bad('tree'), 'packs-retry') &&
      countsOf(bad('state commentaryProbeCounts') as Counts) === expectedCounts('first'),
    { badShown, counts: bad('state commentaryProbeCounts') },
  );

  await steer({ pack: 'second', reply: 'well', times: 0 });
  const renewed = await go(store, true, 16, [
    'clock data',
    'clock settle',
    ...fetchOps,
    ...readOps,
  ]);
  const renewedShown = renewed('shown') as Shown | undefined;
  drive.check(
    "a new version: after the check the counts are the new pack's",
    renewedShown?.version === second.version &&
      renewed('kept version') === second.version &&
      countsOf(renewed('state commentaryProbeCounts') as Counts) === expectedCounts('second'),
    { renewedShown, counts: renewed('state commentaryProbeCounts') },
  );
};

/** A `500`, a body cut short, a changed character: each on a fresh store, then Try again. */
const failures = async () => {
  for (const reply of ['fail', 'cut', 'sum'] as const) {
    await steer({ pack: 'first', reply, times: 1, holdMs: 0 });
    const run = await go(storeOf(reply), false, 0, [
      'clock data',
      'clock settle',
      ...fetchOps,
      ...readOps,
      shot(`failed-${reply}`),
      'tap packs-retry',
      'clock data',
      'clock settle',
      'shown',
      'kept version',
    ]);
    const failed = run('shown') as Shown | undefined;
    const retried = run('shown', 1) as Shown | undefined;
    drive.check(
      `${reply}: on a fresh store it fails, nothing is kept, and Try again shows`,
      failed?.phase === 'failed' &&
        failed.retry &&
        failed.foot === '' &&
        run('kept version') === '' &&
        (run('state commentaryProbeCounts') as Counts | undefined)?.have === false &&
        has(run('tree'), 'packs-retry'),
      { failed, kept: run('kept version'), counts: run('state commentaryProbeCounts') },
    );
    drive.check(
      `${reply}: the fixture then answers well and Try again lands it`,
      retried?.phase === 'ready' && run('kept version', 1) === first.version,
      { retried, kept: run('kept version', 1) },
    );
  }
};

/** Refused: the fixture stopped on a fresh store, then up again. */
const refusal = async () => {
  await stopFixture();
  const refusedStore = storeOf('refused');
  const refused = await go(refusedStore, false, 0, [
    'clock data',
    'clock settle',
    ...fetchOps,
    ...readOps,
    'tap packs-retry',
    'clock data',
    'clock settle',
    'shown',
  ]);
  const refusedShown = refused('shown') as Shown | undefined;
  drive.check(
    'refused: with the fixture down it fails, nothing is kept, Try again shows, and Try again while down fails again',
    refusedShown?.phase === 'failed' &&
      refusedShown.retry &&
      refused('kept version') === '' &&
      has(refused('tree'), 'packs-retry') &&
      (refused('shown', 1) as Shown | undefined)?.phase === 'failed',
    { refusedShown, again: refused('shown', 1) },
  );
  await startFixture();
  await steer({ pack: 'first', reply: 'well', times: 0 });
  const back = await go(refusedStore, true, 0, [
    'clock data',
    'clock settle',
    ...fetchOps,
    ...readOps,
  ]);
  drive.check(
    'refused: with the fixture up the next try lands it',
    (back('shown') as Shown | undefined)?.phase === 'ready' &&
      back('kept version') === first.version,
    back('shown'),
  );
};

const fixtureRows = async () => {
  nameFixture(true);
  await startFixture();
  const store = storeOf('kept');
  await firstFetch(store);
  await kept(store);
  await updates(store);
  await failures();
  await refusal();
  await stopFixture();
};

const plainRow = async () => {
  nameFixture(false);
  const plain = await go(storeOf('plain'), false, 0, [
    'clock data',
    'clock settle',
    'state packsPlace',
    'shown',
    'tree',
  ]);
  const place = plain('state packsPlace') as { base?: string; fixture?: boolean } | undefined;
  drive.check(
    'plain launch: the base is egw.cvr.im, and the driver-only button is absent',
    place?.base === 'https://egw.cvr.im' &&
      place.fixture === false &&
      !has(plain('tree'), 'packs-fetch') &&
      (plain('shown') as Shown | undefined)?.phase === 'none',
    { place, shown: plain('shown') },
  );
};

if (live) {
  console.log(
    `SKIP ${host} live: run once hs-bc-api is deployed and the Read tab asks on a plain launch`,
  );
} else {
  await fixtureRows();
  await plainRow();
}
process.exit(drive.finish());
