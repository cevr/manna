/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noNewPromise, eslint/no-await-in-loop, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads the colours its layout replies and screenshots show and prints what it found; its shots folder is named by SHOTS. */

/**
 * Settings' live colour checks (spec B2, B3), which a `.test.contract`
 * cannot hold at Exact's pin: an authored test reads text, state and the
 * tree, never a colour. Here the agent's `layout` names the colour each
 * text is drawn in, and a screenshot's pixel at the screen's trailing edge
 * the ground painted there, on the host named
 * (`bun tools/drive-settings.ts web|ios`):
 *
 * - at launch, light and dark, the list's ground, a section's header, a
 *   hymn's row, and a hymn's page (its ground, title and topic) are the
 *   brand's roles;
 * - Dark chosen with the system light draws the list under the sheet dark
 *   at once; a relaunch on the kept store paints its first frame dark and
 *   the sheet shows Dark chosen; System then follows the system.
 *
 * A section's header is the platform's: the label on the web, the
 * secondary label on iOS (UIKit's grouped header), each the brand's. The
 * brand's colours are the current hymnal's theme (`app.tamber` is held to
 * it by `src/look/brand.test.ts`). The list, a hymn and the sheet are kept
 * in SHOTS, light and dark. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { pixelAt } from './pixel.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/settings');
const shotFile = (name: string) => join(shots, `${name}-${host}.png`);
const shot = (name: string) => `screenshot ${shotFile(name)}`;
/**
 * The machine as the kit's drive sees it, but that it signals only a run's
 * own process group when the run overruns (a negative pid), never a single
 * pid: the touch runner a run leaves on the shared simulator is the
 * orchestrator's to stop, not this drive's.
 */
const processes = {
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], { cwd, stdout: 'pipe', stderr: 'pipe', detached: true });
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
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};
const drive = makeDrive({ name: 'drive-settings', host, appDir: app, processes });

type Scheme = 'light' | 'dark';
type Role = keyof (typeof theme)['light'];

/** The header's role on this host: the platform's grouped header on iOS, the page's text on the web. */
const HEADER: Role = host === 'ios' ? 'muted' : 'ink';

/** A colour as its red, green and blue, 0 to 255, from `rgb(…)`, `rgba(…)` or `#rrggbb`; `[]` when it is none of them. */
const channels = (colour: string): ReadonlyArray<number> => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour);
  if (hex) return hex.slice(1, 4).map((pair) => Number.parseInt(pair, 16));
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/u.exec(colour);
  if (rgb) return rgb.slice(1, 4).map((part) => Math.round(Number(part)));
  return [];
};

type Style = Record<string, { value?: string } | undefined>;

/** A layout reply's node style, or none. */
const styleOf = (reply: unknown): Style =>
  (reply as { node?: { style?: Style } } | undefined)?.node?.style ?? {};

/** The scheme a layout reply's node is drawn in. */
const schemeOf = (reply: unknown) => styleOf(reply).color_scheme?.value ?? '';

/**
 * The colour a layout reply names for `property` (`text_color`): the web's
 * computed `rgb(…)`, or a native host's `light-dark(…)` read in the node's
 * scheme; "" where it names none.
 */
const colourOf = (reply: unknown, property: string): string => {
  const value = styleOf(reply)[property]?.value ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/u.exec(value);
  if (!pair) return value;
  return (schemeOf(reply) === 'dark' ? pair[2] : pair[1]) ?? '';
};

/** Whether `colour` is the brand's `role` in `scheme`, to the channel. */
const isRole = (colour: string, scheme: Scheme, role: Role) => {
  const got = channels(colour);
  const want = channels(theme[scheme][role]);
  return got.length === 3 && got.every((value, at) => Math.abs(value - (want[at] ?? -9)) <= 1);
};

const expectDrawn = (name: string, reply: unknown, scheme: Scheme, role: Role) => {
  const colour = colourOf(reply, 'text_color');
  drive.check(
    `${name} is drawn in the brand's ${scheme} ${role}`,
    isRole(colour, scheme, role),
    colour,
  );
};

/** A point at the screen's trailing edge, halfway down: inside every screen's padding, clear of its words and bars. */
const EDGE = { x: 0.985, y: 0.55 };

