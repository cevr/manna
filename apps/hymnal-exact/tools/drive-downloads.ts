/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noNewPromise, node/no-process-env -- a host script that drives the built app through `bun run exact agent`, its recordings named in the agent's environment, and reads its untyped JSON replies by the fields it checks. */

/**
 * Downloads' live checks a `.test.contract` cannot hold: what the screen
 * reader is told, at the largest text and under Reduce Motion. Through
 * `@manna/exact-kit/drive` on the host named (`bun tools/drive-downloads.ts
 * web|ios`), in Settings against the recordings' fixture:
 *
 * - the progress is the platform's progress bar named "Downloaded
 *   printed-key recordings", its value One's words ("0 of 695 recordings"),
 *   and the leaf's rows are buttons named in One's words (`tree --ax`);
 * - at the largest text, Download all recordings is reached and taken, and
 *   the saves start: Cancel download and the active line show, and the bar
 *   says a count above none;
 * - under Reduce Motion, Delete downloads asks first, Keep downloads keeps
 *   them, and Confirm delete downloads empties the store.
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { bunProcesses, makeDrive } from '@manna/exact-kit/drive';
import * as words from '@manna/hymnal-app/offline/words';

import { checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
/** The agent's server is the recordings' fixture on this checkout's own port (`--backend`), and the app takes its recordings there, so no save asks the bucket. */
const backend = `http://127.0.0.1:${checkoutPort()}`;
/** The kit's machine, the app's recordings named to it, signalling only a run's own process group when it overruns. */
const processes = {
  ...bunProcesses,
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env: { ...process.env, HYMNAL_RECORDINGS: backend },
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
  list: () => [],
  signal: (pid: number, signal: 'SIGTERM') => {
    if (pid < -1) process.kill(pid, signal);
  },
};
const drive = makeDrive({
  name: 'drive-downloads',
  host,
  appDir: join(import.meta.dir, '..'),
  processes,
});
const LARGEST = 53;

interface AxElement {
  readonly role?: string;
  readonly name?: string;
  readonly value?: string;
  readonly testId?: string;
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

/** The element of `testId` in a `tree --ax` reply. */
const byId = (reply: unknown, testId: string) =>
  elementsOf(reply).find((element) => element.testId === testId);

/** Whether a `tree` reply holds a node of `testId`. */
const holds = (reply: unknown, testId: string) =>
  JSON.stringify(reply ?? '').includes(`"${testId}"`);

const ops: Array<string> = [];
const step = (...each: ReadonlyArray<string>) => {
  ops.push(...each);
  return ops.length - 1;
};

step('clock data', 'tap gear', 'clock settle', 'clock data', 'tap settings-feel', 'clock settle');
const axAt = step('tree --ax downloads');
step(`prefer root-font-size ${LARGEST}`, 'clock settle');
const allAt = step('tap downloads-all');
step('clock data', 'clock +1500 real', 'clock data');
const busyAt = step('tree downloads');
const printedAt = step('state downloads.printed');
step('tap downloads-cancel', 'clock data', 'clock settle');
step('prefer prefers-reduced-motion reduce', 'clock settle');
step('tap downloads-delete', 'clock settle');
const askedAt = step('tree downloads');
step('tap downloads-keep', 'clock settle');
const keptAt = step('tree downloads');
const keptPrinted = step('state downloads.printed');
step('tap downloads-delete', 'clock settle', 'tap downloads-confirm', 'clock data');
step('clock +1000 real', 'clock data');
const emptyAt = step('state downloads.saved');

const replies = await drive.run(
  [
    '--backend',
    backend,
    '--storage',
    `downloads-${host}-${Date.now().toString(36)}`,
    '--reset-storage',
  ],
  ops,
);

const progress = byId(replies[axAt], 'downloads-progress');
drive.check(
  'the progress is a progress bar named in One’s words, its value One’s count',
  progress !== undefined &&
    /progress/iu.test(progress.role ?? '') &&
    progress.name === words.PROGRESS_LABEL &&
    progress.value === words.progressText({ printed: 0 }),
  progress,
);
for (const [id, name] of [
  ['downloads-all', words.DOWNLOAD_ALL],
  ['downloads-delete', words.DELETE],
] as const) {
  const element = byId(replies[axAt], id);
  drive.check(
    `${id} is a button named “${name}”`,
    element !== undefined && /button/iu.test(element.role ?? '') && element.name === name,
    element,
  );
}
drive.check(
  'at the largest text, Download all recordings is reached and taken',
  replies[allAt] !== undefined,
  replies[allAt],
);
drive.check(
  'the saves start: Cancel download and the active line show, and the bar counts some',
  holds(replies[busyAt], 'downloads-cancel') &&
    holds(replies[busyAt], 'downloads-active') &&
    Number(replies[printedAt]) >= 1,
  replies[printedAt],
);
drive.check(
  'under Reduce Motion, Delete downloads asks first',
  holds(replies[askedAt], 'downloads-confirm') && holds(replies[askedAt], 'downloads-keep'),
  replies[askedAt],
);
drive.check(
  'Keep downloads keeps them',
  !holds(replies[keptAt], 'downloads-confirm') && Number(replies[keptPrinted]) >= 1,
  replies[keptPrinted],
);
drive.check('Confirm delete downloads empties the store', replies[emptyAt] === 0, replies[emptyAt]);

process.exit(drive.finish());
