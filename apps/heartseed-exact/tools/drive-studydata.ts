/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noTryCatch, effect/noAs, effect/noNewPromise, node/no-process-env, eslint/no-await-in-loop -- a host script: it starts the packs' fixture in a process group of its own (a signal to a group already gone is no failure), drives the built app through `bun run exact agent` (`makeDrive`), reads the agent's untyped JSON replies by the shapes it asked for, and prints what it found. */

/**
 * The study packs' live checks (`bun tools/drive-studydata.ts web|ios`):
 * the app launched naming `tools/commentary-fixture.ts` (which serves the
 * study packs built from the assets `bible.db` is built from, and find's
 * word index) fetches every pack through the one downloader, and then the
 * fixture launch's probes (`features/studydata.contract`) read: John 3:16's
 * 6 cross-references, its words one per shown word with G25 fourth, G25's
 * entry found, Psalm 119:176 and Revelation 22:21 answering, a verse
 * outside the canon empty, and find answering "fear not" from the
 * downloaded index; a relaunch with the fixture stopped reads the same.
 * Prints the fetch's wall time. Exits 1 on any failed check.
 */

import { loadavg } from 'node:os';
import { join } from 'node:path';
import { makeDrive } from '@manna/exact-kit/drive';

import { checkoutPort } from './commentary-fixture';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');

const freePort = async () => {
  for (let port = checkoutPort() + 20; port < checkoutPort() + 40; port++) {
    const held = await fetch(`http://127.0.0.1:${port}/`)
      .then(() => true)
      .catch(() => false);
    if (!held) return port;
  }
  throw new Error('no free fixture port');
};

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;

let server: ReturnType<typeof Bun.spawn> | undefined;

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