/** Checks the colour painted at `EDGE` in the shot `name` is the brand's `role`. */
const expectPainted = async (check: string, name: string, scheme: Scheme, role: Role) => {
  const painted = await pixelAt(shotFile(name), EDGE).catch(() => []);
  const colour = painted.length === 3 ? `rgb(${painted.join(', ')})` : '';
  drive.check(
    `${check} is painted the brand's ${scheme} ${role}`,
    isRole(colour, scheme, role),
    colour,
  );
};

const looks = (scheme: Scheme) => [
  `prefer prefers-color-scheme ${scheme}`,
  'clock settle',
  'layout section-adoration-and-praise',
  'layout hymn-1',
  shot(`list-${scheme}`),
];

const launched = await drive.launch('settings', [
  'clock data',
  ...looks('light'),
  ...looks('dark'),
  'tap hymn-1',
  'clock settle',
  'clock data',
  'layout hymn-topic',
  'layout hymn-title',
  shot('hymn-dark'),
  'prefer prefers-color-scheme light',
  'clock settle',
  'layout hymn-topic',
  'layout hymn-title',
  shot('hymn-light'),
  'back',
  'clock settle',
  'tap gear',
  'clock settle',
  'clock data',
  shot('sheet-light'),
  'tap appearance-dark',
  'clock settle',
  'clock data',
  'layout hymn-list',
  shot('sheet-dark'),
  'tap settings-done',
  'clock settle',
  shot('dark-at-once'),
]);

for (const [scheme, base] of [
  ['light', 1],
  ['dark', 6],
] as const) {
  await expectPainted(`at launch the list's ground`, `list-${scheme}`, scheme, 'ground');
  expectDrawn(`a section's header`, launched[base + 2], scheme, HEADER);
  expectDrawn(`a hymn's row`, launched[base + 3], scheme, 'ink');
}
expectDrawn(`a hymn's topic`, launched[14], 'dark', 'muted');
expectDrawn(`a hymn's title`, launched[15], 'dark', 'ink');
expectDrawn(`a hymn's topic`, launched[19], 'light', 'muted');
expectDrawn(`a hymn's title`, launched[20], 'light', 'ink');
await expectPainted(`a hymn's page ground`, 'hymn-dark', 'dark', 'ground');
await expectPainted(`a hymn's page ground`, 'hymn-light', 'light', 'ground');
await expectPainted(`the sheet's ground`, 'sheet-light', 'light', 'ground');
const under = launched[31];
drive.check(
  `Dark at once: the list under the sheet is drawn dark (the web's ground, a native host's scheme)`,
  isRole(colourOf(under, 'background_color'), 'dark', 'ground') || schemeOf(under) === 'dark',
  [colourOf(under, 'background_color'), schemeOf(under)],
);
await expectPainted(`Dark at once: the sheet`, 'sheet-dark', 'dark', 'ground');
await expectPainted(`Dark at once: the list`, 'dark-at-once', 'dark', 'ground');

const again = await drive.relaunch('settings', [
  'prefer prefers-color-scheme light',
  shot('first-frame'),
  'clock data',
  shot('kept'),
  'tap gear',
  'clock settle',
  'clock data',
  'state settingsLooks',
  'tap appearance-system',
  'clock settle',
  'clock data',
  'tap settings-done',
  'clock settle',
  'prefer prefers-color-scheme dark',
  'clock settle',
  shot('system-dark'),
  'prefer prefers-color-scheme light',
  'clock settle',
  shot('system-light'),
]);

await expectPainted(`kept: the first frame`, 'first-frame', 'dark', 'ground');
await expectPainted(`kept: the list`, 'kept', 'dark', 'ground');
const rows = again[7] as ReadonlyArray<{ value?: string; chosen?: boolean }> | undefined;
drive.check(
  'kept: the sheet shows Dark chosen',
  rows?.find((row) => row.chosen === true)?.value === 'dark',
  rows,
);
await expectPainted(`System follows a dark system`, 'system-dark', 'dark', 'ground');
await expectPainted(`System follows a light system`, 'system-light', 'light', 'ground');

process.exit(drive.finish());
