/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noNewPromise, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads its replies and prints what it found; its shots folder is named by SHOTS. */

/**
 * The home list's rail, driven as a reader drives it: a touch at its top
 * takes the list to hymn 1 under its topic, a drag held mid-rail shows the
 * thumb and the bubble (the hymn's number and topic) and takes the list to
 * that hymn, and a release hides them. A heading's tap opens All at once;
 * the heading is its name's text, the row the press, as iOS reads it. The
 * Lists tab, with a favourite in it, keeps the header's room over a row it
 * scrolls to, as the other tabs do.
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
    ...(host === 'ios' ? ['--touch', 'platform'] : []),
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

/** The box a `layout` reply gives its node, in the page's pixels. */
const boxOf = (reply: unknown) =>
  (reply as { node?: { space?: { viewport?: { y: number; h?: number; height?: number } } } })?.node
    ?.space?.viewport;
const bottomOf = (reply: unknown) => {
  const box = boxOf(reply);
  return box === undefined ? Number.NaN : box.y + (box.h ?? box.height ?? 0);
};
const topOf = (reply: unknown) => boxOf(reply)?.y ?? Number.NaN;

/** Sounds and haptics off (the owner's rule before any play), hymn 1 played, then home with the bar docked. */
const QUIET = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'state settingsFeel',
  'tap settings-done',
  'clock settle',
  'tap hymn-1',
  'clock settle',
  'clock data',
];
const PLAY = ['tap play', 'clock data', 'clock +3000 real', 'clock data', 'clock settle'];
const MEASURE = ['layout rail', 'layout find-capsule', 'layout bar', shot('docked')];
const docked = await drive.run(
  [
    ...(process.env.EXACT_PORT ? ['--port', process.env.EXACT_PORT] : []),
    ...['--backend', backend, '--storage', `rail-bar-${runId}`, '--reset-storage'],
  ],
  [
    ...QUIET,
    ...PLAY,
    'back',
    'clock settle',
    'clock data',
    ...MEASURE,
    'tap hymn-1',
    'clock settle',
    'clock data',
    'tap bar-toggle',
    'clock data',
    'clock settle',
    'back',
    'clock settle',
    'clock data',
    ...MEASURE,
  ],
);
const quietAt = QUIET.indexOf('state settingsFeel');
if (docked[quietAt] !== false) {
  drive.check('Sounds and haptics is off before Play', false, docked[quietAt]);
} else {
  for (const [label, at] of [
    ['playing (the seeker’s rise)', QUIET.length + PLAY.length + 3],
    ['paused (at rest)', QUIET.length + PLAY.length + 3 + MEASURE.length + 9],
  ] as const) {
    const railFoot = bottomOf(docked[at]);
    const capsule = topOf(docked[at + 1]);
    const bar = topOf(docked[at + 2]);
    drive.check(
      `with the bar docked ${label}, the rail ends above the find capsule and the bar`,
      railFoot <= capsule && railFoot <= bar,
      { railFoot, capsule, bar },
    );
  }
}

interface Built {
  readonly id: number;
  readonly type?: string;
  readonly props?: {
    readonly testId?: string;
    readonly accessibilityRole?: string;
    readonly accessibilityHint?: string;
  };
  readonly handlers?: ReadonlyArray<string>;
}
const headed = await drive.run(
  ['--storage', `rail-heading-${runId}`, '--reset-storage'],
  ['clock data', 'tree section-adoration-and-praise-row'],
);
const built = ((headed[1] as { nodes?: ReadonlyArray<Built> } | undefined)?.nodes ??
  []) as ReadonlyArray<Built>;
const row = built.find((node) => node.props?.testId === 'section-adoration-and-praise-row');
const name = built.find((node) => node.props?.testId === 'section-adoration-and-praise');
drive.check(
  'a group’s header is a heading VoiceOver can activate, as the current GroupHeader: its name a text with the heading role and the current hint, the row taking the press (on iOS only a text is a heading, never a button)',
  row?.type === 'View' &&
    (row.handlers ?? []).includes('press') &&
    row.props?.accessibilityRole === undefined &&
    name?.type === 'Text' &&
    name.props?.accessibilityRole === 'heading' &&
    name.props?.accessibilityHint === 'Shows every group at once',
  { row, name },
);
const lists = await drive.run(
  ['--storage', `rail-lists-${runId}`, '--reset-storage'],
  [
    'clock data',
    'tap hymn-1',
    'clock settle',
    'clock data',
    'tap favourite',
    'clock settle',
    'clock data',
    'back',
    'clock settle',
    'tap tab-lists',
    'clock settle',
    'clock data',
    'layout hymn-list',
    'layout group-favourites-row',
  ],
);
const padded = (
  lists[12] as { node?: { style?: Record<string, { computed?: string }> } } | undefined
)?.node?.style?.['scroll_padding_top']?.computed;
const pinned = (lists[13] as { node?: { space?: { viewport?: { h?: number } } } } | undefined)?.node
  ?.space?.viewport?.h;
drive.check(
  'the Lists tab keeps a scrolled-to row clear of its pinned header, as Hymns and Topics do (its scroll-padding-top is the header’s height)',
  pinned !== undefined && pinned > 0 && Math.abs(Number.parseFloat(padded ?? '0') - pinned) <= 1,
  { padded, pinned },
);
process.exit(drive.finish());
