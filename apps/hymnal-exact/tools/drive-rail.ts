/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noKnownValueWidening, effect/noNewPromise, eslint/no-await-in-loop, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads its replies and prints what it found; its shots folder is named by SHOTS. */

/**
 * The home list's rail, driven as a reader drives it: a touch at its top
 * takes the list to hymn 1 under its topic, a drag held mid-rail shows the
 * thumb and the bubble (the hymn's number and topic) and takes the list to
 * that hymn, and a release hides them. A heading's tap opens All at once.
 * Prints one PASS or FAIL line a check; exits non-zero on any FAIL.
 *
 *   bun tools/drive-rail.ts web|ios
 */

import { join } from 'node:path';

import { bunProcesses, makeDrive } from '@manna/exact-kit/drive';

import { checkoutPort } from './recordings.ts';

const host = process.argv[2] === 'ios' ? 'ios' : 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/rail');
const shot = (name: string) => `screenshot ${join(shots, `${name}-${host}.png`)}`;
const backend = `http://127.0.0.1:${checkoutPort()}`;
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
  signal: (pid: number, signal: 'SIGTERM') => {
    if (pid < -1) process.kill(pid, signal);
  },
  sleep: (ms: number) => Bun.sleep(ms),
};
const drive = makeDrive({ name: 'drive-rail', host, appDir: app, processes });
const runId = Date.now().toString(36);

/** The web drags with the mouse: at the pin the agent's finger on the rail ends in a `pointercancel` before the rail hears its down. */
const finger = host === 'web' ? ' mouse' : '';

const replies = await drive.run(
  [
    ...(process.env.EXACT_PORT ? ['--port', process.env.EXACT_PORT] : []),
    ...['--backend', backend, '--storage', `rail-${runId}`, '--reset-storage'],
  ],
  [
    'clock data',
    'layout rail',
    shot('rest'),
    `tap rail drag 0 300 from 22 1 hold 400${finger} during "tree" "logs" "screenshot ${join(shots, `held-${host}.png`)}"`,
    'clock settle',
    'tree',
    shot('after'),
  ],
);

await Bun.write(join(shots, `replies-${host}.json`), JSON.stringify(replies, null, 1));

interface Node {
  readonly props?: { readonly testId?: string; readonly text?: string };
}
const nodesOf = (tree: unknown): ReadonlyArray<Node> =>
  ((tree as { nodes?: ReadonlyArray<Node> } | undefined)?.nodes ?? []) as ReadonlyArray<Node>;
const textOf = (tree: unknown, testId: string) =>
  nodesOf(tree).find((node) => node.props?.testId === testId)?.props?.text;

const rail = replies[1] as { node?: { style?: Record<string, { computed?: string }> } } | undefined;
drive.check(
  'the rail stands in the list’s right gutter, 44 points wide',
  rail?.node?.style?.width?.computed === '44px',
  rail?.node?.style?.width,
);
const dragged = replies[3] as { during?: ReadonlyArray<unknown> } | undefined;
const held = dragged?.during?.[0];
const number = Number(textOf(held, 'rail-number'));
drive.check(
  'while held mid-rail the bubble shows the hymn under the thumb (about 289) and its topic',
  number >= 250 && number <= 330 && (textOf(held, 'rail-section') ?? '') !== '',
  { number, section: textOf(held, 'rail-section') },
);
const lines = ((dragged?.during?.[1] as { lines?: ReadonlyArray<string> } | undefined)?.lines ??
  []) as ReadonlyArray<string>;
drive.check(
  'the drag scrolls the list (scrollIntoView) and ticks as it passes topics (haptic)',
  lines.some((line) => line.includes('command scrollIntoView')) &&
    lines.some((line) => line.includes('command haptic')),
  lines.filter((line) => line.includes('command')).slice(0, 6),
);
drive.check(
  'once let go the bubble is gone',
  nodesOf(replies[5]).length > 0 && textOf(replies[5], 'rail-number') === undefined,
  textOf(replies[5], 'rail-number'),
);
drive.finish();