const startFixture = async () => {
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

for (const name of ['HEARTSEED_PACKS_BASE', 'SIMCTL_CHILD_HEARTSEED_PACKS_BASE'])
  process.env[name] = origin;

/** The kit's machine, but each run started with this drive's environment, which names the fixture. */
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

const drive = makeDrive({ name: 'drive-studydata', host, appDir: app, processes });
const webPort = host === 'web' ? ['--port', '8773'] : [];
const store = `studydata-${host}-${Date.now().toString(36)}`;

const PROBES = [
  'logs',
  'state studyXrefsShown',
  'state studyTagsShown',
  'state studyLexiconShown',
  'state studyWordsShown',
  'state studyProbeXrefs',
  'state studyProbeWords',
  'state studyProbeEntry',
  'state studyProbeLongest',
  'state studyProbeLast',
  'state studyProbeOutside',
  'state studyProbeCounts',
  'tap tab-read',
  'clock data',
  'clock settle',
  'tap chapter-find',
  'clock data',
  'clock settle',
  'type goto-find "fear not"',
  'clock data',
  'clock settle',
  'state findShown',
] as const;

/** The probes' replies, read by the shapes `features/studydata.contract` and `features/find.contract` answer. */
interface Replies {
  readonly phase?: string;
  readonly have?: boolean;
  readonly refs?: ReadonlyArray<{ readonly reference: string; readonly text: string }>;
  readonly words?: ReadonlyArray<{
    readonly text: string;
    readonly numbers: ReadonlyArray<string>;
  }>;
  readonly found?: boolean;
  readonly language?: string;
  readonly lemma?: string;
  readonly total?: number;
  readonly renders?: ReadonlyArray<unknown>;
  readonly xrefsHave?: boolean;
  readonly wordsHave?: boolean;
  readonly verses?: ReadonlyArray<{
    readonly verse: number;
    readonly xrefs: number;
    readonly words: number;
  }>;
  readonly hits?: ReadonlyArray<unknown>;
  readonly line?: string;
}

/** Runs the probes on the store, fresh or kept; each reply by its op. */
const go = async (kept: boolean, before: ReadonlyArray<string>) => {
  const ops = [...before, ...PROBES];
  const replies = await drive.run(
    [
      '--storage',
      store,
      kept ? '--keep-storage' : '--reset-storage',
      '--url',
      '/verses',
      ...webPort,
    ],
    ops,
  );
  const took = /top level took (\d+) ms/u.exec(JSON.stringify(replies[ops.indexOf('logs')] ?? ''));
  console.log(
    `study ${kept ? 'kept' : 'fresh'} launch: the data module's top level took ${took?.[1] ?? '?'} ms`,
  );
  return (op: string): Replies => (replies[ops.lastIndexOf(op)] ?? {}) as Replies;
};

/** The checks over one run's probes, named by `when`. */
const checks = (when: string, read: (op: string) => Replies) => {
  const phases = ['Xrefs', 'Tags', 'Lexicon', 'Words'].map(
    (name) => read(`state study${name}Shown`).phase,
  );
  drive.check(
    `${when}: every study pack is ready`,
    phases.every((phase) => phase === 'ready'),
    phases,
  );
  verseChecks(when, read);
  readChecks(when, read);
};

/** John 3:16's cross-references and words. */
const verseChecks = (when: string, read: (op: string) => Replies) => {
  const xrefs = read('state studyProbeXrefs');
  drive.check(
    `${when}: John 3:16 has 6 cross-references, each with its words`,
    xrefs.have === true && xrefs.refs?.length === 6 && xrefs.refs.every((ref) => ref.text !== ''),
    xrefs.refs?.map((ref) => ref.reference),
  );
  const shown = read('state studyProbeWords');
  const words = shown.words ?? [];
  drive.check(
    `${when}: John 3:16's words, one per shown word, the fourth G25`,
    shown.have === true && words.length === 25 && words[3]?.numbers.includes('G25') === true,
    words.slice(0, 5).map((word) => word.numbers),
  );
};

/** G25's entry, the canon's edges, John 3's counts and find. */
const readChecks = (when: string, read: (op: string) => Replies) => {
  const entry = read('state studyProbeEntry');
  drive.check(
    `${when}: G25 is found, Greek, with its renderings`,
    entry.found === true && entry.language === 'Greek' && (entry.renders?.length ?? 0) > 0,
    { lemma: entry.lemma, total: entry.total },
  );
  drive.check(
    `${when}: Psalm 119:176 and Revelation 22:21 answer, outside the canon is empty`,
    (read('state studyProbeLongest').words?.length ?? 0) > 0 &&
      read('state studyProbeLast').have === true &&
      read('state studyProbeOutside').refs?.length === 0,
    read('state studyProbeOutside'),
  );
  const counts = read('state studyProbeCounts');
  drive.check(
    `${when}: John 3's counts read both packs`,
    counts.xrefsHave === true && counts.wordsHave === true && counts.verses?.[15]?.xrefs === 6,
    counts.verses?.[15],
  );
  const find = read('state findShown');
  drive.check(
    `${when}: find answers "fear not" from the downloaded index`,
    (find.hits?.length ?? 0) > 0 && find.line === '',
    { hits: find.hits?.length, line: find.line },
  );
};

/** The turn probes `features/studydata.contract` declares, each one step of a pack's check 40 times in one turn. */
const TURNS = [
  'CommentaryParse',
  'XrefsParse',
  'TagsParse',
  'LexiconParse',
  'WordsParse',
  'WordsWrite',
  'TagsDecode',
  'TagsEncode',
  'TagsSlice',
  'WordsDecode',
  'WordsEncode',
] as const;

/** How many times a probe does its step in its one turn. */
const TIMES = 40;

/**
 * `ios turns`: the packs fetched on a launch that names
 * `HEARTSEED_TURN_PROBE`, then each probe's turn as the data host judged
 * it: refused, with its own CPU time in the refusal's words (a step's
 * cost is that over `TIMES`), or let pass (the step costs under
 * 100 ms / `TIMES`).
 */
const turns = async () => {
  for (const name of ['HEARTSEED_TURN_PROBE', 'SIMCTL_CHILD_HEARTSEED_TURN_PROBE'])
    process.env[name] = '1';
  const settle = ['clock +1500', 'clock data', 'clock settle'];
  const ops = [
    'clock data',
    'clock settle',
    'tap packs-fetch',
    'clock data',
    'clock settle',
    ...settle,
    ...settle,
    ...settle,
    'logs',
    ...TURNS.map((name) => `state studyTurn${name}`),
  ];
  const replies = await drive.run(
    ['--storage', store, '--reset-storage', '--url', '/verses', ...webPort],
    ops,
  );
  const lines = JSON.stringify(replies[ops.indexOf('logs')] ?? '')
    .split('","')
    .filter((line) => line.includes('studyTurn') && line.includes('ms of its own'));
  for (const name of TURNS) {
    const own = lines
      .filter((line) => line.includes(`(studyTurn${name})`) || line.includes(`"studyTurn${name}"`))
      .flatMap((line) =>
        [...line.matchAll(/took ([\d.]+) ms of its own/gu)].map((m) => Number(m[1])),
      );
    const passed = (replies[ops.indexOf(`state studyTurn${name}`)] as { times?: number } | null)
      ?.times;
    const step =
      own.length > 0
        ? `${(Math.min(...own) / TIMES).toFixed(2)} ms a step (refused at ${own.map((ms) => ms.toFixed(1)).join(', ')} ms for ${TIMES})`
        : passed === TIMES
          ? `under ${(100 / TIMES).toFixed(2)} ms a step (${TIMES} in one turn let pass)`
          : `not measured (${JSON.stringify(passed)})`;
    console.log(`turn ${name}: ${step}`);
    drive.check(`turn ${name} measured`, own.length > 0 || passed === TIMES, step);
  }
};

await startFixture();
if (process.argv[3] === 'turns') {
  await turns();
  await stopFixture();
  process.exit(drive.finish());
}
const started = performance.now();
const fetched = await go(false, [
  'clock data',
  'clock settle',
  'tap packs-fetch',
  'clock data',
  'clock settle',
]);
const [load = 0] = loadavg();
console.log(
  `study fetch and probes: ${Math.round(performance.now() - started)} ms, load ${load.toFixed(1)}`,
);
checks('fetched', fetched);
await stopFixture();
checks('kept, the fixture stopped', await go(true, ['clock data', 'clock settle']));
process.exit(drive.finish());
